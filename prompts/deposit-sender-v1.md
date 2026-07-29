# Bàn giao Claude Code CLI — deposit-sender v1

**Mục tiêu:** Sau khi tạo group booking → sinh VietQR động → gửi 1 ảnh + caption vào Telegram để Hiếu forward sang Zalo khách. Bỏ thao tác mở HTML + chụp màn hình.

**Kiến trúc:** Frontend orchestration → Edge Function → Telegram. Đơn vị xử lý = **group**. Không dùng DB webhook / pg_net.

**Default cọc:** tổng giá 1 đêm đầu của group (SUM `price_per_night` booking active). Cho nhập tay override. **KHÔNG dùng 30%.**

> ⚠️ Nguyên tắc: migration tạo qua `supabase migration new`, commit vào repo. KHÔNG apply trực tiếp qua MCP. Git là source of truth.

---

## BƯỚC 1 — Migration: RPC `get_group_deposit_info`

```bash
supabase migration new get_group_deposit_info
```

Ghi SQL sau vào file timestamp CLI vừa tạo:

```sql
-- RPC read-only: gom thông tin 1 GROUP để deposit-sender dựng QR cọc.
-- Đơn vị = group. Chỉ service_role gọi (Edge Function backend).
-- Harden: search_path='' + fully-qualified tên bảng.

CREATE OR REPLACE FUNCTION public.get_group_deposit_info(p_group_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT json_build_object(
    'group_id',       g.id,
    'customer_name',  g.customer_name,
    'source',         g.source::text,
    'status',         g.status,
    'grand_total',    g.grand_total,               -- tổng CẢ GROUP (trigger-synced)
    -- Tổng giá 1 đêm đầu = SUM(price_per_night) booking active. Default cọc auto.
    'first_night_total', (SELECT COALESCE(SUM(b.price_per_night), 0)::integer
                          FROM public.bookings b
                          WHERE b.group_id = g.id
                            AND b.is_deleted = false
                            AND b.status <> 'cancelled'),
    'paid',           g.paid,
    -- Mã CK: code booking active đầu tiên (bỏ qua cancelled)
    'ref_code',       (SELECT b.code FROM public.bookings b
                       WHERE b.group_id = g.id
                         AND b.is_deleted = false
                         AND b.status <> 'cancelled'
                       ORDER BY b.created_at ASC LIMIT 1),
    -- Danh sách phòng active
    'rooms',          (SELECT json_agg(json_build_object(
                          'room_name', r.name,
                          'check_in',  to_char(b.check_in,  'DD/MM/YYYY'),
                          'check_out', to_char(b.check_out, 'DD/MM/YYYY'),
                          'nights',    b.nights
                        ) ORDER BY b.check_in)
                       FROM public.bookings b
                       LEFT JOIN public.rooms r ON r.id = b.room_id
                       WHERE b.group_id = g.id
                         AND b.is_deleted = false
                         AND b.status <> 'cancelled')
  )
  FROM public.groups g
  WHERE g.id = p_group_id AND g.is_deleted = false;
$$;

REVOKE ALL ON FUNCTION public.get_group_deposit_info(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_group_deposit_info(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_group_deposit_info(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_deposit_info(uuid) TO service_role;
```

**Verify sau khi push** (chạy tay, không đưa vào migration):
```sql
SELECT has_function_privilege('anon', 'public.get_group_deposit_info(uuid)', 'EXECUTE');        -- phải false
SELECT has_function_privilege('authenticated', 'public.get_group_deposit_info(uuid)', 'EXECUTE'); -- phải false
SELECT has_function_privilege('service_role', 'public.get_group_deposit_info(uuid)', 'EXECUTE');  -- phải true
```

---

## BƯỚC 2 — config.toml

Thêm block vào `supabase/config.toml`:

```toml
[functions.deposit-sender]
enabled = true
verify_jwt = true
entrypoint = "./functions/deposit-sender/index.ts"
```

---

## BƯỚC 3 — Edge Function

Tạo file `supabase/functions/deposit-sender/index.ts`:

