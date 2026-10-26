-- =====================================================================
-- Audit 16/10/2026: groups.paid so với SUM(payment_history.amount) hợp lệ
-- + truy vết khoản 100.000 ngày 17/05/2026 + chuẩn bị xử lý B1–B4
-- Project: rcfhhgywjdwqcgnpkbtl
--
-- KHÔNG PHẢI MIGRATION. CHỈ SELECT. Không chứa tên khách — chỉ mã group rút gọn.
--
-- Kết quả chạy 16/10/2026 (sau khi void A1–A3):
--   634 group (1 is_deleted), 567 dòng payment_history. 3 group lệch:
--     c90a7d27  paid 869.330  hợp lệ 0          chênh +869.330  0 payment, deposit_method = cash
--     96facdfb  paid 215.000  hợp lệ 15.000     chênh +200.000  note "thanh toán đủ 200,000đ qua thẻ"
--     b2538a1d  paid 2.157.848 hợp lệ 2.057.848 chênh +100.000  payment cuối 03/06 (thẻ)
--   Không RPC nào ngoài record_payment_txn / void_payment_txn / checkout_*_txn ghi groups.paid
--   → paid của 3 group trên được ghi trực tiếp, hoặc dòng payment đã bị xoá trực tiếp.
--
--   17/05/2026: brain.daily_log (ghi 18/05 01:00) = 150.000 = cash 50.000 + transfer 100.000.
--   Hiện chỉ còn cash 50.000 (group c853c0de). Khoản transfer 100.000 không còn trong
--   payment_history, không có dòng void → bị DELETE trực tiếp (void_payment_txn luôn trừ paid
--   và để lại dòng đảo). Ứng viên mạnh nhất: b2538a1d (Booking.com, ở 25–31/05, tạo 09/05;
--   thanh toán cuối 03/06 = grand_total − 100.000 → lúc checkout paid đã gồm 100.000).
--   Ai xoá / khi nào: [Không xác nhận được] — payment_history không có audit log,
--   bank_book_detail chỉ có từ 22/07/2026, repo không có lệnh DELETE payment_history.
--   Cửa sổ thời gian: sau 18/05/2026 01:00 (brain log còn thấy) — trước 16/10/2026.
--   Bối cảnh: flow void_payment_txn chỉ có từ 28/05/2026 (brain.daily_log 'dev').
-- =====================================================================

-- 1. Group lệch paid vs tổng payment hợp lệ (kể cả group is_deleted)
with s as (
  select g.id, g.paid, g.is_deleted, g.created_at,
         coalesce(sum(p.amount) filter (where not p.is_void), 0) as valid_sum,
         coalesce(sum(p.amount), 0) as all_sum,
         max(p.date) as last_pay_date,
         count(p.id) as n_pay
  from groups g
  left join payment_history p on p.group_id = g.id
  group by g.id
)
select left(id::text, 8) as gid, paid, valid_sum, paid - valid_sum as diff, all_sum,
       is_deleted, last_pay_date, n_pay, created_at::date
from s
where paid is distinct from valid_sum
order by abs(paid - valid_sum) desc;

select count(*) as groups_total, count(*) filter (where is_deleted) as groups_deleted,
       (select count(*) from payment_history) as pay_rows
from groups;

-- 2. Chi tiết 3 group lệch (bookings, payments, request log, document_logs snapshot)
select left(g.id::text, 8) as gid, g.source, g.status, g.paid, g.grand_total, g.deposit_method,
       g.created_at, g.updated_at,
       (select json_agg(json_build_object('code', b.code, 'status', b.status, 'is_deleted', b.is_deleted,
                 'room', b.room_id, 'check_in', b.check_in, 'check_out', b.check_out,
                 'grand_total', b.grand_total, 'updated_at', b.updated_at) order by b.check_in)
        from bookings b where b.group_id = g.id) as bookings,
       (select json_agg(json_build_object('id', left(p.id::text, 8), 'amount', p.amount, 'method', p.method,
                 'date', p.date, 'is_void', p.is_void, 'created_at', p.created_at))
        from payment_history p where p.group_id = g.id) as payments,
       (select json_agg(json_build_object('amount', r.amount, 'method', r.method, 'created_at', r.created_at))
        from payment_request_log r where r.group_id = g.id) as request_log,
       (select json_agg(json_build_object('doc_type', d.doc_type, 'created_at', d.created_at,
                 'paid_snapshot', d.content_snapshot -> 'paid'))
        from document_logs d where d.group_id = g.id) as docs
from groups g
where left(g.id::text, 8) in ('c90a7d27', '96facdfb', 'b2538a1d');

-- 3. RPC/function nào ghi groups.paid (ngoài record/void/checkout)
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosrc ilike '%paid%' and p.prosrc ilike '%groups%'
order by 1;

-- 4. Dấu vết 17/05/2026
select log_date, created_at, content
from brain.daily_log
where category = 'revenue_summary' and log_date = '2026-05-17';

