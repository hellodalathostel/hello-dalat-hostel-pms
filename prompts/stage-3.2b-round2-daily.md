# Ops Guardian — Stage 3.2b, Đợt 2 (nhóm daily)

Repo: `D:\hello-dalat-hostel-pms`
Đợt 1 (`email-transaction-sync`) đã xong, đã confirm row `ok` từ cron thật,
cờ `heartbeat_enabled` đang chờ Claude.ai bật qua MCP.

Đợt 2 gồm 5 function, tất cả đã đọc source thật từ Supabase remote (KHÔNG đoán):
`checkin-reminder`, `room-report-bot`, `daily-revenue`, `daily-revenue-summary`,
`notion-daily-log`.

---

## Nguyên tắc chung — áp dụng cho cả 5 file

1. **Mọi return lỗi bên trong khối logic chính phải đổi thành `throw new Error(...)`
   với cùng message**, để rơi vào một catch/reportRun duy nhất ở ngoài cùng.
   Nhiều file trong đợt này viết theo kiểu "return Response lỗi ngay tại chỗ phát
   hiện" — cách đó khiến lỗi không bao giờ chạm heartbeat vì hàm thoát trước khi
   tới dòng reportRun ở cuối.

2. **`status` chỉ nhận `'ok'` hoặc `'error'`** (check constraint DB, đã verify).
   Không dùng `'skipped'`. Nhánh "không có gì để làm" (không ai check-in, không
   doanh thu, v.v.) vẫn là **`ok`** kèm `detail` mô tả — đây là chạy thành công,
   không phải lỗi.

3. **Auth-reject (401 do sai `CRON_SECRET`/JWT) KHÔNG gọi `reportRun`.**
   Đây là từ chối truy cập trước khi vào nghiệp vụ, không phải job thất bại.
   Ghi `error` ở đây sẽ tạo alert giả mỗi khi ai đó gọi nhầm URL.

4. Giữ nguyên 100% logic nghiệp vụ, định dạng tin nhắn, câu chữ tiếng Việt.
   Không refactor ngoài phạm vi heartbeat.

5. Deploy xong đợi 1 chu kỳ chạy thật (không kích tay trừ khi cần gấp), xác nhận
   có row `ok` trong `automation.automation_runs`, rồi báo Claude.ai bật cờ.

---

## 1. `checkin-reminder` — cron 07:00 ICT hằng ngày

Đã có try/catch? KHÔNG — phải thêm mới toàn bộ.
Có bug tồn tại: `sendTelegram` không check `res.ok` (vi phạm nguyên tắc cốt lõi #8
về Telegram HTML 400 bị nuốt lặng lẽ) — ĐÃ ĐƯỢC PHÊ DUYỆT sửa luôn trong lần này.

Toàn văn `supabase/functions/checkin-reminder/index.ts` sau khi sửa:

```ts
import "@supabase/functions-js/edge-runtime.d.ts";
import { reportRun } from "../_shared/heartbeat.ts";

const JOB = "checkin-reminder";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

async function sendTelegram(message: string) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    throw new Error(`Telegram sendMessage that bai: ${res.status} ${await res.text()}`);
  }
}

Deno.serve(async (_req) => {
  const t0 = performance.now();

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date().toISOString().split("T")[0];

    const { data: checkIns, error: errIn } = await supabase
      .from("bookings")
      .select("guest_name, room_id, guests_count")
      .eq("check_in", today)
      .in("status", ["booked", "checked-in"])
      .eq("is_deleted", false)
      .order("room_id");
    if (errIn) throw new Error(`Query check-in that bai: ${errIn.message}`);

    const { data: checkOuts, error: errOut } = await supabase
      .from("bookings")
      .select("guest_name, room_id")
      .eq("check_out", today)
      .in("status", ["checked-in"])
      .eq("is_deleted", false)
      .order("room_id");
    if (errOut) throw new Error(`Query check-out that bai: ${errOut.message}`);

    let msg = `🌅 <b>Hello Dalat — ${today}</b>\n\n`;

    if (checkIns && checkIns.length > 0) {
      msg += `📥 <b>CHECK-IN HÔM NAY (${checkIns.length})</b>\n`;
      for (const b of checkIns) {
        msg += `• Phòng ${b.room_id} — ${b.guest_name} (${b.guests_count} khách)\n`;
      }
      msg += "\n";
    } else {
      msg += "📥 Không có check-in hôm nay\n\n";
    }

    if (checkOuts && checkOuts.length > 0) {
      msg += `📤 <b>CHECK-OUT HÔM NAY (${checkOuts.length})</b>\n`;
      for (const b of checkOuts) {
        msg += `• Phòng ${b.room_id} — ${b.guest_name}\n`;
      }
    } else {
      msg += "📤 Không có check-out hôm nay";
    }

    await sendTelegram(msg);

    await reportRun(JOB, "ok", t0, {
      checkin_count: checkIns?.length ?? 0,
      checkout_count: checkOuts?.length ?? 0,
    });

    return new Response("OK", { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${JOB} error:`, msg);
    await reportRun(JOB, "error", t0, null, msg);
    return new Response(msg, { status: 500 });
  }
});
```

---

## 2. `room-report-bot` — cron 08:00 ICT hằng ngày

Lưu ý đặc biệt: `verify_jwt=false` trên remote (public, không cần Bearer khi test
tay). File gốc dùng `// @ts-nocheck` — GIỮ NGUYÊN dòng đó. Có check `error` sẵn
nhưng trả Response trực tiếp thay vì throw — sửa thành throw.

