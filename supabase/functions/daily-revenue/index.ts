import "@supabase/functions-js/edge-runtime.d.ts";
import { reportRun } from "../_shared/heartbeat.ts";
import { sendReport } from "../_shared/telegram-report.ts";

const JOB = "daily-revenue";

const SHEETS_ID = Deno.env.get("GOOGLE_SHEETS_ID")!;
const SHEETS_TOKEN = Deno.env.get("GOOGLE_SHEETS_TOKEN")!;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendTelegram(message: string) {
  await sendReport(message, { parseMode: "HTML" });
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
    // sheetsError = ly do ngan (khong chua URL/token) khi append that bai, null neu thanh cong.
    let sheetsError: string | null = null;
    if (total > 0) {
      try {
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
          sheetsError = `Google Sheets tra HTTP ${sheetsRes.status}`;
        }
      } catch (e) {
        // Loi mang cua Deno chua nguyen URL -> chi lay ten loi, khong dua message vao tin nhan
        console.error("Ghi Google Sheets loi mang:", e instanceof Error ? e.name : String(e));
        sheetsError = `Loi mang khi goi Google Sheets (${e instanceof Error ? e.name : "unknown"})`;
      }
    }

    const formatted = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(total);
    // Label ro rang: day la DOANH THU GHI NHAN theo check_in (moc thue/So S1a),
    // khac voi "TIEN THU DUOC" trong room-report-bot (tien mat thuc te tu payment_history).
    // Hai con so nay khong bao gio bang nhau — dung thiet ke.
    const sheetsLine = sheetsError
      ? `⚠️ <b>CHƯA ghi được vào Sổ doanh thu</b>: ${escapeHtml(sheetsError)}`
      : `📋 Đã ghi vào Sổ doanh thu`;
    const msg = total > 0
      ? `💰 <b>Doanh thu ghi nhận ${todayVN}</b>\n${formatted}\n<i>(theo check-in — mốc Sổ S1a)</i>\n${sheetsLine}`
      : `📋 <b>Doanh thu ghi nhận ${todayVN}</b>\nKhông có doanh thu hôm nay`;

    await sendTelegram(msg);

    // Append Sheets that bai -> van da gui so lieu, nhung heartbeat phai bao loi de ops-guardian thay
    if (sheetsError) {
      await reportRun(JOB, "error", t0, { total_revenue: total, date: today }, sheetsError);
      return new Response(sheetsError, { status: 500 });
    }

    await reportRun(JOB, "ok", t0, { total_revenue: total, date: today });

    return new Response("OK", { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${JOB} error:`, msg);
    await reportRun(JOB, "error", t0, null, msg);
    return new Response(msg, { status: 500 });
  }
});
