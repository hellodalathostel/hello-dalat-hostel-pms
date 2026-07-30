# Ops Guardian — Stage 1 (vertical slice)

Mục tiêu: phát hiện cron job / Edge Function chết âm thầm và báo Telegram, thay vì để 24 ngày trôi qua không ai biết như vụ 30/07.

Thứ tự thực hiện: **(1) migration → (2) patch task-reminder → (3) deploy ops-guardian → (4) tạo cron → (5) verify**.

---

## 1. Migration

File: `supabase/migrations/20260731030000_ops_guardian_stage1_schema.sql` (đã có sẵn, chỉ cần commit + push).

```powershell
cd D:\hello-dalat-hostel-pms
git add supabase/migrations/20260731030000_ops_guardian_stage1_schema.sql
git commit -m "feat(automation): ops guardian stage 1 - schema automation + heartbeat + watchdog"
supabase db push
```

Sau khi push, verify (chạy tay, không nằm trong migration):

```sql
-- Grant đúng chưa (apply thành công KHÔNG đảm bảo grant đúng — bài học Brain)
SELECT has_function_privilege('service_role','public.guardian_scan()','EXECUTE') AS svc_scan,
       has_function_privilege('anon','public.guardian_scan()','EXECUTE') AS anon_must_be_false;

-- RLS đã bật trên cả 3 bảng
SELECT relname, relrowsecurity FROM pg_class
WHERE relnamespace = 'automation'::regnamespace AND relkind = 'r';

-- Scan lần đầu — kỳ vọng: 2 job đều 'never_run'
SELECT public.guardian_scan();
```

---

## 2. Patch `task-reminder` — thêm heartbeat

File: `supabase/functions/task-reminder/index.ts`

Chỉ thêm heartbeat ở **cuối, khi đã chạy xong thành công**. Không cần try/catch bọc toàn bộ — mọi kiểu chết (401 gateway khiến function không hề chạy, crash giữa chừng) đều biểu hiện chung là không có heartbeat.

Thêm helper này vào cuối file (trước `Deno.serve` hoặc ngoài scope handler):

```ts
/**
 * Ghi heartbeat vào automation.automation_runs qua wrapper public.report_automation_run.
 * KHÔNG bao giờ ném lỗi ra ngoài — giám sát hỏng không được phép làm chết nghiệp vụ chính.
 */
async function reportHeartbeat(
  supabase: SupabaseClient,
  jobName: string,
  startedAt: number,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { error } = await supabase.rpc("report_automation_run", {
      p_job_name: jobName,
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
```

Trong handler, ngay đầu:

```ts
const startedAt = Date.now();
```

Và ngay trước khi `return` response thành công:

```ts
await reportHeartbeat(supabase, "task-reminder", startedAt, {
  tasks_sent: tasks?.length ?? 0,
});
```

Deploy:

```powershell
supabase functions deploy task-reminder
```

---

## 3. Edge Function `ops-guardian`

File mới: `supabase/functions/ops-guardian/index.ts`

```ts
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
```

Deploy:

```powershell
supabase functions deploy ops-guardian
```

**Lưu ý env var:** `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` phải khớp đúng tên biến mà `task-reminder` đang dùng. Kiểm tra trước khi deploy, nếu khác thì sửa lại 2 hằng số ở đầu file — đừng tạo secret mới trùng mục đích (bài học CRON_SECRET dùng chung 2 function với 2 giá trị khác nhau).

---

## 4. Tạo cron job

Chạy qua `execute_sql` (không vào migration history — đây là cấu hình vận hành, đúng quyết định đã chốt):

```sql
SELECT cron.schedule(
  'ops-guardian',
  '0 1,7,13,19 * * *',   -- UTC = 08:00/14:00/20:00/02:00 ICT
  $$
  SELECT net.http_post(
    url := 'https://rcfhhgywjdwqcgnpkbtl.supabase.co/functions/v1/ops-guardian',
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_JWT>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
```