```typescript
// supabase/functions/deposit-sender/index.ts
// Gửi QR cọc (VietQR động) + info group vào Telegram để forward sang Zalo.
// Đơn vị = GROUP. Trigger: nút PMS thủ công + auto sau create_group_booking_txn.
// I/O thuần. Auth: verify_jwt (config.toml) + auth.getUser() fail-closed.
// Default cọc = tổng 1 đêm đầu group (decision 2026-06-12). Nhập tay override.

// ⚠️ Pin đúng version Supabase JS repo đang dùng (đối chiếu package.json / deno.json),
//    thay @2 bằng version cụ thể, ví dụ @2.45.0
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Secrets: fail-closed toàn bộ, KHÔNG fallback (nhất là bank account) ──
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Thiếu secret ${name}`);
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SERVICE_ROLE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const TELEGRAM_TOKEN = requireEnv("TELEGRAM_BOT_TOKEN");
const CHAT_ID = requireEnv("TELEGRAM_CHAT_ID");
const BANK_BIN = requireEnv("HOSTEL_BANK_BIN");
const BANK_ACCOUNT = requireEnv("HOSTEL_BANK_ACCOUNT");
const BANK_NAME_ENC = encodeURIComponent(requireEnv("HOSTEL_BANK_NAME"));

const AUTO_ALLOWED_SOURCES = ["Facebook", "Gọi điện/Zalo", "Khách quen"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Escape HTML cho Telegram parse_mode=HTML (Nguyên tắc 8)
function escapeHtml(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtVND(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + "đ";
}

function buildVietQrUrl(amount: number, addInfo: string): string {
  const info = encodeURIComponent(addInfo);
  return `https://img.vietqr.io/image/${BANK_BIN}-${BANK_ACCOUNT}-compact2.png`
    + `?amount=${Math.round(amount)}&addInfo=${info}&accountName=${BANK_NAME_ENC}`;
}

async function tgSendPhoto(body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // Luôn check res.ok để không nuốt 400 (Nguyên tắc 8)
  if (!res.ok) throw new Error(`Telegram sendPhoto lỗi ${res.status}: ${await res.text()}`);
}

interface RoomInfo { room_name: string; check_in: string; check_out: string; nights: number; }

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Auth fail-closed: bắt buộc user đăng nhập hợp lệ ──
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonRes({ ok: false, error: "Thiếu Authorization" }, 401);
    }
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonRes({ ok: false, error: "Không xác thực được người dùng" }, 401);
    }

    const payload = await req.json().catch(() => ({}));
    const groupId: string | undefined = payload.group_id;
    const isAuto: boolean = payload.auto === true;

    if (!groupId) return jsonRes({ ok: false, error: "Thiếu group_id" }, 400);

    // Validate deposit_amount runtime (nếu có truyền)
    let manualDeposit: number | undefined;
    if (payload.deposit_amount !== undefined) {
      const n = Number(payload.deposit_amount);
      if (!Number.isFinite(n) || n <= 0) {
        return jsonRes({ ok: false, error: "Số tiền cọc không hợp lệ" }, 400);
      }
      manualDeposit = n;
    }

    // Đọc group qua RPC (service_role)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data, error } = await admin.rpc("get_group_deposit_info", { p_group_id: groupId });
    if (error) throw new Error(`RPC get_group_deposit_info: ${error.message}`);
    if (!data) return jsonRes({ ok: false, error: "Không tìm thấy group" }, 404);

    const g = data as {
      customer_name: string; source: string; status: string;
      grand_total: number; first_night_total: number; paid: number;
      ref_code: string | null; rooms: RoomInfo[] | null;
    };

    // ── Chặn theo status ──
    if (isAuto) {
      // Auto: chỉ group active, nguồn cho phép, chưa thu tiền
      if (g.status !== "active") return jsonRes({ ok: true, skipped: `status=${g.status}` });
      if (!AUTO_ALLOWED_SOURCES.includes(g.source)) {
        return jsonRes({ ok: true, skipped: `source=${g.source}` });
      }
      if ((g.paid ?? 0) > 0) return jsonRes({ ok: true, skipped: "đã có paid" });
    } else {
      // Manual: chặn group đã hủy / đã checkout
      if (g.status === "cancelled" || g.status === "checked-out") {
        return jsonRes({ ok: false, error: `Không gửi cọc cho group ${g.status}` }, 400);
      }
    }

    // ── Validate dữ liệu group ──
    if (!g.grand_total || g.grand_total <= 0) {
      return jsonRes({ ok: false, error: "grand_total không hợp lệ" }, 400);
    }
    if (!g.ref_code) {
      return jsonRes({ ok: false, error: "Group không có booking active" }, 400);
    }
    if (!g.rooms?.length) {
      return jsonRes({ ok: false, error: "Group không có phòng active" }, 400);
    }

    // ── Cọc: thủ công nhập tay; auto = tổng 1 đêm đầu group (decision 12/06) ──
    const depositAmount = manualDeposit ?? g.first_night_total;

    // Không đoán: nếu 1 đêm đầu = 0 → báo lỗi thay vì gửi QR 0đ
    if (!depositAmount || depositAmount <= 0) {
      return jsonRes({ ok: false, error: "Không xác định được tiền cọc (giá 1 đêm đầu = 0)" }, 400);
    }

    // HARD-BLOCK: KHÔNG tự sửa tiền. Cọc vượt số còn lại → báo lỗi rõ ràng.
    const remaining = g.grand_total - (g.paid ?? 0);
    if (depositAmount > remaining) {
      return jsonRes({
        ok: false,
        error: `Tiền cọc ${fmtVND(depositAmount)} vượt số còn lại ${fmtVND(remaining)}`,
      }, 400);
    }

    // ── Dựng caption (escape text động) ──
    const transferNote = g.ref_code;
    const roomLines = g.rooms.map((r) =>
      `🛏 ${escapeHtml(r.room_name)}: ${escapeHtml(r.check_in)}→${escapeHtml(r.check_out)} (${r.nights} đêm)`
    ).join("\n");

    const caption =
      `🏨 <b>YÊU CẦU CỌC — ${escapeHtml(g.ref_code)}</b>\n\n` +
      `👤 ${escapeHtml(g.customer_name)}\n` +
      `${roomLines}\n\n` +
      `💰 Tổng: ${escapeHtml(fmtVND(g.grand_total))}\n` +
      `🔸 Cọc: <b>${escapeHtml(fmtVND(depositAmount))}</b>\n\n` +
      `🏦 Vietcombank — ${BANK_ACCOUNT}\n` +
      `📝 Nội dung CK: <code>${escapeHtml(transferNote)}</code>`;

    // 1 sendPhoto + caption đầy đủ — nguyên tử
    await tgSendPhoto({
      chat_id: CHAT_ID,
      photo: buildVietQrUrl(depositAmount, transferNote),
      caption,
      parse_mode: "HTML",
    });

    return jsonRes({ ok: true, ref_code: g.ref_code, deposit: depositAmount });
  } catch (e) {
    console.error("deposit-sender:", e);
    return jsonRes({ ok: false, error: String(e) }, 500);
  }
});
```

---

## BƯỚC 4 — Frontend hook `useSendDeposit`

Tạo file `src/features/bookings/hooks/useSendDeposit.ts`:

```typescript
// src/features/bookings/hooks/useSendDeposit.ts
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/api/supabase";
import { useAppFeedback } from "@/shared/hooks/useAppFeedback";
import { normalizeError } from "@/shared/utils/normalizeError";

