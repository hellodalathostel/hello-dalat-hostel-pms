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

interface CronResult {
  job_name: string;
  severity: string;
  cron_job_name: string;
  cron_active: boolean | null;
  last_status: string | null;
  last_run_at: string | null;
  verdict: "ok" | "fail" | "unknown";
  reason: string | null;
  last_message: string;
}

interface CronScan {
  checked: number;
  failed: number;
  unknown: number;
  results: CronResult[];
  scanned_at: string;
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
  cron?: CronScan;
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

/** Định dạng thời điểm theo giờ VN, dùng cho log cron. */
function formatVNTime(iso: string | null): string {
  if (!iso) return "chưa rõ";
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

const CRON_REASON_LABEL: Record<string, string> = {
  cron_job_missing: "chưa đăng ký trong cron.job",
  cron_disabled: "cron job đang tắt (active=false)",
  cron_command_error: "cron gọi Edge Function nhưng lỗi",
};

/** ~150 ký tự — đủ để thấy lỗi Postgres nhưng không làm tin nhắn quá dài. */
function truncateMessage(msg: string): string {
  return msg.length > 150 ? `${msg.slice(0, 150)}…` : msg;
}

function formatCronIssue(c: CronResult): string {
  const reason = CRON_REASON_LABEL[c.reason ?? ""] ?? c.reason ?? "không rõ";
  let line = `🔴 <b>${escapeHtml(c.job_name)}</b> — ${escapeHtml(reason)}`;
  line += `\n   Chạy lần cuối: ${escapeHtml(formatVNTime(c.last_run_at))}`;
  if (c.last_message) {
    line += `\n   Log: ${escapeHtml(truncateMessage(c.last_message))}`;
  }
  return line;
}

/**
 * Render phần cron chết — đặt TRƯỚC heartbeat/semantic vì cron chết là
 * nguyên nhân gốc (heartbeat im lặng chỉ là triệu chứng theo sau).
 * verdict='unknown' (chưa đủ bằng chứng) không đưa vào đây, chỉ 'fail' thật sự.
 */
function renderCronBlock(scan: ScanResult): string {
  const failed = (scan.cron?.results ?? []).filter((c) => c.verdict === "fail");
  if (failed.length === 0) return "";
  const lines = failed.map(formatCronIssue).join("\n\n");
  return `\n🔴 <b>Cron chết — Edge Function không được gọi</b>\n\n${lines}\n`;
}

/** Dòng tổng cuối message, cộng cả 3 tầng: cron / heartbeat (im lặng) / semantic. */
function summaryLine(scan: ScanResult): string {
  const unhealthy = new Set<string>();
  for (const i of scan.all_issues ?? []) unhealthy.add(i.job_name);
  for (const r of scan.semantic?.results ?? []) {
    if (r.verdict === "fail") unhealthy.add(r.job_name);
  }
  for (const c of scan.cron?.results ?? []) {
    if (c.verdict === "fail") unhealthy.add(c.job_name);
  }
  const total = scan.ok_count + unhealthy.size;
  const cronFailed = scan.cron?.failed ?? 0;
  const silent = scan.all_issues?.length ?? 0;
  const semanticFailed = scan.semantic?.failed ?? 0;
  return `${total} job — ${cronFailed} cron lỗi, ${silent} im lặng, ${semanticFailed} sai ngữ nghĩa`;
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
    const cronFailed = scan.cron?.failed ?? 0;
    const isMorningReport = hourICT() === 8;

    let sent = false;
    const cronBlock = renderCronBlock(scan);

    if (newAlerts.length > 0 || cronFailed > 0) {
      // Có vấn đề MỚI (heartbeat) hoặc cron chết -> báo ngay
      const heartbeatLines = newAlerts.map(formatIssue).join("\n\n");
      const heartbeatSection = heartbeatLines ? `\n\n${heartbeatLines}` : "";
      await sendTelegram(
        `⚠️ <b>Ops Guardian — phát hiện sự cố</b>\n${cronBlock}${heartbeatSection}\n\n` +
          summaryLine(scan),
      );
      sent = true;
    } else if (isMorningReport) {
      // Báo cáo sáng — luôn gửi, kể cả khi OK (dead-man's switch)
      let message: string;
      if (allIssues.length === 0) {
        message = `✅ <b>Ops Guardian — báo cáo sáng</b>\n\n` +
          `Tất cả đang chạy bình thường. ${summaryLine(scan)}`;
      } else {
        const lines = allIssues.map(formatIssue).join("\n\n");
        message = `📋 <b>Ops Guardian — báo cáo sáng</b>\n${cronBlock}\n` +
          `Còn tồn ${allIssues.length} sự cố chưa xử lý:\n\n${lines}\n\n` +
          summaryLine(scan);
      }
      message += renderSemanticBlock(scan);
      await sendTelegram(message);
      sent = true;
    }

    // Heartbeat của chính guardian — ghi SAU cùng, sau khi mọi việc đã xong
    await reportHeartbeat(supabase, startedAt, {
      new_alerts: newAlerts.length,
      all_issues: allIssues.length,
      cron_failed: cronFailed,
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
        cron_failed: cronFailed,
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
