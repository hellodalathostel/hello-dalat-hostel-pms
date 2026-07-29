// supabase/functions/deposit-sender/index.ts
// Gửi QR cọc (VietQR động) + info group vào Telegram để forward sang Zalo.
// Đơn vị = GROUP. Trigger: nút PMS thủ công + auto sau create_group_booking_txn.
// I/O thuần. Auth: verify_jwt (config.toml) + auth.getUser() fail-closed.
// Default cọc = tổng 1 đêm đầu group (decision 2026-06-12). Nhập tay override.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.0";

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
