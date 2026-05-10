// Dữ liệu 1 row từ Excel sau khi parse
export interface ExcelGuestRow {
  stt: number;
  full_name: string;
  date_of_birth: string; // dd/mm/yyyy -> convert sang YYYY-MM-DD khi ghi DB
  gender: 'male' | 'female' | 'other';
  nationality: string; // ISO code: VNM, CHE, NLD...
  id_type: 'cccd' | 'passport' | 'other';
  id_number: string;
  phone: string;
  address: string;
  check_in: string; // dd/mm/yyyy hh:mm:ss
  check_out: string;
  room_number: string; // vi du: "301", "202"
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
