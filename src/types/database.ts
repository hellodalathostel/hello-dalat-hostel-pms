// Auto-generated từ Supabase schema — cập nhật thủ công khi có migration mới
// Lần cuối sync: 2026-05-21

// ─── Enums ───────────────────────────────────────────────────────────────────

export type BookingStatus = 'booked' | 'checked-in' | 'checked-out' | 'cancelled'

export type BookingSource =
	| 'Booking.com'
	| 'Facebook'
	| 'Gọi điện/Zalo'
	| 'Khách quen'
	| 'Walk-in'
	| 'Other'

export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'other' | 'momo' | 'zalopay'

export type UserRole = 'owner' | 'staff'

export type DocumentType = 'CCCD' | 'Hộ chiếu' | 'Giấy tờ khác'

export type ResidencyType = 'Thường trú' | 'Tạm trú' | 'Địa chỉ khác'

export type ExpenseCategory =
	| 'Lương nhân viên'
	| 'Điện nước'
	| 'Vệ sinh'
	| 'Sửa chữa'
	| 'Marketing'
	| 'Khác'
	| 'Thuế & Phí'

export type HousekeepingStatus = 'clean' | 'dirty' | 'cleaning' | 'out_of_order'

export type BlockReason = 'maintenance' | 'owner_use' | 'ota_closed' | 'deep_cleaning' | 'other'

export type PricingRuleType = 'weekend' | 'peak_season' | 'holiday' | 'custom'

export type DocFormat = 'pdf' | 'zalo_text' | 'email_html'

export type DocKind =
	| 'booking_confirmation'
	| 'deposit_request'
	| 'deposit_confirmation'
	| 'invoice'
	| 'arrival_notice'

export type BotLeadStatus = 'pending' | 'closed' | 'converted'

// ─── Tables ──────────────────────────────────────────────────────────────────

export interface AppUser {
	id: string
	firebase_uid: string | null // legacy — pending drop
	email: string
	name: string | null
	role: UserRole
	created_at: string
	updated_at: string
}

export interface Room {
	id: string
	name: string
	type: string
	capacity: number
	base_price: number
	floor: number | null
	is_active: boolean
	created_at: string
	updated_at: string
	housekeeping_status: HousekeepingStatus
	housekeeping_note: string | null
}

export interface Booking {
	id: string
	firebase_id: string | null
	group_id: string
	room_id: string
	check_in: string // date
	check_out: string // date
	nights: number | null // GENERATED ALWAYS AS (check_out - check_in)
	price_per_night: number // input duy nhất cho giá phòng
	surcharge: number // card_fee — trigger-computed
	room_subtotal: number // trigger-computed
	grand_total: number // trigger-computed
	tax_rate: number
	tax_amount: number
	has_early_check_in: boolean
	has_late_check_out: boolean
	guest_name: string | null
	guests_count: number
	status: BookingStatus
	is_deleted: boolean
	sync_to_group: boolean
	note: string | null
	actual_check_in: string | null // timestamptz
	actual_check_out: string | null // timestamptz
	created_at: string
	updated_at: string
}

export interface BookingGroup {
	id: string
	firebase_id: string | null
	customer_name: string
	customer_phone: string | null
	customer_note: string | null
	customer_cccd: string | null
	source: BookingSource | null
	channel_fee_rate: number
	external_ical_uid: string | null
	external_source: string | null
	external_imported_at: string | null
	ota_booking_number: string | null
	paid: number
	deposit_method: PaymentMethod | null
	status: string
	created_at: string
	updated_at: string
	net_revenue: number
}

export interface BookingGuest {
	id: string
	booking_id: string
	customer_id: string
	is_primary: boolean
	created_at: string
}

export interface BookingService {
	id: string
	booking_id: string
	service_id: string | null
	name: string
	price: number
	qty: number
	created_at: string
}

export interface BookingDiscount {
	id: string
	booking_id: string
	amount: number
	description: string | null
	created_at: string
}

export interface Customer {
	id: string
	firebase_id: string | null
	full_name: string
	date_of_birth: string | null // date
	gender: string | null
	nationality: string | null // char(2)
	country: string | null // char(2)
	document_type: DocumentType | null
	document_name: string | null
	document_number: string | null
	phone: string | null
	residency_type: ResidencyType | null
	province: string | null
	district: string | null
	ward: string | null
	address_detail: string | null
	source: string | null
	room_id: string | null
	room_name: string | null
	room_type: string | null
	capacity: number | null
	booking_id: string | null
	check_in: string | null
	check_out: string | null
	status: string | null
	guest_name: string | null
	guests_count: number | null
	group_id: string | null
	customer_phone: string | null
	created_at: string
	updated_at: string
}

export interface PaymentHistory {
	id: string
	group_id: string
	amount: number
	method: PaymentMethod | null
	date: string // date
	note: string | null
	is_void: boolean
	voided_payment_id: string | null
	created_at: string
	updated_at: string
}

export interface Expense {
	id: string
	firebase_id: string | null
	category: ExpenseCategory
	description: string | null
	amount: number
	date: string // date
	is_deleted: boolean
	created_at: string
	updated_at: string
	payment_method: PaymentMethod | null
	group_id: string | null
	customer_name: string | null
	source: BookingSource | null
	net_revenue: number | null
	paid: number | null
	channel_fee_rate: number | null
	check_in: string | null
	check_out: string | null
	service_revenue: number | null
	booking_count: number | null
}

export interface RevenueManualLog {
	id: string
	period: string // date
	source: string // 'room_cash' | 'service' | 'other'
	description: string | null
	amount: number
	note: string | null
	created_at: string
	updated_at: string
}

export interface Service {
	id: string
	name: string
	price: number
	is_deleted: boolean
	created_at: string
	updated_at: string
}

export interface Tour {
	id: string
	name: string
	partner: string | null
	duration: string | null
	price_weekday: number
	price_weekend: number | null
	pickup_time: string | null
	suitable_for: string | null
	included: string | null
	not_included: string | null
	notes: string | null
	is_active: boolean
	created_at: string
	updated_at: string
}

export interface RoomBlock {
	id: string
	room_id: string
	start_date: string // date
	end_date: string // date
	reason: BlockReason
	note: string | null
	ota_uid: string | null
	created_by: string | null
	created_at: string
	updated_at: string
}

export interface PricingRule {
	id: string
	name: string
	rule_type: PricingRuleType
	room_id: string | null
	multiplier: number | null
	flat_amount: number | null
	start_date: string | null
	end_date: string | null
	day_of_week: number[] | null
	priority: number
	is_active: boolean
	created_at: string
	updated_at: string
}

export interface DocumentLog {
	id: string
	group_id: string
	booking_id: string | null
	doc_type: DocKind
	doc_format: DocFormat
	content_snapshot: Record<string, unknown>
	generated_by: string | null
	sent_via: string | null
	recipient_name: string | null
	recipient_phone: string | null
	note: string | null
	created_at: string
}

export interface OtaReservation {
	id: string
	room_id: string
	ical_uid: string
	ota_source: string
	check_in: string // date
	check_out: string // date
	summary: string | null
	status: string | null
	ota_booking_num: string | null
	linked_group_id: string | null
	last_synced_at: string
	ical_feed_id: string | null
}

export interface BotLead {
	id: string
	chat_id: number
	content: string
	remind_at: string | null
	status: BotLeadStatus
	group_id: string | null
	created_at: string
	updated_at: string
}