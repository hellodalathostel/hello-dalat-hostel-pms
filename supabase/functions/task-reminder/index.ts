// task-reminder — nhắc việc hằng ngày cho Lợi qua Telegram (cron jobid 20, 07:30 ICT).
//
// v40 — Ops Guardian Stage 2. Hai thay đổi:
//
//   1. FIX P0 (regression): v39 vẫn query Notion và ghi bảng
//      `telegram_task_sessions` ĐÃ BỊ DROP. ops_tasks mới là bảng nghiệp vụ
//      duy nhất. Hậu quả: mỗi sáng Lợi nhận "Hôm nay không có task nào"
//      trong khi ops_tasks có task thật — mà heartbeat vẫn báo ok vì hàm
//      chạy xong không lỗi. Bài học: heartbeat chứng minh job CHẠY, không
//      chứng minh job LÀM ĐÚNG.
//      Nay đọc qua RPC public.list_tasks_for_date() — cùng một nguồn đánh số
//      với complete/skip/extend_task_txn nên số thứ tự luôn khớp.
//
//   2. CANH CHÉO (Stage 2): kiểm tra ngược xem ops-guardian còn heartbeat
//      không. Guardian canh task-reminder qua job_registry; task-reminder
//      canh ngược guardian. Không bên nào còn là điểm chết đơn lẻ.
//      task-reminder chạy 07:30 ICT, TRƯỚC báo cáo sáng của guardian (08:00)
//      -> nếu guardian chết, Hiếu biết ngay chứ không phải tự nhận ra
//      "sao sáng nay không thấy tin".
//
// Nguyên tắc #4: Edge Function chỉ làm I/O. Mọi logic phát hiện nằm ở RPC.
// Nguyên tắc #8: không dùng dấu ngoặc nhọn trong text tĩnh HTML Telegram;
// mọi text động phải qua escapeHtml().

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

const JOB_NAME = "task-reminder";
const PEER_JOB = "ops-guardian";

interface TaskRow {
  task_number: number;
  task_id: number;
  task_name: string;
  loai: string | null;
  priority: string | null;
  room_id: string | null;
  ghi_chu: string | null;
  nguoi_thuc_hien: string | null;
}

interface PeerStatus {
  job_name: string;
  registered: boolean;
  healthy: boolean;
  issue: string | null;
  last_run_at: string | null;
  silent_for: string | null;
  threshold: string | null;
  last_error: string | null;
  alert_created: boolean;
}

