-- =====================================================================
-- Audit 16/10/2026: group đã xoá mềm còn tiền + payment void lọt vào báo cáo
-- Project: rcfhhgywjdwqcgnpkbtl
--
-- KHÔNG PHẢI MIGRATION. File này CHỈ CHỨA SELECT, chạy lại bao nhiêu lần cũng được.
-- Không chứa tên khách thật — chỉ dùng group_id (đối chiếu tên trong PMS).
--
-- 7 group (mọi booking đã is_deleted = true nhưng groups.paid ≠ 0):
--   Nhóm A (nghi test)
--     A1 8173c41e-d6ab-4133-8013-df23968a77be  paid 2.000.000
--     A2 c24206b7-c025-47c7-8fbc-b8bf27538a71  paid 1.000
--     A3 33105ba6-1f76-4982-bdc9-0d34822a22d2  paid 4
--   Nhóm B (nghi khách thật)
--     B1 1a7f2915-15fd-4cca-ad43-987e872d9f2e  paid 550.000
--     B2 b083ff80-0f20-4260-9bf9-3bab8bf6d428  paid 568.620
--     B3 6bfcb2de-1f8f-4bc2-8341-0f952cbcbf4b  paid 351.000
--     B4 c853c0de-fb0b-4048-9967-9335c0e097b2  paid 50.000
--
-- Kết quả chạy 16/10/2026 — xem báo cáo trong PR. Tóm tắt:
--   * A1, A3, B2 có note "[VOID] …" → xoá qua void_checkedout_booking_txn (Owner).
--     B2 ghi rõ "Duplicate của group 87f9a7ce… lỗi room_id mapping OTA".
--   * A2, B1, B3, B4 không có "[VOID]", booking chưa từng checked-out → huỷ qua
--     update_booking_txn(p_cancel) (đặt status cancelled + is_deleted) hoặc sửa trực tiếp.
--     [Không xác nhận được] — booking_audit_log chỉ có từ 10/10/2026.
--   * groups.updated_at = 2026-07-02 06:53:02.910466 của A2/A3/B3 trùng migration
--     20260702065302 add_groups_grand_total_synced (backfill), KHÔNG phải lúc xoá.
--   * B2 và B4 có group OTA thật (bc520653…, a2f36044…) được nhập bù tiền mặt ngày
--     18/07 ("Data-fix 02b") → cùng 1 kỳ lưu trú đang có tiền ở 2 group.
--   * Báo cáo theo booking (Doanh thu, S1a, get_tax_threshold_summary, daily_revenue,
--     finance_monthly_revenue, monthly_revenue) KHÔNG tính 7 group này.
--     Báo cáo theo tiền thu (sổ quỹ cash_book_detail, payment theo ngày) CÓ tính.
--   * DB: không view/function/trigger nào cần migration (xem mục 5).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Supabase project / branch (Việc 0) — làm qua MCP list_projects / list_branches,
--    không có SQL tương ứng. Kết quả: chỉ 1 branch "main" của rcfh…, không có preview branch.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. Schema (đọc trước khi viết SQL)
-- ---------------------------------------------------------------------
select table_schema, table_name,
       string_agg(column_name || ':' || data_type, ', ' order by ordinal_position) as cols
from information_schema.columns
where (table_schema = 'public'
       and (table_name ilike '%audit%' or table_name ilike '%log%' or table_name in ('payment_history', 'groups')))
   or (table_schema = 'brain' and table_name in ('daily_log', 'decisions'))
group by 1, 2
order by 1, 2;

-- ---------------------------------------------------------------------
-- 2. Group + bookings + payments của 7 group
-- ---------------------------------------------------------------------
with g7 as (
  select unnest(array[
    '8173c41e-d6ab-4133-8013-df23968a77be', 'c24206b7-c025-47c7-8fbc-b8bf27538a71',
    '33105ba6-1f76-4982-bdc9-0d34822a22d2', '1a7f2915-15fd-4cca-ad43-987e872d9f2e',
    'b083ff80-0f20-4260-9bf9-3bab8bf6d428', '6bfcb2de-1f8f-4bc2-8341-0f952cbcbf4b',
    'c853c0de-fb0b-4048-9967-9335c0e097b2']::uuid[]) as id
)
select g.id, g.source, g.paid, g.grand_total, g.net_revenue, g.status, g.is_deleted,
       g.created_at, g.updated_at,
       (select json_agg(json_build_object(
                 'code', b.code, 'status', b.status, 'is_deleted', b.is_deleted, 'room', b.room_id,
                 'check_in', b.check_in, 'check_out', b.check_out, 'grand_total', b.grand_total,
                 'updated_at', b.updated_at, 'actual_check_in', b.actual_check_in,
                 'actual_check_out', b.actual_check_out) order by b.check_in)
        from bookings b where b.group_id = g.id) as bookings,
       (select json_agg(json_build_object(
                 'id', p.id, 'amount', p.amount, 'method', p.method, 'date', p.date,
                 'is_void', p.is_void, 'voided_payment_id', p.voided_payment_id,
                 'note', p.note, 'created_at', p.created_at) order by p.created_at)
        from payment_history p where p.group_id = g.id) as payments
