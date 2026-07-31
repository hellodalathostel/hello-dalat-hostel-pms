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

interface SemanticResult {
  job_name: string;
  verdict: "pass" | "fail" | "unknown" | "skipped";
  run_id?: string;
  run_at?: string;
  alert_created?: boolean;
  semantic_enabled?: boolean;
  reason?: string;
  result?: {
    validator?: string;
    verdict?: string;
    task_date?: string;
    expected_min?: number;
    actual?: number;
    reason?: string;
    message?: string;
  };
}

interface SemanticScan {
  checked: number;
  failed: number;
  unknown: number;
  results: SemanticResult[];
}

interface ResolvedAlert {
  job_name: string;
  alert_type: string;
  alerted_at: string;
  open_for: string;
}

interface ResolvedBlock {
  resolved_count: number;
  resolved: ResolvedAlert[];
}

interface ScanResult {
  new_alerts: Issue[];
  all_issues: Issue[];
  ok_count: number;
  scanned_at: string;
  semantic?: SemanticScan;
  resolved?: ResolvedBlock;
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

/**
 * Render phần semantic check + auto-resolve cho báo cáo sáng.
 * Trả về "" nếu không có gì đáng báo — để không làm báo cáo dài vô ích.
 */
function renderSemanticBlock(scan: ScanResult): string {
  const lines: string[] = [];
  const results: SemanticResult[] = scan.semantic?.results ?? [];

  const failed = results.filter((r) => r.verdict === "fail");
  const unknown = results.filter((r) => r.verdict === "unknown");

  // Job chạy nhưng làm sai — nghiêm trọng nhất, đặt lên đầu
  if (failed.length > 0) {
    lines.push("\n🔴 <b>Job chạy nhưng làm sai</b>");
    for (const f of failed) {
      const msg = f.result?.message ?? f.result?.reason ?? "không rõ";
      lines.push(`• <b>${escapeHtml(f.job_name)}</b>: ${escapeHtml(msg)}`);
    }
  }

  // Không đủ dữ liệu để kết luận — không tạo alert, chỉ báo để biết
  if (unknown.length > 0) {
    lines.push("\n⚪ <b>Chưa đủ dữ liệu để kết luận</b>");
    for (const u of unknown) {
      const reason = u.result?.reason ?? u.reason ?? "unknown";
      lines.push(`• ${escapeHtml(u.job_name)}: ${escapeHtml(reason)}`);
    }
  }

  // Alert đã tự động đóng — open_for chính là MTTR
  const resolved: ResolvedAlert[] = scan.resolved?.resolved ?? [];
  if (resolved.length > 0) {
    lines.push("\n✅ <b>Đã tự động đóng cảnh báo</b>");
    for (const r of resolved) {
      lines.push(
        `• ${escapeHtml(r.job_name)} (${escapeHtml(r.alert_type)}) — mở ${escapeHtml(r.open_for)}`,
      );
    }
  }

  return lines.join("\n");
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
      let message: string;
      if (allIssues.length === 0) {
        message = `✅ <b>Ops Guardian — báo cáo sáng</b>\n\n` +
          `Tất cả ${scan.ok_count} job đang chạy bình thường.`;
      } else {
        const lines = allIssues.map(formatIssue).join("\n\n");
        message = `📋 <b>Ops Guardian — báo cáo sáng</b>\n\n` +
          `Còn tồn ${allIssues.length} sự cố chưa xử lý:\n\n${lines}\n\n` +
          `Đang khoẻ: ${scan.ok_count} job`;
      }
      message += renderSemanticBlock(scan);
      await sendTelegram(message);
      sent = true;
    }

    // Heartbeat của chính guardian — ghi SAU cùng, sau khi mọi việc đã xong
    await reportHeartbeat(supabase, startedAt, {
      new_alerts: newAlerts.length,
      all_issues: allIssues.length,
      ok_count: scan.ok_count,
      telegram_sent: sent,
      morning_report: isMorningReport,
      semantic_failed: scan.semantic?.failed ?? 0,
      alerts_resolved: scan.resolved?.resolved_count ?? 0,
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