interface SendDepositParams {
  groupId: string;
  depositAmount?: number; // undefined = auto (1 đêm đầu, tính ở backend)
  auto?: boolean;
}

export function useSendDeposit() {
  const { message } = useAppFeedback();

  return useMutation({
    mutationFn: async ({ groupId, depositAmount, auto }: SendDepositParams) => {
      const { data, error } = await supabase.functions.invoke("deposit-sender", {
        body: { group_id: groupId, deposit_amount: depositAmount, auto: auto ?? false },
      });
      if (error) throw error;
      if (!data?.ok && !data?.skipped) throw new Error(data?.error ?? "Gửi cọc thất bại");
      return data;
    },
    onSuccess: (data) => {
      if (data?.skipped) return; // auto bị skip — im lặng, không toast
      message.success(`Đã gửi QR cọc ${data.ref_code} vào Telegram`);
    },
    onError: (error) => {
      message.error(normalizeError(error).message);
    },
  });
}
```

---

## BƯỚC 5 — Chèn auto vào `useCreateBooking.ts`

Trong `src/features/bookings/hooks/useCreateBooking.ts`:

1. Import + khởi tạo hook:

```typescript
import { useSendDeposit } from "@/features/bookings/hooks/useSendDeposit";

// ...trong hook, cùng cấp với useMutation:
const sendDeposit = useSendDeposit();
```

2. Sửa `onSuccess`. RPC trả `{ success, group_id, booking_ids }`.

```typescript
onSuccess: async (result, variables) => {
  await Promise.all([
    // ⚠️ GIỮ NGUYÊN danh sách invalidateQueries hiện có của repo.
    // Chỉ thêm phần sendDeposit bên dưới, KHÔNG thay đổi các key sẵn có.
    queryClient.invalidateQueries({ queryKey: ["room-calendar"] }),
    queryClient.invalidateQueries({ queryKey: ["bookings"] }),
    queryClient.invalidateQueries({ queryKey: ["groups"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard", "today"] }),
  ]);

  // Auto gửi cọc — chỉ khi form KHÔNG ghi cọc sẵn. Backend vẫn skip nếu paid>0.
  // variables.deposit?.amount: CreateBookingMutationInput có deposit?: DepositInput | null
  if (result.group_id && !(variables.deposit?.amount > 0)) {
    sendDeposit.mutate({ groupId: result.group_id, auto: true });
  }
},
```

> ⚠️ Nếu key invalidate thật của repo khác danh sách trên, **giữ key thật**. Chỉ chèn block `sendDeposit`.

---

## BƯỚC 6 — Nút "Gửi lại cọc" thủ công

Gắn vào component chi tiết group (đối chiếu tên component thật). Có sẵn `group` (id, grand_total):

```tsx
import { useState } from "react";
import { Button, InputNumber, Space } from "antd";
import { SendOutlined } from "@ant-design/icons";
import { useSendDeposit } from "@/features/bookings/hooks/useSendDeposit";

// Giá trị gợi ý: để trống, Hiếu tự nhập.
// (Frontend chưa có first_night_total; KHÔNG hard-code 30%.)
const [deposit, setDeposit] = useState<number | null>(null);
const sendDeposit = useSendDeposit();

<Space.Compact>
  <InputNumber
    value={deposit}
    onChange={(v) => setDeposit(v)}
    min={0}
    step={50000}
    placeholder="Số tiền cọc"
    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
    parser={(v) => Number(v?.replace(/\./g, "") ?? 0)}
    addonAfter="đ"
    style={{ width: 160 }}
  />
  <Button
    type="primary"
    icon={<SendOutlined />}
    loading={sendDeposit.isPending}
    disabled={!deposit || deposit <= 0}
    onClick={() => sendDeposit.mutate({ groupId: group.id, depositAmount: deposit! })}
  >
    Gửi lại cọc
  </Button>
</Space.Compact>
```

---

## BƯỚC 7 — Set secrets + deploy

```bash
# Set secrets (bank + telegram). TELEGRAM_BOT_TOKEN đã có từ telegram-webhook.
supabase secrets set \
  TELEGRAM_CHAT_ID=-1003912419720 \
  HOSTEL_BANK_BIN=970436 \
  HOSTEL_BANK_ACCOUNT=9969975935 \
  HOSTEL_BANK_NAME="NGUYEN THANH HIEU"

# Apply migration + deploy function
supabase db push
supabase functions deploy deposit-sender
```

---

## TEST — 6 case, chạy qua nút thủ công TRƯỚC (auto tắt)

Chỉ bật auto trong `useCreateBooking` sau khi cả 6 pass:

1. **Group 1 phòng, nguồn direct** → 1 QR đúng, số tiền = giá 1 đêm phòng đó.
2. **Group nhiều phòng** → đúng **1 QR**, cọc = **tổng 1 đêm đầu cả group** (không phải 1 phòng). Đây là case bắt lỗi group-level gốc.
3. **Group nguồn Booking.com / Walk-in** (auto) → **skip**, không gửi.
4. **Group đã có paid > 0** (auto) → **skip**.
5. **Nút thủ công nhập số vượt số dư còn lại** → **báo lỗi, KHÔNG tự đổi tiền**.
6. **Nhập deposit_amount = 0 hoặc chữ** → **báo lỗi validate**.

Sau khi test qua nút OK → bật auto → tạo 1 booking direct thật → xác nhận chỉ 1 QR/group lên Telegram, quét thử đúng số tiền + nội dung CK = mã booking.

---

## Reference nhanh

- **Bank:** Vietcombank, BIN `970436`, STK `9969975935`, chủ TK Nguyễn Thanh Hiếu.
- **Telegram group:** `-1003912419720`.
- **Nội dung CK:** `bookings.code` (vd `HD260724202`).
- **Enum:** `bookings.status` = booked/cancelled/checked-in/checked-out. `groups.status` = active/confirmed/checked-out/cancelled.
- **VietQR API:** `https://img.vietqr.io/image/{BIN}-{ACCOUNT}-compact2.png?amount=&addInfo=&accountName=` (miễn phí, Telegram tự fetch).

## Scope v1 (đóng) vs v2

**v1 (bàn giao này):** tạo group → QR động → 1 ảnh Telegram + caption → nút gửi lại thủ công.

**v2 (chưa làm, gộp Ops Guardian):** phiếu xác nhận sau nhận cọc (trigger `record_payment_txn`), outbox log, reminder khi chưa gửi cọc, pilot tracking.