import "@supabase/functions-js/edge-runtime.d.ts";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

Deno.serve(async (req) => {
  const { day } = await req.json().catch(() => ({}));

  const msg = day === 15
    ? "📊 <b>Nhắc nhở thuế — ngày 15</b>\n\nChuẩn bị hồ sơ kê khai thuế tháng này.\n• Kiểm tra doanh thu tháng\n• Tính thuế môn bài + TNCN\n• Chuẩn bị Mẫu 01 TKN-CNKD"
    : "📊 <b>Nhắc nhở thuế — ngày 20</b>\n\nHạn nộp thuế hôm nay!\n• Nộp Mẫu 01 TKN-CNKD\n• Nộp tiền thuế qua ngân hàng\n• Lưu biên lai";

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: "HTML" }),
  });

  return new Response("OK", { status: 200 });
});
