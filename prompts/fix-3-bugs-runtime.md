# Fix 3 bug runtime đã verify qua Supabase MCP (2026-06-22)

Đây là 3 bug đã được Claude.ai xác nhận **thật 100%** bằng cách query trực tiếp
schema/function signature trên Supabase (project `rcfhhgywjdwqcgnpkbtl`).
Không phải suy đoán — nhưng code path cụ thể trong file thì Claude Code CLI
cần tự đọc trước khi sửa (Claude.ai không có quyền đọc file trong Codespace này).

**Quy trình bắt buộc cho mỗi bug:**
1. Đọc đúng đoạn code liên quan trong file được chỉ định
2. Xác nhận đúng là bug như mô tả (nếu code thực tế khác mô tả → báo lại, không tự đoán fix)
3. Sửa, build thử (`tsc -b` hoặc lệnh build đúng trong package.json — không dùng `tsc --noEmit` ở root)
4. Mỗi bug = 1 commit riêng, Conventional Commits

---

## Bug 1 — `add_early_late_txn` RPC: sai kiểu cast, sẽ lỗi khi gọi

**File:** migration tạo RPC `add_early_late_txn` (tìm trong `supabase/migrations/`,
khả năng cao ở `20260618000001_backfill_functions_triggers.sql` theo audit Codex)

**Verified fact:** `check_room_availability` có signature thật:
```sql
check_room_availability(p_room_id text, p_check_in date, p_check_out date, p_exclude_booking_id uuid DEFAULT NULL)
RETURNS TABLE(available boolean, conflict_type text, conflict_id uuid, conflict_check_in date, conflict_check_out date, conflict_label text)
```