from groups g
join g7 using (id)
order by g.created_at;

-- ---------------------------------------------------------------------
-- 3. Dấu vết xoá mềm: note "[VOID]" (void_checkedout_booking_txn), audit log,
--    document_logs, migration quanh các mốc thời gian
-- ---------------------------------------------------------------------

-- 3a. Mã nguồn 2 RPC có thể xoá mềm — để phân biệt dấu vết
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       regexp_replace(substring(p.prosrc from 1 for 4000), '\s+', ' ', 'g') as src
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('void_checkedout_booking_txn', 'update_booking_txn');

-- 3b. Note booking, audit log, document_logs, migration
with g7 as (
  select unnest(array[
    '8173c41e-d6ab-4133-8013-df23968a77be', 'c24206b7-c025-47c7-8fbc-b8bf27538a71',
    '33105ba6-1f76-4982-bdc9-0d34822a22d2', '1a7f2915-15fd-4cca-ad43-987e872d9f2e',
    'b083ff80-0f20-4260-9bf9-3bab8bf6d428', '6bfcb2de-1f8f-4bc2-8341-0f952cbcbf4b',
    'c853c0de-fb0b-4048-9967-9335c0e097b2']::uuid[]) as id
)
select 'note' as t, b.code as k, left(coalesce(b.note, '(null)'), 200) as v, b.updated_at::text as at
from bookings b join g7 on g7.id = b.group_id
union all
select 'audit', b.code, a.action || ' ' || coalesce(a.source, '') || ' ' || coalesce(a.actor_role, ''), a.at::text
from booking_audit_log a join bookings b on b.id = a.booking_id join g7 on g7.id = b.group_id
union all
select 'doclog', d.group_id::text, d.doc_type::text || ' ' || coalesce(d.note, ''), d.created_at::text
from document_logs d join g7 on g7.id = d.group_id
union all
select 'audit_first', 'min(at)', min(at)::text, null from booking_audit_log
union all
select 'migration', version, name, null
from supabase_migrations.schema_migrations
where version between '20260616' and '20260725'
order by 1, 4;

-- 3c. Group trùng (cùng khách / cùng mã OTA) — kiểm tiền có bị ghi 2 lần không.
--     Lọc theo group_id thay vì tên để file không chứa PII; mở rộng bằng tên khi chạy tay.
select g.id, g.source, g.ota_booking_number, g.paid, g.grand_total, g.net_revenue, g.status,
       g.created_at::date,
       (select json_agg(json_build_object('code', b.code, 'status', b.status, 'is_deleted', b.is_deleted,
                 'room', b.room_id, 'check_in', b.check_in, 'check_out', b.check_out,
                 'grand_total', b.grand_total, 'actual_check_out', b.actual_check_out))
        from bookings b where b.group_id = g.id) as bookings,
       (select json_agg(json_build_object('amount', p.amount, 'method', p.method, 'date', p.date,
                 'is_void', p.is_void, 'note', p.note))
        from payment_history p where p.group_id = g.id) as payments
from groups g
where g.id in ('b083ff80-0f20-4260-9bf9-3bab8bf6d428', 'bc520653-721f-42c6-8cf5-7dcbba34054c',
               'c853c0de-fb0b-4048-9967-9335c0e097b2', 'a2f36044-f6cd-4cc3-b1f0-ca5bfbc23398',
               '33105ba6-1f76-4982-bdc9-0d34822a22d2', 'e87a0660-7769-40dd-ab43-680955798f93')
order by g.created_at;

-- 3d. Booking khác ở cùng phòng/ngày với B3 (103, 06/06/2026)
select b.code, left(b.group_id::text, 8) as gid, b.room_id, b.check_in, b.check_out,
       b.status, b.is_deleted, b.grand_total, g.paid
from bookings b join groups g on g.id = b.group_id
where b.check_in <= '2026-06-06' and b.check_out > '2026-06-06' and b.room_id in ('103', '302');

