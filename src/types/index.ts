export * from './database'
// RoomBlock của calendar.ts (khối lịch đã merge để render) trùng tên với
// RoomBlock của database.ts (row của bảng room_blocks) — export riêng để tránh ambiguity.
export type { CalendarEvent, RoomRow } from './calendar'
export * from './dashboard'

// Chỉ export những gì checkin.ts có mà database.ts không có
// (DocumentType và ResidencyType đã có trong database.ts — bỏ qua để tránh conflict)
export {
	DOCUMENT_TYPE,
	RESIDENCY_TYPE,
	DOCUMENT_TYPE_OPTIONS,
	RESIDENCY_TYPE_OPTIONS,
	mapExcelIdTypeToDatabaseFormat,
} from './checkin'
export type {
	ExcelGuestRow,
	CheckinGuestPayload,
	ImportGroup,
	ImportResult,
} from './checkin'
