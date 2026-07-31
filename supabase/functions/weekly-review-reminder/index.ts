const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");

Deno.serve(async () => {
  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    return new Response(
      JSON.stringify({ error: "TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID chưa set trong Edge Function secrets" }),
      { status: 500 },
    );
  }

  const text =
    "🔔 Thứ Hai — đến giờ GRAPH 2 (Weekly Review).\n" +
    "Gõ với Claude: \"chạy weekly review\" để chạy 4 query Brain song song + số liệu tuần, " +
    "rồi duyệt trim/route/outcome như thường lệ.";

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Telegram error:", err);
    return new Response(JSON.stringify({ error: err }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
