import "@supabase/functions-js/edge-runtime.d.ts";
import { reportRun } from "../_shared/heartbeat.ts";
import { sendReport } from "../_shared/telegram-report.ts";

const JOB = "dk13-reminder";

Deno.serve(async () => {
  const t0 = performance.now();

  try {
    const msg = "🚔 <b>Nhắc nhở ĐK13 — Báo cáo an ninh quý</b>\n\nĐến hạn nộp báo cáo lưu trú quý cho Công an Phường Xuân Hương.\n• Điền mẫu ĐK13\n• Ký tên: Nguyễn Anh Minh\n• Nộp tại: Công an Phường Xuân Hương";

    await sendReport(msg, { parseMode: "HTML" });

    await reportRun(JOB, "ok", t0, {});

    return new Response("OK", { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${JOB} error:`, msg);
    await reportRun(JOB, "error", t0, null, msg);
    return new Response(msg, { status: 500 });
  }
});
