truncate table public.bookings_overlap_test;

insert into public.bookings_overlap_test (id, room_id, check_in, check_out, status)
select id, room_id, check_in, check_out, status
from public.bookings;
