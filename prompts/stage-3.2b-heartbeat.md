# Ops Guardian — Stage 3.2b: Heartbeat tự báo cáo

Repo: `D:\hello-dalat-hostel-pms`
Supabase project ref: `rcfhhgywjdwqcgnpkbtl`

---

## 0. Bối cảnh — đọc trước khi làm

Stage 3.2a đã quét được **tầng cron**: biết cron có gọi function hay không.
Nhưng không biết function chạy xong ra sao (200 hay 500, đúng hay sai).

Stage 3.2b bịt lỗ đó bằng **heartbeat hướng A**: mỗi Edge Function tự gọi
`report_automation_run(...)` để ghi nhận lần chạy của chính nó. Guardian chỉ
đọc bảng, không chủ động ping ai.

### Hạ tầng DB đã có sẵn — KHÔNG tạo migration mới

Đã verify trên production ngày 01/08/2026, test 7/7 PASS:

```
public.report_automation_run(
  p_job_name      text,
  p_status        text    DEFAULT 'ok',
  p_duration_ms   integer DEFAULT NULL,
  p_detail        jsonb   DEFAULT NULL,
  p_error_message text    DEFAULT NULL
) RETURNS uuid
```

- `SECURITY DEFINER`, `search_path = ''`
- Grant: `service_role` = có, `anon`/`authenticated` = không
- Wrapper mỏng gọi `automation.report_run()`
- `status='ok'` → tự động đóng alert đang mở của job đó
- `status='error'` → KHÔNG đóng alert (đã kiểm chứng)
- **Ném exception `P0001` nếu `p_job_name` không có trong
  `automation.job_registry` hoặc `is_active=false`**

> ⚠️ **TUYỆT ĐỐI KHÔNG** tạo migration cho function này. Nó đã tồn tại.
> Tạo thêm chỉ làm phình migration drift backlog.

---

## 1. Việc dọn dẹp trước (Task 0)

### 1a. Xoá function mồ côi `daily-room-report`

Bằng chứng đã thu thập: cron job tên `daily-room-report` đã được sửa vào
30–31/05/2026 để trỏ sang slug `room-report-bot`. Function cũ không được gọi
suốt 63 ngày. Không có trigger / cron / routine nào tham chiếu.

**Bước 1 — grep xác nhận lần cuối:**

```powershell
cd D:\hello-dalat-hostel-pms
Get-ChildItem -Recurse -Include *.ts,*.tsx,*.json,*.md,*.yml,*.sql `
  -Exclude node_modules | Select-String -Pattern 'daily-room-report' |
  Select-Object Path, LineNumber, Line
```

- **Rỗng** → tiếp bước 2.
- **Có hit** → DỪNG, báo lại, không xoá.

**Bước 2:**

```powershell
supabase functions delete daily-room-report --project-ref rcfhhgywjdwqcgnpkbtl
Remove-Item -Recurse -Force supabase\functions\daily-room-report
```

### 1b. Commit các thay đổi đang treo

Repo hiện có 2 commit Stage 3.2a chưa commit + 9 Edge Function vừa
`functions download` về (đã verify: không secret hardcode, encoding UTF-8 ổn).

Tách commit theo Conventional Commits, mỗi commit một việc.

---

## 2. Tạo helper dùng chung

**File mới: `supabase/functions/_shared/heartbeat.ts`**

```ts
// Heartbeat cho Ops Guardian Stage 3.2b.
//
// NGUYEN TAC BAT BUOC: heartbeat la quan trac, KHONG BAO GIO duoc lam chet
// business logic. Moi loi deu bi nuot va chi log ra console.
//
// Ly do: report_automation_run() nem exception P0001 neu job_name sai chinh ta
// hoac chua dang ky trong automation.job_registry. Neu khong bao try/catch,
// mot loi go nham se lam chet ca function giua nghiep vu that.

import { createClient } from "jsr:@supabase/supabase-js@2";

