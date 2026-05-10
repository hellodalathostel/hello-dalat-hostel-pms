import "@supabase/functions-js/edge-runtime.d.ts";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

Deno.serve(async () => {
  const msg = "🚔 <b>Nhắc nhở ĐK13 — Báo cáo an ninh quý</b>\n\nĐến hạn nộp báo cáo lưu trú quý cho Công an Phường Xuân Hương.\n• Điền mẫu ĐK13\n• Ký tên: Nguyễn Anh Minh\n• Nộp tại: Công an Phường Xuân Hương";

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: "HTML" }),
  });

  return new Response("OK", { status: 200 });
});
