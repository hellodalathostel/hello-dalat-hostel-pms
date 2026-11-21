import { reportRun } from "../_shared/heartbeat.ts";
import { sendReport } from "../_shared/telegram-report.ts";

const JOB = "weekly-review-reminder";

Deno.serve(async () => {
  const t0 = performance.now();

  try {
    const text =
      "🔔 Thứ Hai — đến giờ GRAPH 2 (Weekly Review).\n" +
      "Gõ với Claude: \"chạy weekly review\" để chạy 4 query Brain song song + số liặu tuần, " +
      "rối duyệt trim/route/outcome như thường lệ.";

    await sendReport(text);

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
