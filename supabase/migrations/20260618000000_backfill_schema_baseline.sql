-- ============================================================================
-- BACKFILL MIGRATION — Schema baseline checkpoint
-- Ngày tạo: 2026-06-18
-- Mục đích: Repo trước đây chỉ có 4 migration files (ALTER/RLS/RPC), không có
-- CREATE TABLE history cho 23 bảng public hiện có trong DB. File này dump lại
-- schema THẬT đang chạy production để Git phản ánh đúng trạng thái DB.
-- File này KHÔNG thay đổi gì trong DB khi apply lại (idempotent) — chỉ là
-- checkpoint lịch sử. Từ giờ, MỌI thay đổi schema phải qua migration file mới,
-- không sửa Dashboard (nguyên tắc số 5).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.block_reason AS ENUM ('maintenance','owner_use','ota_closed','deep_cleaning','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.booking_request_status AS ENUM ('pending','confirmed','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.booking_source AS ENUM ('Booking.com','Facebook','Gọi điện/Zalo','Khách quen','Walk-in','Other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.booking_status AS ENUM ('booked','checked-in','checked-out','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.bot_lead_status AS ENUM ('pending','closed','converted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cash_txn_channel AS ENUM ('cash','qr','transfer','mpos','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cash_txn_type AS ENUM ('income','expense');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.doc_format AS ENUM ('pdf','zalo_text','email_html');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.doc_kind AS ENUM ('booking_confirmation','deposit_request','deposit_confirmation','invoice','arrival_notice');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.document_type AS ENUM ('CCCD','Hộ chiếu','Giấy tờ khác');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.expense_category AS ENUM ('Lương nhân viên','Điện nước','Vệ sinh','Sửa chữa','Marketing','Khác','Thuế & Phí');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.housekeeping_status AS ENUM ('clean','dirty','cleaning','out_of_order');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('cash','transfer','card','other','momo','zalopay');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pricing_rule_type AS ENUM ('weekend','peak_season','holiday','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.residency_type AS ENUM ('Thường trú','Tạm trú','Địa chỉ khác');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.service_type AS ENUM ('own','partner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('owner','staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rooms (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  capacity integer NOT NULL DEFAULT 2,
  base_price integer NOT NULL,
  floor integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  housekeeping_status public.housekeeping_status NOT NULL DEFAULT 'clean',
  housekeeping_note text,
  ical_export_token text NOT NULL,
  ota_feed_url text,
  ota_import_hash text,
  ota_last_synced_at timestamptz,
  CONSTRAINT rooms_ical_export_token_unique UNIQUE (ical_export_token)
);
COMMENT ON COLUMN public.rooms.ical_export_token IS 'Secret token để bảo vệ URL iCal export. URL dạng: /functions/v1/ical-feed?room=101&token={token}. Không đổi trừ khi bị lộ.';
COMMENT ON COLUMN public.rooms.ota_feed_url IS 'URL iCal feed từ Booking.com/Agoda — NULL nghĩa là phòng chưa kết nối OTA';
COMMENT ON COLUMN public.rooms.ota_import_hash IS 'Hash SHA-256 của raw iCal text lần sync gần nhất — dùng để skip nếu feed không đổi';
COMMENT ON COLUMN public.rooms.ota_last_synced_at IS 'Timestamp lần cuối sync thành công';

CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  firebase_uid text,
  email text NOT NULL,
  name text,
  role public.user_role NOT NULL DEFAULT 'staff',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_users_email_key UNIQUE (email),
  CONSTRAINT app_users_firebase_uid_key UNIQUE (firebase_uid)
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  firebase_id text,
  full_name text NOT NULL,
  date_of_birth date,
  gender text CHECK (gender = ANY (ARRAY['Nam'::text, 'Nữ'::text])),
  nationality text,
  country text,
  document_type public.document_type,
  document_name text,
  document_number text,
  phone text,
  residency_type public.residency_type,
  province text,
  district text,
  ward text,
  address_detail text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_firebase_id_key UNIQUE (firebase_id),
  CONSTRAINT uq_customers_doc UNIQUE (document_type, document_number)
);

CREATE TABLE IF NOT EXISTS public.services (
  id text PRIMARY KEY,
  name text NOT NULL,
  price integer NOT NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  service_type public.service_type NOT NULL DEFAULT 'own'
);

CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  rule_type public.pricing_rule_type NOT NULL,
  room_id text REFERENCES public.rooms(id) ON DELETE CASCADE,
  multiplier numeric,
  flat_amount integer,
  start_date date,
  end_date date,
  day_of_week integer[],
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pricing_dates CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  CONSTRAINT chk_pricing_method CHECK ((multiplier IS NOT NULL AND flat_amount IS NULL) OR (multiplier IS NULL AND flat_amount IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  firebase_id text,
  customer_name text NOT NULL,
  customer_phone text,
  customer_note text,
  customer_cccd text,
  source public.booking_source,
  channel_fee_rate numeric NOT NULL DEFAULT 0,
  external_ical_uid text,
  external_source text,
  external_imported_at timestamptz,
  ota_booking_number text,
  paid integer NOT NULL DEFAULT 0,
  deposit_method public.payment_method,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  net_revenue integer NOT NULL DEFAULT 0,
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT groups_firebase_id_key UNIQUE (firebase_id),
  CONSTRAINT groups_ota_booking_number_key UNIQUE (ota_booking_number)
);
COMMENT ON COLUMN public.groups.net_revenue IS 'Set bởi app khi checkout: ROUND(grand_total * (1 - channel_fee_rate))';
COMMENT ON COLUMN public.groups.is_deleted IS 'Soft delete cho group. TRUE = group đã bị xóa, không hiển thị trên UI.';

CREATE TABLE IF NOT EXISTS public.payment_history (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  method public.payment_method,
  date date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_void boolean NOT NULL DEFAULT false,
  voided_payment_id uuid REFERENCES public.payment_history(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  firebase_id text,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  room_id text NOT NULL REFERENCES public.rooms(id),
  check_in date NOT NULL,
  check_out date NOT NULL,
  nights integer GENERATED ALWAYS AS (check_out - check_in) STORED,
  price_per_night integer NOT NULL DEFAULT 0,
  surcharge integer NOT NULL DEFAULT 0,
  grand_total integer NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0 CHECK (tax_rate >= 0::numeric AND tax_rate < 1::numeric),
  tax_amount integer NOT NULL DEFAULT 0,
  has_early_check_in boolean NOT NULL DEFAULT false,
  has_late_check_out boolean NOT NULL DEFAULT false,
  guest_name text,
  guests_count integer NOT NULL DEFAULT 1,
  status public.booking_status NOT NULL DEFAULT 'booked',
  is_deleted boolean NOT NULL DEFAULT false,
  sync_to_group boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  actual_check_in timestamptz,
  actual_check_out timestamptz,
  room_subtotal integer NOT NULL DEFAULT 0,
  external_ical_uid text,
  ota_booking_number text,
  is_sticky boolean NOT NULL DEFAULT false,
  code text,
  CONSTRAINT chk_booking_dates CHECK (check_out > check_in),
  CONSTRAINT bookings_code_key UNIQUE (code),
  CONSTRAINT bookings_firebase_id_key UNIQUE (firebase_id)
);
COMMENT ON COLUMN public.bookings.external_ical_uid IS 'UID từ VEVENT của iCal OTA (Booking.com). NULL = booking nội bộ. Dùng để dedup khi re-import.';
COMMENT ON COLUMN public.bookings.ota_booking_number IS 'Số booking OTA hiển thị với khách (vd: BDC-1234567890). Lấy từ SUMMARY hoặc DESCRIPTION của iCal.';
COMMENT ON COLUMN public.bookings.is_sticky IS 'TRUE = booking được ghim, không bị overwrite khi re-import iCal từ OTA.';

CREATE TABLE IF NOT EXISTS public.booking_guests (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_booking_customer UNIQUE (booking_id, customer_id)
);

CREATE TABLE IF NOT EXISTS public.booking_services (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  service_id text REFERENCES public.services(id) ON DELETE SET NULL,
  name text NOT NULL,
  price integer NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.booking_discounts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_blocks (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  room_id text NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason public.block_reason NOT NULL DEFAULT 'other',
  note text,
  ota_uid text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_block_dates CHECK (end_date > start_date)
);

CREATE TABLE IF NOT EXISTS public.ota_calendar_feed (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  room_id text NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  ical_uid text NOT NULL,
  ota_source text NOT NULL DEFAULT 'Booking.com',
  check_in date NOT NULL,
  check_out date NOT NULL,
  summary text,
  status text,
  ota_booking_num text,
  linked_group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  ical_feed_id uuid,
  import_hash text,
  raw_ical_snapshot text,
  is_cancelled boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id),
  CONSTRAINT chk_ota_dates CHECK (check_out > check_in),
  CONSTRAINT uq_ota_uid UNIQUE (room_id, ical_uid)
);
COMMENT ON TABLE public.ota_calendar_feed IS 'Raw iCal events fetch từ OTA. Mỗi row = 1 VEVENT. Dùng upsert ON CONFLICT (room_id, ical_uid).';
COMMENT ON COLUMN public.ota_calendar_feed.import_hash IS 'Hash (hex) của toàn bộ iCal feed tại thời điểm sync. Edge Function so sánh hash để skip nếu không đổi.';
COMMENT ON COLUMN public.ota_calendar_feed.raw_ical_snapshot IS 'Nội dung raw iCal text của lần sync gần nhất (debug/audit). Nullable — không bắt buộc lưu.';

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  firebase_id text,
  category public.expense_category NOT NULL DEFAULT 'Khác',
  description text,
  amount integer NOT NULL DEFAULT 0,
  date date NOT NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  payment_method public.payment_method,
  CONSTRAINT expenses_firebase_id_key UNIQUE (firebase_id)
);

CREATE TABLE IF NOT EXISTS public.bot_leads (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  chat_id bigint NOT NULL,
  content text NOT NULL,
  remind_at timestamptz,
  status public.bot_lead_status NOT NULL DEFAULT 'pending',
  group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tours (
  id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name text NOT NULL,
  partner text,
  duration text,
  price_weekday integer NOT NULL,
  price_weekend integer,
  pickup_time text,
  suitable_for text,
  included text,
  not_included text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.revenue_manual_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period date NOT NULL,
  source text NOT NULL CHECK (source = ANY (ARRAY['room_cash'::text, 'service'::text, 'other'::text])),
  description text,
  amount integer NOT NULL CHECK (amount > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.revenue_manual_log IS 'Doanh thu thực tế chưa vào PMS: tiền mặt, tour, dịch vụ lẻ. Merge với bookings để tính thuế.';

CREATE TABLE IF NOT EXISTS public.document_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  doc_type public.doc_kind NOT NULL,
  doc_format public.doc_format NOT NULL,
  content_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  sent_via text,
  recipient_name text,
  recipient_phone text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cash_transactions (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  txn_type public.cash_txn_type NOT NULL,
  channel public.cash_txn_channel NOT NULL,
  txn_date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  note text,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  amount integer NOT NULL CHECK (amount > 0),
  gross_amount integer,
  fee_rate numeric DEFAULT 4.00,
  fee_amount integer,
  net_amount integer,
  mpos_txn_id text,
  card_number text,
  email_message_id text,
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_mpos_fields CHECK (channel <> 'mpos'::public.cash_txn_channel OR (gross_amount IS NOT NULL AND fee_amount IS NOT NULL AND net_amount IS NOT NULL AND mpos_txn_id IS NOT NULL)),
  CONSTRAINT cash_transactions_email_message_id_key UNIQUE (email_message_id),
  CONSTRAINT cash_transactions_mpos_txn_id_key UNIQUE (mpos_txn_id)
);

CREATE TABLE IF NOT EXISTS public.booking_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  room_id text NOT NULL REFERENCES public.rooms(id),
  check_in date NOT NULL,
  check_out date NOT NULL,
  note text,
  status public.booking_request_status NOT NULL DEFAULT 'pending',
  rejected_reason text,
  converted_group_id uuid REFERENCES public.groups(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_booking_request_dates CHECK (check_out > check_in)
);

CREATE TABLE IF NOT EXISTS public.telegram_task_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  task_index smallint NOT NULL,
  notion_page_id text NOT NULL,
  task_name text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id text NOT NULL REFERENCES public.rooms(id),
  reported_by text NOT NULL DEFAULT 'staff',
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status = ANY (ARRAY['open'::text, 'resolved'::text])),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS public.ops_tasks_id_seq;

CREATE TABLE IF NOT EXISTS public.ops_tasks (
  id bigint PRIMARY KEY DEFAULT nextval('public.ops_tasks_id_seq'::regclass),
  task_name text NOT NULL,
  task_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date,
  loai text NOT NULL DEFAULT 'Khac' CHECK (loai = ANY (ARRAY['Don Phong'::text, 'Check-in/out'::text, 'Bao Tri'::text, 'Mua Sam'::text, 'Admin'::text, 'Khac'::text])),
  priority text NOT NULL DEFAULT 'Binh Thuong' CHECK (priority = ANY (ARRAY['Khan'::text, 'Cao'::text, 'Binh Thuong'::text, 'Thap'::text])),
  status text NOT NULL DEFAULT 'Can Lam' CHECK (status = ANY (ARRAY['Can Lam'::text, 'Dang Lam'::text, 'Hoan Thanh'::text, 'Bo Qua'::text])),
  room_id text REFERENCES public.rooms(id),
  nguoi_thuc_hien text DEFAULT 'Loi',
  ghi_chu text,
  created_by text DEFAULT 'staff_telegram',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER SEQUENCE public.ops_tasks_id_seq OWNED BY public.ops_tasks.id;

-- ----------------------------------------------------------------------------
-- INDEXES (ngoài PK/UNIQUE đã khai báo inline ở trên)
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_booking_discounts_booking ON public.booking_discounts USING btree (booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_guests_booking ON public.booking_guests USING btree (booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_guests_customer ON public.booking_guests USING btree (customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_primary_guest_per_booking ON public.booking_guests USING btree (booking_id) WHERE (is_primary = true);

CREATE INDEX IF NOT EXISTS idx_booking_requests_dates ON public.booking_requests USING btree (check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_booking_requests_room ON public.booking_requests USING btree (room_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON public.booking_requests USING btree (status);

CREATE INDEX IF NOT EXISTS idx_booking_services_booking ON public.booking_services USING btree (booking_id);

CREATE INDEX IF NOT EXISTS idx_bookings_availability ON public.bookings USING btree (room_id, check_in, check_out) WHERE (is_deleted = false AND status <> 'cancelled'::public.booking_status);
CREATE INDEX IF NOT EXISTS idx_bookings_check_in ON public.bookings USING btree (check_in);
CREATE INDEX IF NOT EXISTS idx_bookings_check_out ON public.bookings USING btree (check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_external_ical_uid ON public.bookings USING btree (external_ical_uid) WHERE (external_ical_uid IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_bookings_group_id ON public.bookings USING btree (group_id);
CREATE INDEX IF NOT EXISTS idx_bookings_room_id ON public.bookings USING btree (room_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings USING btree (status);

CREATE INDEX IF NOT EXISTS idx_bot_leads_remind_at ON public.bot_leads USING btree (remind_at) WHERE (status = 'pending'::public.bot_lead_status);
CREATE INDEX IF NOT EXISTS idx_bot_leads_status ON public.bot_leads USING btree (status);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_booking_id ON public.cash_transactions USING btree (booking_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_channel ON public.cash_transactions USING btree (channel);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_txn_date ON public.cash_transactions USING btree (txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_txn_type ON public.cash_transactions USING btree (txn_type);

CREATE INDEX IF NOT EXISTS idx_customers_doc_number ON public.customers USING btree (document_number);
CREATE INDEX IF NOT EXISTS idx_customers_full_name ON public.customers USING btree (full_name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers USING btree (phone);

CREATE INDEX IF NOT EXISTS idx_document_logs_doc_type ON public.document_logs USING btree (doc_type);
CREATE INDEX IF NOT EXISTS idx_document_logs_group_id ON public.document_logs USING btree (group_id);

CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses USING btree (category);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses USING btree (date);

CREATE INDEX IF NOT EXISTS idx_groups_customer_name ON public.groups USING btree (customer_name);
CREATE INDEX IF NOT EXISTS idx_groups_external_ical ON public.groups USING btree (external_ical_uid);
CREATE INDEX IF NOT EXISTS idx_groups_is_deleted ON public.groups USING btree (is_deleted) WHERE (is_deleted = false);
CREATE INDEX IF NOT EXISTS idx_groups_ota_number ON public.groups USING btree (ota_booking_number);
CREATE INDEX IF NOT EXISTS idx_groups_source ON public.groups USING btree (source);
CREATE INDEX IF NOT EXISTS idx_groups_status ON public.groups USING btree (status);

CREATE INDEX IF NOT EXISTS idx_ops_tasks_date_status ON public.ops_tasks USING btree (task_date, status);
CREATE INDEX IF NOT EXISTS idx_ops_tasks_room ON public.ops_tasks USING btree (room_id);

CREATE INDEX IF NOT EXISTS idx_ota_feed_linked ON public.ota_calendar_feed USING btree (linked_group_id) WHERE (linked_group_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ota_feed_room_dates ON public.ota_calendar_feed USING btree (room_id, check_in, check_out);

CREATE INDEX IF NOT EXISTS idx_payment_history_group ON public.payment_history USING btree (group_id);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_active ON public.pricing_rules USING btree (is_active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_room ON public.pricing_rules USING btree (room_id);

CREATE INDEX IF NOT EXISTS idx_revenue_manual_log_period ON public.revenue_manual_log USING btree (period);

CREATE INDEX IF NOT EXISTS idx_room_blocks_dates ON public.room_blocks USING btree (room_id, start_date, end_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_room_blocks_ota_uid ON public.room_blocks USING btree (ota_uid) WHERE (ota_uid IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_room_blocks_room ON public.room_blocks USING btree (room_id);

CREATE INDEX IF NOT EXISTS idx_room_issues_room_id ON public.room_issues USING btree (room_id);
CREATE INDEX IF NOT EXISTS idx_room_issues_status ON public.room_issues USING btree (status) WHERE (status = 'open'::text);

CREATE INDEX IF NOT EXISTS idx_tts_date ON public.telegram_task_sessions USING btree (session_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tts_date_idx ON public.telegram_task_sessions USING btree (session_date, task_index);

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_calendar_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_manual_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_task_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_tasks ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- RLS POLICIES
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS app_users_owner ON public.app_users;
CREATE POLICY app_users_owner ON public.app_users AS PERMISSIVE FOR ALL TO authenticated
  USING (current_user_role() = 'owner'::public.user_role)
  WITH CHECK (current_user_role() = 'owner'::public.user_role);

DROP POLICY IF EXISTS app_users_self ON public.app_users;
CREATE POLICY app_users_self ON public.app_users AS PERMISSIVE FOR SELECT TO authenticated
  USING (id = auth.uid() OR current_user_role() = 'owner'::public.user_role);

DROP POLICY IF EXISTS auth_read ON public.booking_discounts;
CREATE POLICY auth_read ON public.booking_discounts AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS auth_write ON public.booking_discounts;
CREATE POLICY auth_write ON public.booking_discounts AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_read ON public.booking_guests;
CREATE POLICY auth_read ON public.booking_guests AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS auth_write ON public.booking_guests;
CREATE POLICY auth_write ON public.booking_guests AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_insert_booking_request ON public.booking_requests;
CREATE POLICY anon_insert_booking_request ON public.booking_requests AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS auth_select_booking_requests ON public.booking_requests;
CREATE POLICY auth_select_booking_requests ON public.booking_requests AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS auth_update_booking_requests ON public.booking_requests;
CREATE POLICY auth_update_booking_requests ON public.booking_requests AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_read ON public.booking_services;
CREATE POLICY auth_read ON public.booking_services AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS auth_write ON public.booking_services;
CREATE POLICY auth_write ON public.booking_services AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_read ON public.bookings;
CREATE POLICY auth_read ON public.bookings AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS auth_write ON public.bookings;
CREATE POLICY auth_write ON public.bookings AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_read ON public.bot_leads;
CREATE POLICY auth_read ON public.bot_leads AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS auth_write ON public.bot_leads;
CREATE POLICY auth_write ON public.bot_leads AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS owner_full_access ON public.cash_transactions;
CREATE POLICY owner_full_access ON public.cash_transactions AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_read ON public.customers;
CREATE POLICY auth_read ON public.customers AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS auth_write ON public.customers;
CREATE POLICY auth_write ON public.customers AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated insert document_logs" ON public.document_logs;
CREATE POLICY "authenticated insert document_logs" ON public.document_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated read document_logs" ON public.document_logs;
CREATE POLICY "authenticated read document_logs" ON public.document_logs AS PERMISSIVE FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS auth_read ON public.expenses;
CREATE POLICY auth_read ON public.expenses AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS auth_write ON public.expenses;
CREATE POLICY auth_write ON public.expenses AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_read ON public.groups;
CREATE POLICY auth_read ON public.groups AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS auth_write ON public.groups;
CREATE POLICY auth_write ON public.groups AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ops_tasks_insert_authenticated ON public.ops_tasks;
CREATE POLICY ops_tasks_insert_authenticated ON public.ops_tasks AS PERMISSIVE FOR INSERT TO public WITH CHECK (auth.role() = 'authenticated'::text);
DROP POLICY IF EXISTS ops_tasks_select_authenticated ON public.ops_tasks;
CREATE POLICY ops_tasks_select_authenticated ON public.ops_tasks AS PERMISSIVE FOR SELECT TO public USING (auth.role() = 'authenticated'::text);
DROP POLICY IF EXISTS ops_tasks_update_authenticated ON public.ops_tasks;
CREATE POLICY ops_tasks_update_authenticated ON public.ops_tasks AS PERMISSIVE FOR UPDATE TO public USING (auth.role() = 'authenticated'::text);

DROP POLICY IF EXISTS auth_read ON public.ota_calendar_feed;
CREATE POLICY auth_read ON public.ota_calendar_feed AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS auth_write ON public.ota_calendar_feed;
CREATE POLICY auth_write ON public.ota_calendar_feed AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_read ON public.payment_history;
CREATE POLICY auth_read ON public.payment_history AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS auth_write ON public.payment_history;
CREATE POLICY auth_write ON public.payment_history AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_read ON public.pricing_rules;
CREATE POLICY auth_read ON public.pricing_rules AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS owner_write ON public.pricing_rules;
CREATE POLICY owner_write ON public.pricing_rules AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (current_user_role() = 'owner'::public.user_role);

DROP POLICY IF EXISTS "authenticated can delete revenue_manual_log" ON public.revenue_manual_log;
CREATE POLICY "authenticated can delete revenue_manual_log" ON public.revenue_manual_log AS PERMISSIVE FOR DELETE TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated can insert revenue_manual_log" ON public.revenue_manual_log;
CREATE POLICY "authenticated can insert revenue_manual_log" ON public.revenue_manual_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated can select revenue_manual_log" ON public.revenue_manual_log;
CREATE POLICY "authenticated can select revenue_manual_log" ON public.revenue_manual_log AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated can update revenue_manual_log" ON public.revenue_manual_log;
CREATE POLICY "authenticated can update revenue_manual_log" ON public.revenue_manual_log AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_read ON public.room_blocks;
CREATE POLICY auth_read ON public.room_blocks AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS auth_write ON public.room_blocks;
CREATE POLICY auth_write ON public.room_blocks AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS authenticated_full_access ON public.room_issues;
CREATE POLICY authenticated_full_access ON public.room_issues AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_read_rooms ON public.rooms;
CREATE POLICY anon_read_rooms ON public.rooms AS PERMISSIVE FOR SELECT TO anon USING (is_active = true);
DROP POLICY IF EXISTS auth_read ON public.rooms;
CREATE POLICY auth_read ON public.rooms AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS owner_write ON public.rooms;
CREATE POLICY owner_write ON public.rooms AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (current_user_role() = 'owner'::public.user_role);
DROP POLICY IF EXISTS rooms_authenticated_update_housekeeping ON public.rooms;
CREATE POLICY rooms_authenticated_update_housekeeping ON public.rooms AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_read ON public.services;
CREATE POLICY auth_read ON public.services AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS owner_write ON public.services;
CREATE POLICY owner_write ON public.services AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (current_user_role() = 'owner'::public.user_role);

DROP POLICY IF EXISTS authenticated_read_today ON public.telegram_task_sessions;
CREATE POLICY authenticated_read_today ON public.telegram_task_sessions AS PERMISSIVE FOR SELECT TO authenticated USING (session_date = CURRENT_DATE);

DROP POLICY IF EXISTS "Authenticated users can manage tours" ON public.tours;
CREATE POLICY "Authenticated users can manage tours" ON public.tours AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can read tours" ON public.tours;
CREATE POLICY "Authenticated users can read tours" ON public.tours AS PERMISSIVE FOR SELECT TO authenticated USING (true);

-- booking_discounts, booking_guests, booking_requests, booking_services, bookings, bot_leads,
-- cash_transactions, customers, document_logs, expenses, groups, ops_tasks, ota_calendar_feed,
-- payment_history, pricing_rules, revenue_manual_log, room_blocks, room_issues, rooms, services,
-- telegram_task_sessions, tours: RLS enabled với policy như trên.
-- app_users: RLS enabled với policy như trên.

-- ----------------------------------------------------------------------------
-- GRANTS (khớp với GRANT hiện tại trong DB cho 23 bảng business)
-- ----------------------------------------------------------------------------

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.rooms TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.app_users TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.customers TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.services TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.pricing_rules TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.groups TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payment_history TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bookings TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.booking_guests TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.booking_services TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.booking_discounts TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.room_blocks TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ota_calendar_feed TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.expenses TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bot_leads TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tours TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.revenue_manual_log TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.document_logs TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.cash_transactions TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.booking_requests TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.telegram_task_sessions TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.room_issues TO anon, authenticated, service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_tasks TO anon, authenticated, service_role;
