export * from './database'
export * from './calendar'
export * from './dashboard'
export * from './room'

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