-- ---------------------------------------------------------------------
-- 4. Ảnh hưởng báo cáo: có / không có payment của 7 group, theo tháng
-- ---------------------------------------------------------------------
with g7 as (
  select unnest(array[
    '8173c41e-d6ab-4133-8013-df23968a77be', 'c24206b7-c025-47c7-8fbc-b8bf27538a71',
    '33105ba6-1f76-4982-bdc9-0d34822a22d2', '1a7f2915-15fd-4cca-ad43-987e872d9f2e',
    'b083ff80-0f20-4260-9bf9-3bab8bf6d428', '6bfcb2de-1f8f-4bc2-8341-0f952cbcbf4b',
    'c853c0de-fb0b-4048-9967-9335c0e097b2']::uuid[]) as id
),
pay as (
  select date_trunc('month', p.date)::date as m, p.amount, p.method::text as method,
         p.group_id in (select id from g7) as is7
  from payment_history p
  where not p.is_void and p.date >= '2026-01-01'
)
select m,
       sum(amount) as payments_all,
       sum(amount) filter (where not is7) as payments_without7,
       sum(amount) filter (where is7) as diff_payments,
       sum(amount) filter (where method = 'cash') as cash_all,
       sum(amount) filter (where method = 'cash' and not is7) as cash_without7,
       sum(amount) filter (where method = 'cash' and is7) as diff_cash,
       (select coalesce(sum(so_tien), 0) from v_s1a_hkd v
         where date_trunc('month', v.ngay_ghi_so)::date = pay.m
           and v.booking_id in (select b.id from bookings b where b.group_id in (select id from g7))) as s1a_from7,
       (select coalesce(sum(room_net_revenue + service_revenue), 0) from daily_revenue d
         where date_trunc('month', d.stay_date)::date = pay.m
           and d.group_id in (select id from g7)) as daily_rev_from7
from pay
group by m
order by m;

-- 4b. View doanh thu theo booking có lọc booking đã xoá không, và có dòng nào từ 7 group không
select (pg_get_viewdef('public.monthly_revenue'::regclass) ilike '%is_deleted = false%') as monthly_revenue_filters_deleted,
       (pg_get_viewdef('public.monthly_revenue'::regclass) ilike '%payment_history%') as monthly_revenue_reads_payments,
       (select count(*) from finance_monthly_revenue
         where group_id in ('8173c41e-d6ab-4133-8013-df23968a77be', 'c24206b7-c025-47c7-8fbc-b8bf27538a71',
                            '33105ba6-1f76-4982-bdc9-0d34822a22d2', '1a7f2915-15fd-4cca-ad43-987e872d9f2e',
                            'b083ff80-0f20-4260-9bf9-3bab8bf6d428', '6bfcb2de-1f8f-4bc2-8341-0f952cbcbf4b',
                            'c853c0de-fb0b-4048-9967-9335c0e097b2')) as finance_rows_from7;

-- 4c. get_tax_threshold_summary(2026) — đọc từ v_s1a_hkd (booking checked-out chưa xoá)
select get_tax_threshold_summary(2026) as tom_tat;

-- ---------------------------------------------------------------------
-- 5. Quét DB: view / function / trigger đọc payment_history (Việc 2b)
-- ---------------------------------------------------------------------
select 'view' as kind, n.nspname || '.' || c.relname as obj,
       (pg_get_viewdef(c.oid) ilike '%is_void%') as has_void_filter
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('v', 'm')
  and n.nspname not in ('pg_catalog', 'information_schema')
  and pg_get_viewdef(c.oid) ilike '%payment_history%'
union all
select case when p.prorettype = 'trigger'::regtype then 'trigger_fn' else 'function' end,
       n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       p.prosrc ilike '%is_void%'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema')
  and p.prosrc ilike '%payment_history%'
union all
select 'trigger', t.tgname || ' on ' || t.tgrelid::regclass::text || ' -> ' || t.tgfoid::regproc::text, null
from pg_trigger t
where not t.tgisinternal and t.tgrelid = 'public.payment_history'::regclass
order by 1, 2;

-- 5b. Mã nguồn + quyền EXECUTE của các function liên quan
select p.proname, regexp_replace(p.prosrc, '\s+', ' ', 'g') as src,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('sync_group_net_revenue', 'checkout_booking_txn', 'record_payment_txn', 'void_payment_txn');

-- ---------------------------------------------------------------------
-- 6. Ngày mà cộng thô payment_history ≠ cộng khoản hợp lệ, và số daily-revenue-summary
--    đã ghi vào brain.daily_log (Edge Function cộng thô → sai ở các ngày có void)
-- ---------------------------------------------------------------------
with d as (
  select date, sum(amount) as all_rows, sum(amount) filter (where not is_void) as valid_only
  from payment_history
  group by date
  having sum(amount) is distinct from sum(amount) filter (where not is_void) or bool_or(is_void)
)
select d.date, d.all_rows, coalesce(d.valid_only, 0) as valid_only,
       (select (l.content::jsonb ->> 'total_revenue')::bigint
          from brain.daily_log l
         where l.category = 'revenue_summary' and l.log_date = d.date
         order by l.created_at desc limit 1) as brain_logged
from d
order by d.date;