/** Escape text động trước khi chèn vào message HTML (bài học telegram-webhook v49). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Ngày hôm nay theo ICT, định dạng YYYY-MM-DD. en-CA cho đúng thứ tự ISO. */
function todayICT(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

/** Nhãn ngày tiếng Việt cho tiêu đề tin. */
function dateLabelICT(): string {
  return new Date().toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
}

/** Format timestamp ISO sang giờ ICT dễ đọc. */
function fmtICT(iso: string | null): string {
  if (!iso) return "chưa từng chạy";
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Cắt phần thập phân của interval Postgres ("08:12:33.123456" -> "08:12:33"). */
function trimInterval(s: string | null): string {
  if (!s) return "-";
  return s.split(".")[0];
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

// Giá trị trong DB không dấu (check constraint) -> map sang nhãn hiển thị có dấu.
const PRIORITY_ICON: Record<string, string> = {
  "Khan": "🔴",
  "Cao": "🟠",
  "Binh Thuong": "🔵",
  "Thap": "⚪",
};

const TYPE_ICON: Record<string, string> = {
  "Don Phong": "🧹",
  "Check-in/out": "🔑",
  "Bao Tri": "🔧",
  "Mua Sam": "🛒",
  "Admin": "📋",
  "Khac": "📌",
};

const TYPE_LABEL: Record<string, string> = {
  "Don Phong": "Dọn Phòng",
  "Check-in/out": "Check-in/out",
  "Bao Tri": "Bảo Trì",
  "Mua Sam": "Mua Sắm",
  "Admin": "Admin",
  "Khac": "Khác",
};

const ISSUE_LABEL: Record<string, string> = {
  never_run: "chưa từng chạy",
  silent: "im lặng quá lâu",
  error: "báo lỗi",
  not_registered: "không có trong job_registry",
};

/** Dựng tin nhắn danh sách task. */
function buildTaskMessage(tasks: TaskRow[]): string {
  const lines: string[] = [
    `📋 <b>Task hôm nay — ${escapeHtml(dateLabelICT())}</b>`,
    `<i>Còn ${tasks.length} task cần làm</i>`,
    "",
  ];

  for (const t of tasks) {
    const pIcon = PRIORITY_ICON[t.priority ?? ""] ?? "🔵";
    const tIcon = TYPE_ICON[t.loai ?? ""] ?? "📌";
    const loaiLabel = t.loai ? ` [${TYPE_LABEL[t.loai] ?? t.loai}]` : "";
    const roomLabel = t.room_id ? ` · P.${escapeHtml(t.room_id)}` : "";
    lines.push(
      `${pIcon} <b>${t.task_number}.</b> ${tIcon}${escapeHtml(loaiLabel)}${roomLabel} ${escapeHtml(t.task_name)}`,
    );
    if (t.ghi_chu) lines.push(`   <i>${escapeHtml(t.ghi_chu)}</i>`);
  }

  lines.push("");
  lines.push("💡 <b>Lệnh quản lý:</b>");
  lines.push("• <code>/done [số]</code> — hoàn thành task");
  lines.push("• <code>/skip [số]</code> — bỏ qua task");
  lines.push("• <code>/extend [số] [dd/mm]</code> — dời ngày");
  lines.push("• <code>/tasks</code> — xem lại danh sách");

  return lines.join("\n");
}

/** Dựng tin cảnh báo khi guardian mất tín hiệu. */
function buildPeerAlert(p: PeerStatus): string {
  const issue = ISSUE_LABEL[p.issue ?? ""] ?? p.issue ?? "bất thường";
  const lines: string[] = [
    "🚨 <b>CẢNH BÁO GIÁM SÁT</b>",
    "",
    `Hệ thống giám sát <b>${escapeHtml(p.job_name)}</b> đang mất tín hiệu.`,
    `Nghĩa là các cron job khác hiện KHÔNG có ai canh.`,
    "",
    `• Tình trạng: ${escapeHtml(issue)}`,
    `• Lần chạy cuối: ${escapeHtml(fmtICT(p.last_run_at))}`,
  ];
  if (p.issue === "silent") {
    lines.push(
      `• Im lặng: ${escapeHtml(trimInterval(p.silent_for))} (ngưỡng ${escapeHtml(trimInterval(p.threshold))})`,
    );
  }
  if (p.last_error) {
    lines.push(`• Lỗi cuối: ${escapeHtml(p.last_error)}`);
  }
  lines.push("");
  lines.push("👉 Kiểm tra cron jobid 25 và Edge Function ops-guardian.");
  return lines.join("\n");
}

/**
 * Ghi heartbeat qua wrapper public.report_automation_run.
 * KHÔNG bao giờ ném lỗi ra ngoài — giám sát hỏng không được làm chết nghiệp vụ chính.
 */
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

/**
 * Canh chéo: kiểm tra peer còn sống không, gửi cảnh báo nếu không.
 * Lỗi ở đây KHÔNG được làm hỏng việc nhắc task -> bọc try/catch riêng.
 */
async function crossCheckPeer(
  supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  try {
    const { data, error } = await supabase.rpc("check_peer_job", {
      p_job_name: PEER_JOB,
    });
    if (error) {
      console.error("[peer] loi goi RPC:", error.message);
      return { peer_checked: false, peer_error: error.message };
    }

    const peer = data as PeerStatus;
    if (peer.healthy) {
      return { peer_checked: true, peer_healthy: true };
    }

    console.error(`[peer] ${PEER_JOB} khong khoe: ${peer.issue}`);
    await sendTelegram(buildPeerAlert(peer));
    return {
      peer_checked: true,
      peer_healthy: false,
      peer_issue: peer.issue,
      peer_alert_created: peer.alert_created,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[peer] exception:", msg);
    return { peer_checked: false, peer_error: msg };
  }
}

Deno.serve(async (_req: Request) => {
  const startedAt = Date.now();

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const today = todayICT();

    // 1. Lấy task hôm nay — nguồn đánh số duy nhất, khớp với /done /skip /extend
    const { data, error } = await supabase.rpc("list_tasks_for_date", {
      p_task_date: today,
    });
    if (error) throw new Error(`list_tasks_for_date: ${error.message}`);

    const tasks = (data ?? []) as TaskRow[];

    // 2. Gửi danh sách task cho Lợi
    if (tasks.length === 0) {
      await sendTelegram(
        `✅ <b>Hôm nay không có task nào.</b>\n<i>${escapeHtml(dateLabelICT())}</i>`,
      );
    } else {
      await sendTelegram(buildTaskMessage(tasks));
    }

    // 3. Canh chéo ops-guardian (Stage 2)
    const peerDetail = await crossCheckPeer(supabase);

    // 4. Heartbeat — ghi SAU cùng, chỉ khi nghiệp vụ chính đã xong
    await reportHeartbeat(supabase, startedAt, {
      task_date: today,
      tasks_sent: tasks.length,
      ...peerDetail,
    });

    return new Response(
      JSON.stringify({ ok: true, task_date: today, tasks_sent: tasks.length, ...peerDetail }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[task-reminder] that bai:", msg);
    // KHÔNG ghi heartbeat khi thất bại — im lặng chính là tín hiệu để guardian phát hiện.
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});