Toàn văn `supabase/functions/room-report-bot/index.ts` sau khi sửa:

```ts
// @ts-nocheck
import { reportRun } from "../_shared/heartbeat.ts";

const JOB = "room-report-bot";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
const TOTAL_ROOMS_FALLBACK = 8;

Deno.serve(async () => {
  const t0 = performance.now();

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const yd = new Date();
    yd.setDate(yd.getDate() - 1);
    const yesterday = yd.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

    const sel = "room_id, check_in, check_out, status, guests_count, guest_name, groups ( source ), rooms ( name )";

    const [occ_, co, pay, roomsRes] = await Promise.all([
      supabase.from("bookings").select(sel).lte("check_in", today).gt("check_out", today).in("status", ["booked", "checked-in"]).eq("is_deleted", false).order("room_id"),
      supabase.from("bookings").select(sel).eq("check_out", today).eq("status", "checked-in").eq("is_deleted", false).order("room_id"),
      supabase.from("payment_history").select("amount, method").eq("date", yesterday).eq("is_void", false),
      supabase.from("rooms").select("id").eq("is_active", true),
    ]);

    if (occ_.error || co.error || pay.error || roomsRes.error) {
      const e = occ_.error ?? co.error ?? pay.error ?? roomsRes.error;
      throw new Error(`Query that bai: ${e.message}`);
    }

    const occupiedRows = occ_.data ?? [];
    const ci = occupiedRows.filter((b) => b.check_in === today);
    const st = occupiedRows.filter((b) => b.check_in < today);

    const fmt = (b) => {
      const room = b.rooms?.name ?? b.room_id;
      const name = b.guest_name ?? "Chua dat ten";
      const guests = b.guests_count ?? 1;
      const src = b.groups?.source ?? "";
      const sp = src ? " [" + src + "]" : "";
      return "  \u2022 " + room + " \u2014 " + name + " (" + guests + " kh\u00e1ch)" + sp;
    };

    const payData = pay.data ?? [];
    const totalRev = payData.reduce((s, p) => s + (p.amount ?? 0), 0);
    const byMethod = {};
    for (const p of payData) byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;

    const fmtVND = (n) => n.toLocaleString("vi-VN") + "\u0111";
    const mLines = Object.entries(byMethod).map(([m, a]) => "  \u2022 " + m + ": " + fmtVND(a));

    const TOTAL_ROOMS = roomsRes.data?.length ?? TOTAL_ROOMS_FALLBACK;
    const occSet = new Set(occupiedRows.map((b) => b.room_id));
    const occ = occSet.size;
    const pct = TOTAL_ROOMS > 0 ? Math.round((occ / TOTAL_ROOMS) * 100) : 0;

    const dLabel = new Date().toLocaleDateString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit", month: "2-digit", year: "numeric",
    });
    const ydLabel = new Date(yesterday + "T12:00:00+07:00").toLocaleDateString("vi-VN", {
      day: "2-digit", month: "2-digit",
    });

    const lines = [
      "\ud83d\udccb <b>B\u00e1o c\u00e1o \u2014 " + dLabel + "</b>",
      "",
      "\ud83d\udfe2 <b>CHECK-IN h\u00f4m nay (" + ci.length + ")</b>",
      ...(ci.length > 0 ? ci.map(fmt) : ["  <i>Kh\u00f4ng c\u00f3</i>"]),
      "",
      "\ud83d\udd34 <b>CHECK-OUT h\u00f4m nay (" + (co.data?.length ?? 0) + ")</b>",
      ...((co.data?.length ?? 0) > 0 ? co.data.map(fmt) : ["  <i>Kh\u00f4ng c\u00f3</i>"]),
      "",
      "\ud83c\udfe0 <b>\u0110ANG L\u01afU TR\u00da (" + st.length + ")</b>",
      ...(st.length > 0 ? st.map(fmt) : ["  <i>Kh\u00f4ng c\u00f3</i>"]),
      "",
      "\ud83d\udcb0 <b>DOANH THU " + ydLabel + "</b>",
      "  \u2022 T\u1ed5ng: <b>" + fmtVND(totalRev) + "</b>",
      ...(mLines.length > 0 ? mLines : ["  \u2022 <i>Ch\u01b0a c\u00f3 giao d\u1ecbch</i>"]),
      "",
      "\ud83d\udcca C\u00f4ng su\u1ea5t h\u00f4m nay: " + occ + "/" + TOTAL_ROOMS + " ph\u00f2ng (" + pct + "%)",
    ];

    const tgRes = await fetch(
      "https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text: lines.join("\n"), parse_mode: "HTML" }),
      },
    );

    if (!tgRes.ok) {
      const err = await tgRes.text();
      throw new Error(`Telegram sendMessage that bai: ${tgRes.status} ${err}`);
    }

    await reportRun(JOB, "ok", t0, {
      occupancy_pct: pct,
      revenue: totalRev,
      check_ins: ci.length,
      staying: st.length,
    });

    return new Response(
      JSON.stringify({ ok: true, date: today, revenue: totalRev, occupancy: pct, check_ins: ci.length, staying: st.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${JOB} error:`, msg);
    await reportRun(JOB, "error", t0, null, msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
```

---

## 3. `daily-revenue` — cron 23:00 ICT hằng ngày (khác giờ các job khác, chạy cuối ngày)

Có sẵn `SHEETS_ID`/`SHEETS_TOKEN` ghi Google Sheets — đây là ghi PHỤ, không phải
nghiệp vụ chính. Quyết định: lỗi Sheets chỉ log console, KHÔNG throw (không được
làm cron báo job chết trong khi Telegram vẫn gửi đúng). Nếu Hiếu muốn đổi thành
throw, hỏi lại trước khi tự sửa.

Toàn văn `supabase/functions/daily-revenue/index.ts` sau khi sửa:

```ts
import "@supabase/functions-js/edge-runtime.d.ts";
import { reportRun } from "../_shared/heartbeat.ts";

const JOB = "daily-revenue";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;
const SHEETS_ID = Deno.env.get("GOOGLE_SHEETS_ID")!;
const SHEETS_TOKEN = Deno.env.get("GOOGLE_SHEETS_TOKEN")!;

async function sendTelegram(message: string) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    throw new Error(`Telegram sendMessage that bai: ${res.status} ${await res.text()}`);
  }
}