select date, amount, method, is_void, created_at
from payment_history
where date = '2026-05-17';

select min(txn_date) as bank_book_from, max(txn_date) as bank_book_to from bank_book_detail;

select log_date, category, left(content, 160) as content
from brain.daily_log
where log_date between '2026-05-17' and '2026-06-03'
  and category <> 'revenue_summary'
  and (content ilike '%payment%' or content ilike '%thanh toán%' or content ilike '%xoá%'
       or content ilike '%xóa%' or content ilike '%delete%');

-- =====================================================================
-- 5. Chuẩn bị xử lý B1–B4 (Bước 1 — chỉ SELECT)
--    B2: b083ff80 (trùng, booking đã xoá) + bc520653 (thật)
--    B4: c853c0de (trùng, booking đã xoá) + a2f36044 (thật)
--    B3: 6bfcb2de      B1: 1a7f2915
-- =====================================================================

-- 5a. Toàn bộ payment_history (kể cả void/đảo) của 6 group
with g6 as (
  select * from (values ('B2-trung', 'b083ff80'), ('B2-that', 'bc520653'), ('B4-trung', 'c853c0de'),
                        ('B4-that', 'a2f36044'), ('B3', '6bfcb2de'), ('B1', '1a7f2915')) v(lbl, pfx)
)
select g6.lbl, g.id as gid, g.paid, g.grand_total, g.is_deleted, g.status as group_status,
       (select string_agg(b.code || '(' || b.status || case when b.is_deleted then ',del' else '' end || ')',
                          ', ' order by b.check_in)
        from bookings b where b.group_id = g.id) as bookings,
       (select json_agg(json_build_object('id', p.id, 'amount', p.amount, 'method', p.method, 'date', p.date,
                 'is_void', p.is_void, 'reversal_of', p.voided_payment_id, 'note', p.note,
                 'created_at', p.created_at) order by p.created_at)
        from payment_history p where p.group_id = g.id) as payments
from g6
join groups g on left(g.id::text, 8) = g6.pfx
order by g6.lbl;

-- 5b. Có cơ chế hoàn tiền riêng không
select 'enum_payment_method' as t, string_agg(e.enumlabel, ',' order by e.enumsortorder) as v
from pg_enum e join pg_type ty on ty.oid = e.enumtypid where ty.typname = 'payment_method'
union all
select 'check_payment_history', string_agg(conname || ': ' || pg_get_constraintdef(oid), ' | ')
from pg_constraint where conrelid = 'public.payment_history'::regclass and contype = 'c'
union all
select 'fn_refund_like', string_agg(n.nspname || '.' || p.proname, ' | ')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema')
  and (p.proname ilike '%refund%' or p.proname ilike '%hoan%' or p.prosrc ilike '%refund%')
union all
select 'cash_book_entries_checks', string_agg(conname || ': ' || pg_get_constraintdef(oid), ' | ')
from pg_constraint where conrelid = 'public.cash_book_entries'::regclass and contype = 'c';

-- 5d. Số liệu gốc
select 'cash_in_by_month' as t,
       (select json_object_agg(m, s) from (select to_char(entry_date, 'YYYY-MM') as m,
               sum(amount) filter (where direction = 'in') as s
          from cash_book_detail where entry_date between '2026-05-01' and '2026-07-31' group by 1) x)::text as v
union all
select 'payments_valid_by_month_method',
       (select json_object_agg(k, s) from (select to_char(date, 'YYYY-MM') || '_' || method as k, sum(amount) as s
          from payment_history where not is_void and date between '2026-05-01' and '2026-07-31' group by 1) x)::text
union all
select 'bank_mpos_reconciliation', (select row_to_json(r)::text from bank_mpos_reconciliation r limit 1)
union all
select 'bank_reconciliation_rows', (select count(*)::text from bank_reconciliation)
union all
select 'cash_shifts_closed_05_07', (select count(*)::text from cash_shifts
                                     where shift_date between '2026-05-01' and '2026-07-31' and closed_at is not null)
union all
select 'first_cash_shift', (select min(shift_date)::text from cash_shifts)
union all
select 's1a_2026', (select sum(so_tien)::text from v_s1a_hkd where nam = 2026)
union all
select 'tax_2026', (select json_build_object('total_actual', j -> 'total_actual', 'forecast', j -> 'forecast_total')::text
                    from (select get_tax_threshold_summary(2026)::jsonb as j) t)
union all
select 'finance_monthly_by_checkout_month',
       (select json_object_agg(m, s) from (select to_char(check_out, 'YYYY-MM') as m, sum(net_revenue) as s
          from finance_monthly_revenue where check_out between '2026-05-01' and '2026-08-01' group by 1) x)::text
union all
select 'monthly_revenue',
       (select json_object_agg(month, s) from (select month::text, sum(net_revenue) as s
          from monthly_revenue where month between '2026-05-01' and '2026-07-31' group by 1) x)::text;
