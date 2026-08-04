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

    // Ghi Google Sheets nếu có doanh thu.
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

    const formatted = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(total);
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
