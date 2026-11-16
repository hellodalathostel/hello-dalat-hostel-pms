import "@supabase/functions-js/edge-runtime.d.ts";
import { reportRun } from "../_shared/heartbeat.ts";

const JOB = "dk13-reminder";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

Deno.serve(async () => {
  const t0 = performance.now();

  try {
    const msg = "🚔 <b>Nhắc nhở ĐK13 — Báo cáo an ninh quý</b>\n\nĐến hạn nộp báo cáo lưu trú quý cho Công an Phường Xuân Hương.\n• Điền mẫu ĐK13\n• Ký tên: Nguyễn Anh Minh\n• Nộp tại: Công an Phường Xuân Hương";

    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      throw new Error(`Telegram sendMessage that bai: ${res.status} ${await res.text()}`);
    }

    await reportRun(JOB, "ok", t0, {});

    return new Response("OK", { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${JOB} error:`, msg);
    await reportRun(JOB, "error", t0, null, msg);
    return new Response(msg, { status: 500 });
  }
});