Deno.serve(async (_req) => {
  const t0 = performance.now();

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date().toISOString().split("T")[0];
    const todayVN = today.split("-").reverse().join("/");

    const { data, error } = await supabase
      .from("bookings")
      .select("grand_total")
      .eq("check_in", today)
      .in("status", ["booked", "checked-in", "checked-out"])
      .eq("is_deleted", false);
    if (error) throw new Error(`Query bookings that bai: ${error.message}`);

    const total = data?.reduce((sum, b) => sum + (b.grand_total || 0), 0) ?? 0;

    if (total > 0) {
      const sheetsRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_ID}/values/S1a-HKD!A:C:append?valueInputOption=USER_ENTERED`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SHEETS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            values: [[todayVN, "Doanh thu phòng", total]],
          }),
        },
      );
      if (!sheetsRes.ok) {
        console.error(`Ghi Google Sheets that bai: ${sheetsRes.status} ${await sheetsRes.text()}`);
      }
    }

    const formatted = total.toLocaleString("vi-VN");
    const msg = total > 0
      ? `💰 <b>Doanh thu ${todayVN}</b>\n${formatted} đ\n📋 Đã ghi vào Sổ doanh thu`
      : `📋 <b>${todayVN}</b>\nKhông có doanh thu hôm nay`;

    await sendTelegram(msg);

    await reportRun(JOB, "ok", t0, { total_revenue: total, date: today });

    return new Response("OK", { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${JOB} error:`, msg);
    await reportRun(JOB, "error", t0, null, msg);
    return new Response(msg, { status: 500 });
  }
});
```

---

## 4. `daily-revenue-summary` — no CRON đọc header `CRON_SECRET` qua `Authorization`

CHÚ Ý: khác `email-transaction-sync` (dùng header `x-cron-key` riêng), function
này check thẳng `Authorization: Bearer <CRON_SECRET>` — không phải service_role
JWT. Test tay phải dùng đúng cơ chế này.

`verify_jwt=false` trên remote — cổng Supabase không chặn, chỉ có check thủ công
trong code mới chặn.

Toàn văn `supabase/functions/daily-revenue-summary/index.ts` sau khi sửa:

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { reportRun } from '../_shared/heartbeat.ts'

const JOB = 'daily-revenue-summary'

serve(async (req) => {
  const t0 = performance.now()

  const authHeader = req.headers.get('Authorization')
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    // 401 KHONG goi reportRun - tu choi truy cap, khong phai job that bai.
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabasePublic = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const url = new URL(req.url)
    const dateParam = url.searchParams.get('date')

    let targetDate: string
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      targetDate = dateParam
    } else {
      const nowICT = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })
      )
      nowICT.setDate(nowICT.getDate() - 1)
      targetDate = nowICT.toISOString().split('T')[0]
    }

    const { count: activeRoomsCount, error: roomsError } = await supabasePublic
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
    if (roomsError) throw new Error('rooms count: ' + roomsError.message)

    const TOTAL_ROOMS = activeRoomsCount ?? 8

    const { data: payments, error: pmError } = await supabasePublic
      .from('payment_history')
      .select('amount, method, group_id')
      .eq('date', targetDate)
    if (pmError) throw new Error('payment_history: ' + pmError.message)

    const totalRevenue = payments?.reduce((sum, p) => sum + (p.amount ?? 0), 0) ?? 0
    const revenueByMethod: Record<string, number> = {}
    for (const p of payments ?? []) {
      revenueByMethod[p.method] = (revenueByMethod[p.method] || 0) + p.amount
    }

    const { data: checkIns, error: ciError } = await supabasePublic
      .from('bookings')
      .select('id, room_id, grand_total, group_id, status')
      .eq('check_in', targetDate)
      .eq('is_deleted', false)
      .neq('status', 'cancelled')
    if (ciError) throw new Error('bookings check_in: ' + ciError.message)

    const { data: stayovers, error: soError } = await supabasePublic
      .from('bookings')
      .select('id, room_id')
      .lt('check_in', targetDate)
      .gt('check_out', targetDate)
      .eq('is_deleted', false)
      .neq('status', 'cancelled')
    if (soError) throw new Error('bookings stayover: ' + soError.message)

    const groupIds = [...new Set((checkIns ?? []).map((b) => b.group_id).filter(Boolean))]
    let sourceBreakdown: Record<string, number> = {}

    if (groupIds.length > 0) {
      const { data: groups } = await supabasePublic
        .from('groups')
        .select('id, source')
        .in('id', groupIds)

      for (const g of groups ?? []) {
        const src = g.source ?? 'unknown'
        sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1
      }
    }

    const occupiedRooms = (checkIns?.length ?? 0) + (stayovers?.length ?? 0)

    const summary = {
      date: targetDate,
      total_revenue: totalRevenue,
      revenue_by_method: revenueByMethod,
      num_transactions: payments?.length ?? 0,
      num_check_ins: checkIns?.length ?? 0,
      num_stayovers: stayovers?.length ?? 0,
      occupied_rooms: occupiedRooms,
      total_rooms: TOTAL_ROOMS,
      occupancy_rate: Math.round((occupiedRooms / TOTAL_ROOMS) * 100),
      check_in_sources: sourceBreakdown,
      generated_at: new Date().toISOString(),
    }

    const { error: logError } = await supabasePublic.rpc('upsert_brain_daily_log', {
      p_log_date: targetDate,
      p_category: 'revenue_summary',
      p_content: JSON.stringify(summary),
      p_source: 'edge-function',
    })
    if (logError) throw new Error('insert log: ' + logError.message)

    await reportRun(JOB, 'ok', t0, {
      date: targetDate,
      total_revenue: totalRevenue,
      occupancy_rate: summary.occupancy_rate,
    })

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`${JOB} error:`, msg)
    await reportRun(JOB, 'error', t0, null, msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
})
```

