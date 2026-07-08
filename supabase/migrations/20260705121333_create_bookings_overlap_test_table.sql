-- Bảng test tạm để verify EXCLUDE constraint trước khi apply lên bookings thật
-- Sẽ drop ngay sau khi test xong
create extension if not exists btree_gist;

create table if not exists public.bookings_overlap_test (
  id uuid,
  room_id text not null,
  check_in date not null,
  check_out date not null,
  status text not null
);

-- Copy toàn bộ data thật (chỉ các cột cần) để test với data thực tế, không chỉ case đã biết
insert into public.bookings_overlap_test (id, room_id, check_in, check_out, status)
select id, room_id, check_in, check_out, status
from public.bookings;

-- RLS bắt buộc theo rule migration, dù là bảng test tạm trong public schema
alter table public.bookings_overlap_test enable row level security;

-- Không grant cho anon/authenticated — chỉ service_role (mặc định) truy cập được qua MCP/execute_sql
revoke all on public.bookings_overlap_test from anon, authenticated;
