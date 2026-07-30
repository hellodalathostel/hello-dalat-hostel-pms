// ops-guardian — watchdog giám sát các cron job / Edge Function khác.
//
// Nguyên tắc #4: Edge Function chỉ làm I/O. Toàn bộ logic phát hiện + chống spam
// nằm ở RPC public.guardian_scan(). Function này chỉ gọi RPC và gửi Telegram.
//
// Lịch chạy: cron mỗi 6 giờ tại 01:00/07:00/13:00/19:00 UTC
// = 08:00/14:00/20:00/02:00 ICT. Lần 08:00 ICT là báo cáo sáng.
//
// Quy tắc gửi tin:
//   - Có alert MỚI  -> gửi ngay, bất kể giờ nào.
//   - 08:00 ICT     -> luôn gửi tóm tắt, kể cả khi mọi thứ OK.
//                      Tin sáng vừa là báo cáo, vừa là bằng chứng guardian còn sống:
//                      im lặng buổi sáng = tín hiệu bất thường (dead-man's switch).
//   - Còn lại       -> im lặng, không làm phiền.

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

const JOB_NAME = "ops-guardian";

interface Issue {
  job_name: string;
  severity: string;
  issue: string;
  last_run_at: string | null;
  silent_for: string | null;
  last_error: string | null;
}

interface ScanResult {
  new_alerts: Issue[];
  all_issues: Issue[];
  ok_count: number;
  scanned_at: string;
}

/** Escape mọi text động trước khi chèn vào message HTML (bài học telegram-webhook v49). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Giờ hiện tại theo ICT (0-23). */
function hourICT(): number {
  return Number(
    new Date().toLocaleString("en-US", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      hour12: false,
    }),
  );
}

async function sendTelegram(text: string): Promise<void> {
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    },
  );
  // Bắt buộc check res.ok — Telegram 400 bị nuốt lặng lẽ nếu không check.
  if (!res.ok) {
    const body = await res.text();
    console.error(`[telegram] ${res.status}: ${body}`);
    throw new Error(`Telegram ${res.status}`);
  }
}

const ISSUE_LABEL: Record<string, string> = {
  never_run: "chưa từng chạy",
  silent: "im lặng quá lâu",
  error: "báo lỗi",
};

const SEVERITY_ICON: Record<string, string> = {
  "Khan": "🔴",
  "Cao": "🟠",
  "Binh Thuong": "🟡",
};

function formatIssue(i: Issue): string {
  const icon = SEVERITY_ICON[i.severity] ?? "⚪";
  const label = ISSUE_LABEL[i.issue] ?? i.issue;
  let line = `${icon} <b>${escapeHtml(i.job_name)}</b> — ${label}`;
  if (i.silent_for) line += `\n   Im lặng: ${escapeHtml(i.silent_for)}`;
  if (i.last_error) line += `\n   Lỗi: ${escapeHtml(i.last_error)}`;
  return line;
}

async function reportHeartbeat(
  supabase: SupabaseClient,
  startedAt: number,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase.rpc("report_automation_run", {
      p_job_name: JOB_NAME,
      p_status: "ok",
      p_duration_ms: Date.now() - startedAt,
      p_detail: detail,
      p_error_message: null,
    });
    if (error) console.error("[heartbeat] loi ghi:", error.message);
  } catch (e) {
    console.error("[heartbeat] exception:", e);
  }
}

Deno.serve(async (_req: Request) => {
  const startedAt = Date.now();

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data, error } = await supabase.rpc("guardian_scan");
    if (error) throw new Error(`guardian_scan: ${error.message}`);

    const scan = data as ScanResult;
    const newAlerts = scan.new_alerts ?? [];
    const allIssues = scan.all_issues ?? [];
    const isMorningReport = hourICT() === 8;

    let sent = false;

    if (newAlerts.length > 0) {
      // Có vấn đề MỚI -> báo ngay
      const lines = newAlerts.map(formatIssue).join("\n\n");
      await sendTelegram(
        `⚠️ <b>Ops Guardian — phát hiện sự cố</b>\n\n${lines}\n\n` +
          `Đang khoẻ: ${scan.ok_count} job`,
      );
      sent = true;
    } else if (isMorningReport) {
      // Báo cáo sáng — luôn gửi, kể cả khi OK (dead-man's switch)
      if (allIssues.length === 0) {
        await sendTelegram(
          `✅ <b>Ops Guardian — báo cáo sáng</b>\n\n` +
            `Tất cả ${scan.ok_count} job đang chạy bình thường.`,
        );
      } else {
        const lines = allIssues.map(formatIssue).join("\n\n");
        await sendTelegram(
          `📋 <b>Ops Guardian — báo cáo sáng</b>\n\n` +
            `Còn tồn ${allIssues.length} sự cố chưa xử lý:\n\n${lines}\n\n` +
            `Đang khoẻ: ${scan.ok_count} job`,
        );
      }
      sent = true;
    }

    // Heartbeat của chính guardian — ghi SAU cùng, sau khi mọi việc đã xong
    await reportHeartbeat(supabase, startedAt, {
      new_alerts: newAlerts.length,
      all_issues: allIssues.length,
      ok_count: scan.ok_count,
      telegram_sent: sent,
      morning_report: isMorningReport,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        new_alerts: newAlerts.length,
        all_issues: allIssues.length,
        ok_count: scan.ok_count,
        telegram_sent: sent,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ops-guardian] that bai:", msg);
    // KHÔNG ghi heartbeat khi thất bại — im lặng chính là tín hiệu để job khác phát hiện.
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