export type RunStatus = "ok" | "error" | "skipped";

/**
 * Ghi nhan mot lan chay vao automation.automation_runs.
 *
 * @param jobName   PHAI khop chinh xac automation.job_registry.job_name.
 *                  Xem bang map trong file huong dan Stage 3.2b.
 * @param status    'ok' se tu dong dong alert dang mo cua job nay.
 *                  'error' giu alert mo.
 * @param startedAt Gia tri performance.now() luc bat dau handler.
 * @param detail    Payload tuy y (jsonb). Dung cho semantic validator o 3.2c.
 * @param errorMessage Chi truyen khi status='error'.
 */
export async function reportRun(
  jobName: string,
  status: RunStatus,
  startedAt: number,
  detail: Record<string, unknown> | null = null,
  errorMessage: string | null = null,
): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      console.error("[heartbeat] thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY");
      return;
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase.rpc("report_automation_run", {
      p_job_name: jobName,
      p_status: status,
      p_duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
      p_detail: detail,
      p_error_message: errorMessage,
    });

    if (error) {
      // UNKNOWN_JOB = ten job sai hoac is_active=false trong job_registry.
      console.error(`[heartbeat] ${jobName} that bai: ${error.message}`);
    }
  } catch (e) {
    console.error(
      `[heartbeat] ${jobName} exception: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
```

---

## 3. Khuôn nhúng vào Edge Function

Đọc file gốc trước, giữ nguyên toàn bộ nghiệp vụ. Chỉ thêm 3 thứ:
import, `t0`/`JOB` ở đầu handler, và 2 lời gọi `reportRun` ở nhánh
thành công / thất bại.

```ts
import { reportRun } from "../_shared/heartbeat.ts";

Deno.serve(async (req) => {
  const t0 = performance.now();
  const JOB = "email-transaction-sync";   // <- doi theo bang map muc 4

  try {
    // ===== toan bo nghiep vu goc, GIU NGUYEN =====
    const result = await lamViecChinh();
    // =============================================

    await reportRun(JOB, "ok", t0, { /* so lieu tuy y, hoac bo trong */ });

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportRun(JOB, "error", t0, null, msg);

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

### Quy tắc khi sửa

- Nếu function đã có sẵn try/catch bao ngoài → gắn `reportRun` vào đúng
  nhánh đó, đừng lồng thêm một lớp try/catch nữa.
- Nếu function có nhiều điểm `return` sớm (ví dụ "không có gì để làm") →
  dùng `status: "skipped"` cho các nhánh đó, đừng để im lặng.
- `detail` để `null` cũng chạy. Nó chỉ cần thiết khi gắn semantic validator
  ở 3.2c. Nếu tiện thì truyền số liệu có ý nghĩa (số dòng xử lý, số tin nhắn
  gửi đi) — sau này đỡ phải sửa lại.
- **Không** đổi logic nghiệp vụ, **không** refactor, **không** đổi format
  response. Chỉ thêm quan trắc.

---

## 4. Bảng map `job_name` — chép đúng, không gõ lại từ trí nhớ

Registry lưu tên **cron job**, không lưu function slug. Ba ca lệch tên,
đây là chỗ dễ sai nhất:

| Function slug (thư mục) | Giá trị `JOB` truyền vào `reportRun` |
|---|---|
| `email-transaction-sync` | `email-transaction-sync` |
| `checkin-reminder` | `checkin-reminder` |
| `daily-revenue` | `daily-revenue` |
| `daily-revenue-summary` | `daily-revenue-summary` |
| `notion-daily-log` | `notion-daily-log` |
| `room-report-bot` | `room-report-bot` |
| `price-alert-bot` | `price-alert-bot` |
| `weekly-review-reminder` | `weekly-review-reminder` |
| `dk13-reminder` | `dk13-reminder` |
| `tax-reminder` | **động — xem 4a** |
| `task-reminder` | ĐÃ CÓ, không đụng |
| `ops-guardian` | ĐÃ CÓ, không đụng |

### 4a. Ca đặc biệt: `tax-reminder`

Một slug phục vụ **hai dòng registry** (`tax-reminder-15` và `tax-reminder-20`),
tương ứng 2 cron job jobid 8 và 9.

Trước khi sửa, kiểm tra body cron thật gửi gì:

```sql
SELECT jobname, command FROM cron.job WHERE jobid IN (8, 9);
```

Nếu body dạng `{"day": 15}` thì:

```ts
const body = await req.json().catch(() => ({}));
const day: number = Number(body?.day) || new Date().getUTCDate();
const JOB = day >= 20 ? "tax-reminder-20" : "tax-reminder-15";
```

Fallback `getUTCDate()` là bắt buộc — không có nó, chạy tay không kèm body sẽ
ghi sai dòng, và một trong hai dòng nằm `never_run` vĩnh viễn.

---

## 5. Thứ tự triển khai — QUAN TRỌNG

`automation.check_job_health()` chỉ xét dòng có `heartbeat_enabled = true`.
Job đã bật cờ mà chưa từng `report_run` sẽ bị chấm `never_run` → sinh alert giả.

**Luôn theo thứ tự: deploy function TRƯỚC → chờ chạy thật → bật cờ SAU.**

Việc bật cờ do Claude.ai làm qua Supabase MCP. Claude Code **không** chạy
`UPDATE automation.job_registry`.

### Đợt 1 — canary: `email-transaction-sync`

Chọn vì chạy mỗi giờ (phút thứ 7) → biết kết quả sau 60 phút thay vì chờ hết ngày.

```powershell
supabase functions deploy email-transaction-sync --project-ref rcfhhgywjdwqcgnpkbtl
```

Chờ qua mốc `:07` gần nhất, rồi kiểm chứng:

```sql
SELECT job_name, status, duration_ms, error_message, created_at
FROM automation.automation_runs
WHERE job_name = 'email-transaction-sync'
ORDER BY created_at DESC
LIMIT 3;
```

Có dòng `status='ok'` → báo lại để Claude.ai bật cờ.
Không có dòng nào → xem log function tìm chuỗi `[heartbeat]`.

### Đợt 2 — nhóm daily (chỉ làm sau khi đợt 1 xanh)

`checkin-reminder`, `daily-revenue`, `daily-revenue-summary`,
`notion-daily-log`, `room-report-bot`

### Đợt 3 — tần suất thấp (kích tay, không chờ chu kỳ tự nhiên)

`tax-reminder`, `dk13-reminder`, `price-alert-bot`, `weekly-review-reminder`

`dk13-reminder` chạy 3 tháng/lần — bật cờ sai là ba tháng sau mới phát hiện.
Bắt buộc kích tay xác nhận trước.

---

## 6. Checklist trước khi báo xong đợt 1

- [ ] `_shared/heartbeat.ts` đã tạo
- [ ] `email-transaction-sync` đã sửa, nghiệp vụ gốc không đổi
- [ ] `npx tsc --noEmit` hoặc `deno check` sạch
- [ ] Deploy thành công
- [ ] Có dòng `ok` trong `automation.automation_runs`
- [ ] Commit theo Conventional Commits
- [ ] `daily-room-report` đã xử lý xong (xoá hoặc báo lý do giữ)

---

## 7. Ghi chú cho phiên sau

- `ical-import` ngừng chạy từ 22/06/2026 — **chủ ý**, khớp quyết định
  "iCal 1 chiều, không cần cron". Không phải job chết. Đừng thêm vào registry.
- `telegram-webhook` hiện ở **v81** (tài liệu cũ ghi v54 — đã lỗi thời).
- Sau Stage 3.2b: 3.3 tách `CRON_SECRET`, 3.4 ping ngoài hệ thống.
