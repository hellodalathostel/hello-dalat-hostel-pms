import { reportRun } from "../_shared/heartbeat.ts";

const JOB = "weekly-review-reminder";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");

Deno.serve(async () => {
  const t0 = performance.now();

  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    const msg = "TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID chưa set trong Edge Function secrets";
    await reportRun(JOB, "error", t0, null, msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }

  try {
    const text =
      "🔔 Thứ Hai — đến giờ GRAPH 2 (Weekly Review).\n" +
      "Gõ với Claude: \"chạy weekly review\" để chạy 4 query Brain song song + số liặu tuần, " +
      "rối duyệt trim/route/outcome như thường lệ.";

    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Telegram error:", err);
      await reportRun(JOB, "error", t0, null, err);
      return new Response(JSON.stringify({ error: err }), { status: 500 });
    }

    await reportRun(JOB, "ok", t0, {});

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${JOB} error:`, msg);
    await reportRun(JOB, "error", t0, null, msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