---

## 5. `notion-daily-log` — file dài nhất, sửa theo hướng dẫn thay vì chép toàn văn

File này ĐÃ CÓ try/catch bao ngoài đúng cách (khác 3 file trên). KHÔNG cần viết
lại toàn bộ — chỉ áp 4 thay đổi sau vào file hiện có ở
`supabase/functions/notion-daily-log/index.ts`:

### 5a. Thêm import + khai báo JOB, t0

Ngay sau dòng `import { createClient } from "jsr:@supabase/supabase-js@2";`, thêm:

```ts
import { reportRun } from "../_shared/heartbeat.ts";

const JOB = "notion-daily-log";
```

Ngay sau `Deno.serve(async () => {` mở đầu, dòng đầu tiên bên trong (trước `try {`):

```ts
const t0 = performance.now();
```

### 5b. Đổi TẤT CẢ return lỗi bên trong try thành throw

Có đúng 6 điểm return lỗi hiện tại (kiểu `return new Response(JSON.stringify({error:...}), {status:500})`
hoặc `{status:500}` không kèm header). Đổi cả 6 thành `throw new Error(<cùng message>)`:

1. Thiếu `NOTION_TOKEN` → `throw new Error("NOTION_TOKEN chua set trong Edge Function secrets")`
2. Thiếu `NOTION_DAILY_OPS_DB_ID` → `throw new Error("NOTION_DAILY_OPS_DB_ID chua set trong Edge Function secrets")`
3. Trong vòng `for (const [name, res] of checks)` → thay
   `return new Response(JSON.stringify({error: ...}), {status:500})`
   bằng `throw new Error(\`Query ${name} failed: ${(res.error as Error).message}\`)`
