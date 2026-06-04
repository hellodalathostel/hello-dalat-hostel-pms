// Enum values phải khớp chính xác với DB
export const DOCUMENT_TYPE = {
  CCCD: 'CCCD',
  HO_CHIEU: 'Hộ chiếu',
  GIAY_TO_KHAC: 'Giấy tờ khác',
} as const

export type DocumentType = typeof DOCUMENT_TYPE[keyof typeof DOCUMENT_TYPE]

export const RESIDENCY_TYPE = {
  THUONG_TRU: 'Thường trú',
  TAM_TRU: 'Tạm trú',
  DIA_CHI_KHAC: 'Địa chỉ khác',
} as const

export type ResidencyType = typeof RESIDENCY_TYPE[keyof typeof RESIDENCY_TYPE]

// Select options cho form
export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'CCCD', label: 'CCCD' },
  { value: 'Hộ chiếu', label: 'Hộ chiếu' },
  { value: 'Giấy tờ khác', label: 'Giấy tờ khác' },
]

export const RESIDENCY_TYPE_OPTIONS = [
  { value: 'Thường trú', label: 'Thường trú' },
  { value: 'Tạm trú', label: 'Tạm trú' },
  { value: 'Địa chỉ khác', label: 'Địa chỉ khác' },
]

// Dữ liệu 1 row từ Excel sau khi parse
export interface ExcelGuestRow {
  stt: number;
  full_name: string;
  date_of_birth: string; // dd/mm/yyyy -> convert sang YYYY-MM-DD khi ghi DB
  gender: 'male' | 'female' | 'other';
  nationality: string; // ISO code: VNM, CHE, NLD...
  id_type: 'cccd' | 'passport' | 'other'; // Giá trị từ Excel, sau sẽ mapping
  id_number: string;
  phone: string;
  address: string;
  check_in: string; // dd/mm/yyyy hh:mm:ss
  check_out: string;
  room_number: string; // vi du: "301", "202"
}

// Shape của 1 guest gửi vào checkin_booking_txn
export interface CheckinGuestPayload {
  full_name: string
  document_type: DocumentType
  document_number: string
  nationality: string
  date_of_birth?: string // "YYYY-MM-DD" hoặc ""
  gender?: string
  residency_type?: ResidencyType | ''
  province?: string
  district?: string
  ward?: string
  address_detail?: string
}

// Hàm mapping từ Excel id_type (lowercase) sang DocumentType (Vietnamese)
export function mapExcelIdTypeToDatabaseFormat(id_type: string): DocumentType {
  switch (id_type.toLowerCase()) {
    case 'cccd':
    case 'identity':
      return 'CCCD'
    case 'passport':
      return 'Hộ chiếu'
    case 'other':
    case 'other_document':
      return 'Giấy tờ khác'
    default:
      return 'Giấy tờ khác' // Mặc định nếu không nhận diện được
  }
}

// Kết quả sau khi group + match với booking
export interface ImportGroup {
  room_number: string;
  check_in_date: string; // YYYY-MM-DD
  booking_id: string | null; // null = không match được
  booking_status: string | null;
  guests: ExcelGuestRow[];
  error?: string;
}

// Kết quả sau khi process 1 group
export interface ImportResult {
  room_number: string;
  success: boolean;
  guests_upserted: number;
  error?: string;
}

// Form data khi nhập tay thông tin khách check-in
export interface ManualCheckinFormValues {
  full_name: string
  document_type: 'CCCD' | 'Hộ chiếu' | 'Giấy tờ khác'
  document_number: string
  date_of_birth: string // YYYY-MM-DD
  gender: 'Nam' | 'Nữ' | ''
  nationality: string
}