Thay `<SERVICE_ROLE_JWT>` bằng đúng token service_role đang dùng ở jobid 20 (`task-reminder`) — copy nguyên từ `cron.job` để chắc chắn khớp.

---

## 5. Verify

```sql
-- Trigger tay, không đợi cron
SELECT net.http_post(
  url := 'https://rcfhhgywjdwqcgnpkbtl.supabase.co/functions/v1/ops-guardian',
  headers := '{"Authorization": "Bearer <SERVICE_ROLE_JWT>", "Content-Type": "application/json"}'::jsonb,
  body := '{}'::jsonb, timeout_milliseconds := 20000
);

-- Đợi vài giây rồi xem status thật (nhớ: bảng này chỉ giữ ~6 giờ)
SELECT id, status_code, content FROM net._http_response ORDER BY created DESC LIMIT 3;

-- Heartbeat đã ghi chưa
SELECT job_name, status, duration_ms, detail, created_at
FROM automation.automation_runs ORDER BY created_at DESC LIMIT 5;

-- Alert đang mở
SELECT job_name, alert_type, alerted_at, resolved_at
FROM automation.guardian_alerts ORDER BY alerted_at DESC;
```

**Kịch bản test đầy đủ (nên làm để chắc chắn guardian thật sự bắt được sự cố):**

1. Sau khi patch + deploy task-reminder, trigger tay nó một lần → `automation_runs` có heartbeat `task-reminder`.
2. Chạy `SELECT public.guardian_scan();` → `new_alerts` chỉ còn `ops-guardian` (nếu guardian chưa chạy lần nào).
3. Trigger tay ops-guardian → cả 2 job đều khoẻ, `ok_count = 2`, `all_issues = []`.
4. **Test bắt sự cố:** tạm hạ ngưỡng để mô phỏng job chết, rồi khôi phục:
   ```sql
   UPDATE automation.job_registry
   SET expected_interval = '1 second', grace_period = '0 seconds'
   WHERE job_name = 'task-reminder';

   SELECT public.guardian_scan();   -- kỳ vọng: new_alerts có task-reminder, Telegram nổ
   SELECT public.guardian_scan();   -- kỳ vọng: new_alerts rỗng (chống spam)

   -- Khôi phục
   UPDATE automation.job_registry
   SET expected_interval = '1 day', grace_period = '2 hours'
   WHERE job_name = 'task-reminder';
   ```
5. Trigger tay task-reminder lần nữa → alert tự đóng (`resolved_at` có giá trị), không cần can thiệp.

---

## Stage 2 (sau khi stage 1 chạy ổn vài ngày)

Gắn heartbeat cho các job còn lại, **mỗi lần thêm một job vào `job_registry` chỉ SAU KHI** function tương ứng đã deploy kèm heartbeat — nếu không sẽ bị báo `never_run` ngay.

Thứ tự đề xuất theo mức thiệt hại nếu chết âm thầm:

| Job | expected_interval | Ghi chú |
|---|---|---|
| `email-transaction-sync` | 1 hour | Chạy mỗi giờ, từng chết 24 ngày |
| `daily-revenue-summary` | 1 day | Từng chết 24 ngày |
| `notion-daily-log` | 1 day | Lợi đọc hằng ngày |
| `checkin-reminder` | 1 day | |
| `daily-revenue` | 1 day | |
| `daily-room-report` | 1 day | |
| `weekly-review-reminder` | 7 days | |
| `price-alert-weekly` | 7 days | |
| `tax-reminder-15` / `-20` | 1 month | grace rộng |
| `dk13-reminder` | 3 months | grace rộng |

Cân nhắc thêm ở stage 2: `task-reminder` kiểm tra ngược "guardian có heartbeat trong 24h không" để canh chéo hai chiều — hiện tại dead-man's switch dựa vào việc Hiếu nhận ra tin sáng 08:00 không đến.
