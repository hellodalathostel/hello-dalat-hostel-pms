-- Migration 01: rooms column-level grant cho anon
--
-- VAN DE: anon dang co SELECT toan bang public.rooms (15 cot), bao gom
-- ical_export_token, ota_feed_url, ota_import_hash, ota_last_synced_at
-- (nhay cam - co the dung de gia mao/doc iCal feed cua hostel) va
-- housekeeping_note (noi bo, khong lien quan nghiep vu public).
--
-- Xac nhan qua conversation_search: landing page (hellodalathostel.com)
-- KHONG doc bang rooms - gia phong hardcode trong lib/rooms.ts, form
-- chi INSERT vao booking_requests. Vay anon khong co nhu cau nghiep vu
-- doc rooms hien tai, nhung giu column-level grant (khong revoke tuyet
-- doi) de khong phá vo neu co consumer public an nao trong tuong lai,
-- theo huong dan cua Hieu.
--
-- 9 cot AN TOAN duoc grant lai (giu dung theo mo ta goc trong Brain):
-- id, name, type, capacity, base_price, floor, is_active, created_at, updated_at.
-- KHONG dua housekeeping_status/housekeeping_note vao day - la du lieu van hanh
-- noi bo, chua co xac nhan can public. Neu sau nay can, lam mot GRANT rieng.
--
-- REVOKE ca PUBLIC lan anon (theo yeu cau Hieu - phong grant an qua PUBLIC
-- khong hien trong information_schema.role_table_grants).

BEGIN;

REVOKE SELECT ON public.rooms FROM PUBLIC, anon;

GRANT SELECT (
  id,
  name,
  type,
  capacity,
  base_price,
  floor,
  is_active,
  created_at,
  updated_at
) ON public.rooms TO anon;

COMMIT;

-- VERIFY sau khi apply:
-- SELECT has_table_privilege('anon','public.rooms','SELECT'); -- ky vong: false (khong con full-table)
-- SELECT has_column_privilege('anon','public.rooms','ical_export_token','SELECT'); -- ky vong: false
-- SELECT has_column_privilege('anon','public.rooms','name','SELECT'); -- ky vong: true

-- SMOKE-TEST CAN LAM SAU KHI APPLY (theo luu y cua Hieu):
--   Khong co consumer public nao xac nhan dung anon doc rooms hien tai
--   (landing page dung service-side/hardcode, PMS dung session authenticated).
--   Neu Hieu biet co widget/script nao khac dang query truc tiep anon key
--   vao rooms, can test lai sau khi apply.
