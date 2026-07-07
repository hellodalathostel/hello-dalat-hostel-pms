-- Chan double-booking o tang DB: khong cho 2 booking active cung room_id
-- co date range chong lan, chi ap dung tu check_in >= 2026-07-05 tro di.
-- Booking truoc moc nay (bi anh huong boi loi Booking.com doi room_id mapping,
-- confirmed 2026-07-05) giu nguyen, khong bi constraint nay kiem tra.
create extension if not exists btree_gist;

alter table public.bookings
add constraint no_overlapping_bookings_from_20260705
exclude using gist (
  room_id with =,
  daterange(check_in, check_out, '[)') with &&
) where (
  status not in ('cancelled')
  and (is_deleted = false or is_deleted is null)
  and check_in >= '2026-07-05'
);
