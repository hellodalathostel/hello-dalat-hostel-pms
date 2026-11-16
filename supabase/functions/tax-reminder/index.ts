import "@supabase/functions-js/edge-runtime.d.ts";
import { reportRun } from "../_shared/heartbeat.ts";
import { sendReport } from "../_shared/telegram-report.ts";

Deno.serve(async (req) => {
  const t0 = performance.now();

  // Ca dac biet: 1 function phuc vu 2 dong registry (tax-reminder-15 / -20).
  // Fallback ngay hien tai (gio VN) de chay tay khong kem body van ghi dung dong —
  // khong co fallback thi mot trong hai dong nam never_run vinh vien.
  const body = await req.json().catch(() => ({}));
  const day: number = Number(body?.day) ||
    Number(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(8, 10));
  const JOB = day >= 20 ? "tax-reminder-20" : "tax-reminder-15";

  try {
    const msg = day === 15
      ? "📊 <b>Nhắc nhở thuế — ngày 15</b>\n\nChuẩn bị hồ sơ kê khai thuế tháng này.\n• Kiểm tra doanh thu tháng\n• Tính thuế môn bài + TNCN\n• Chuẩn bị Mẫu 01 TKN-CNKD"
      : "📊 <b>Nhắc nhở thuế — ngày 20</b>\n\nHạn nộp thuế hôm nay!\n• Nộp Mẫu 01 TKN-CNKD\n• Nộp tiền thuế qua ngân hàng\n• Lưu biên lai";

    await sendReport(msg, { parseMode: "HTML" });

    await reportRun(JOB, "ok", t0, { day });

    return new Response("OK", { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${JOB} error:`, msg);
    await reportRun(JOB, "error", t0, null, msg);
    return new Response(msg, { status: 500 });
  }
});