Code hiện tại trong `add_early_late_txn` đang làm:
```sql
SELECT check_room_availability(
  v_booking.room_id,
    v_check_date_from,
      v_check_date_to,
        p_booking_id
        ) INTO v_available;
        ```

        Đây SAI vì function trả về TABLE (6 cột), không thể SELECT thẳng vào 1 biến BOOLEAN.
        Postgres sẽ lỗi cast khi RPC này được gọi → tính năng Early Check-in/Late Check-out
        trong app đang broken (hoặc sẽ broken lần tới có người dùng).

        **Fix đúng:**
        ```sql
        SELECT available INTO v_available
        FROM check_room_availability(
          v_booking.room_id,
            v_check_date_from,
              v_check_date_to,
                p_booking_id
                );
                ```

                **Cách apply:** Tạo migration file mới (KHÔNG sửa migration cũ đã apply), dùng
                `CREATE OR REPLACE FUNCTION` để patch lại đúng function body, giữ nguyên toàn bộ
                logic còn lại của function — chỉ sửa đúng đoạn SELECT...INTO này.

                Migration mới cần:
                ```sql
                -- supabase/migrations/[timestamp]_fix_add_early_late_txn_availability_check.sql
                CREATE OR REPLACE FUNCTION public.add_early_late_txn(p_booking_id uuid, p_type text, p_fee integer)
                RETURNS jsonb
                LANGUAGE plpgsql
                SECURITY DEFINER
                AS $function$
                -- [giữ nguyên toàn bộ body cũ, chỉ sửa đoạn SELECT...INTO v_available như trên]
                $function$;
                ```

                Apply migration qua Supabase MCP `apply_migration` (KHÔNG dùng `supabase db push`,
                KHÔNG dùng `supabase migration repair` — theo nguyên tắc cố định của project).

                Sau khi apply, verify lại bằng:
                ```sql
                SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'add_early_late_txn';
                ```
                và xác nhận đoạn SELECT đã đúng cú pháp mới.

                **Commit:** `fix(db): correct availability check cast in add_early_late_txn RPC`

                ---

                ## Bug 2 — `telegram-webhook`: query cột `grand_total` không tồn tại trên `groups`

                **File:** `supabase/functions/telegram-webhook/index.ts` (theo audit Codex, dòng ~735,
                lệnh `/debt`)

                **Verified fact:** Bảng `groups` trong DB thật KHÔNG có cột `grand_total`.
                Cột thật có là: `net_revenue` (integer), `paid` (integer).

                Đọc đúng đoạn xử lý lệnh `/debt` trong file, tìm chỗ select/filter `grand_total`
                trên bảng `groups`. Xác nhận lại bằng cách tự query thử (Claude Code CLI có thể
                gọi Supabase MCP hoặc psql nếu có quyền) — KHÔNG tự suy ra debt = grand_total - paid
                nếu chưa hiểu rõ business logic định nghĩa "debt" là gì trong context này.

                **Cách fix:**
                1. Đọc kỹ logic `/debt` đang định tính gì — khả năng cao công thức đúng là:
                   `debt = net_revenue - paid` (vì `net_revenue` là tổng doanh thu thực nhận sau
                      commission OTA, `paid` là số tiền khách đã trả — debt = phần khách còn thiếu)
                      2. Đổi mọi reference `grand_total` trên object `groups` thành `net_revenue`
                      3. Nếu phát hiện logic cần dùng `grand_total` thật (tổng từ bookings, trước khi
                         trừ OTA commission) — KHÔNG tự thêm cột mới vào `groups`, báo lại cho Hiếu để
                            xác nhận trước, vì đây là quyết định schema cần Lead Developer duyệt.

                            **Test sau khi fix:** Gọi thử `/debt` qua Telegram bot trên 1 group có công nợ thật,
                            xác nhận số hiển thị đúng và không còn lỗi runtime.

                            **Commit:** `fix(telegram-webhook): use groups.net_revenue instead of non-existent grand_total in /debt command`

                            ---

                            ## Bug 3 — `telegram-webhook`: nhánh no-task vẫn query cột `chat_id` không tồn tại

                            **File:** `supabase/functions/telegram-webhook/index.ts` (theo audit Codex, hàm
                            `saveSession()`/`loadSession()`, khoảng dòng 539-576)

                            **Verified fact:** Bảng `telegram_task_sessions` trong DB thật có schema:
                            ```
                            id uuid, session_date date, task_index smallint, notion_page_id text, task_name text, created_at timestamptz
                            ```
                            KHÔNG có cột `chat_id` hay `session_data`.

                            Đọc kỹ `saveSession()` và `loadSession()`. Theo audit, nhánh "no-task" (trường hợp
                            không có task nào trong ngày) đang làm:
                            ```ts
                            .eq("chat_id", chatId)
                            ```
                            Đây sẽ lỗi `column "chat_id" does not exist` ngay khi chạy tới nhánh này.

                            **Fix đúng:** Đổi mọi `.eq("chat_id", chatId)` trong 2 hàm này thành
                            `.eq("session_date", today)` (dùng cùng biến `session_date` mà nhánh có-task
                            đang dùng đúng) — pattern chuẩn của bảng này là **delete+insert theo session_date**,
                            không filter theo chat_id vì bảng không track chat_id (hệ thống chỉ có 1 group chat
                            nên không cần phân biệt theo chat).

                            **Test sau khi fix:** Trigger 1 ngày không có task nào (hoặc mock), gọi `/tasks`,
                            xác nhận không lỗi và trả về đúng message "không có task hôm nay" (hoặc tương đương).

                            **Commit:** `fix(telegram-webhook): remove non-existent chat_id filter in session no-task branch`

                            ---

                            ## Sau khi fix cả 3

                            1. Build: `tsc -b` (không phải `tsc --noEmit` ở root)
                            2. Deploy lại `telegram-webhook` Edge Function qua Supabase MCP
                               `--no-verify-jwt` như cấu hình hiện tại
                               3. Báo lại Claude.ai: 3 commit hash + kết quả test thật (không chỉ "đã sửa") để
                                  ghi vào `brain.decisions` (outcome) và update `brain.daily_log`