4. Notion API lỗi (`if (!pageRes.ok)`) → thay return bằng
   `throw new Error(\`Notion API error: ${errText}\`)`

KHÔNG đổi đoạn `queryRes` (query page cũ để archive) — nhánh đó cố tình không
chặn khi lỗi (`console.error(...) // khong chan tao moi`), giữ nguyên hành vi đó.

KHÔNG đổi lời gọi RPC `log_automation_run` — nó đã tự log lỗi console mà không
throw, đây là quyết định cũ, giữ nguyên.

### 5c. Thêm reportRun 'ok' trước return thành công cuối hàm

Ngay trước dòng `return new Response(JSON.stringify({ok: true, version: 8, ...`
ở cuối, thêm:

```ts
await reportRun(JOB, "ok", t0, {
  occupancy_pct: pct,
  check_ins: ci.length,
  check_outs: co.length,
  has_incident: hasIncident,
});
```

### 5d. Thêm reportRun 'error' trong catch cuối cùng đã có sẵn

Catch hiện tại:

```ts
} catch (err) {
  console.error("notion-daily-log error:", err instanceof Error ? err.stack : String(err));
  const message = err instanceof Error ? err.message : String(err);
  return new Response(JSON.stringify({ error: message }), { status: 500 });
}
```

Sửa thành:

```ts
} catch (err) {
  console.error("notion-daily-log error:", err instanceof Error ? err.stack : String(err));
  const message = err instanceof Error ? err.message : String(err);
  await reportRun(JOB, "error", t0, null, message);
  return new Response(JSON.stringify({ error: message }), { status: 500 });
}
```

---

## Checklist trước khi báo xong đợt 2

- [ ] Cả 5 file đã sửa, nghiệp vụ gốc không đổi (đặc biệt: tin nhắn Telegram,
      cấu trúc Notion page, format Google Sheets giữ nguyên 100%)
- [ ] `checkin-reminder`: đã thêm check `res.ok` cho Telegram (đã duyệt)
- [ ] `daily-revenue`: lỗi Google Sheets chỉ log, KHÔNG throw (theo quyết định)
- [ ] `daily-revenue-summary`: nhánh 401 KHÔNG gọi reportRun
- [ ] `notion-daily-log`: cả 6 điểm return lỗi cũ đã đổi thành throw
- [ ] `npx tsc --noEmit` hoặc `deno check` (biết trước: sandbox có thể không
      resolve được `jsr:` — nếu vậy, xác nhận lỗi giống hệt file
      `ops-guardian/index.ts` không sửa để chứng minh không phải do bản vá)
- [ ] Deploy cả 5 function
- [ ] Đợi 1 chu kỳ chạy thật (giờ cron: checkin-reminder 07:00, room-report-bot
      08:00, daily-revenue 23:00, daily-revenue-summary — xem lại lịch cron
      thực tế qua `cron.job`, notion-daily-log 06:30)
- [ ] Xác nhận 5 row `ok` trong `automation.automation_runs`
- [ ] Commit theo Conventional Commits, có thể tách hoặc gộp tuỳ độ liên quan

---

## Việc của Claude.ai (không phải việc của Claude Code)

Sau khi có đủ 5 row `ok`, Claude.ai sẽ bật `heartbeat_enabled=true` cho cả 5 dòng
registry cùng lúc qua Supabase MCP. Claude Code không tự chạy UPDATE này.
