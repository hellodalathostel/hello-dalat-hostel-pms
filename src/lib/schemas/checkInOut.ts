export type DocumentType = 'CCCD' | 'Hộ chiếu' | 'Giấy tờ khác';
export type ResidencyType = 'Thường trú' | 'Tạm trú' | 'Địa chỉ khác';
export type Gender = 'Nam' | 'Nữ';

export interface GuestCheckInPayload {
  is_primary: boolean;
  full_name: string;
  document_type: DocumentType;
  document_number?: string;
  document_name?: string;
  date_of_birth?: string; // Format: YYYY-MM-DD
  gender?: Gender;
  phone?: string;
  nationality?: string;
  country?: string; // ISO 3-char: VNM, USA...
  residency_type?: ResidencyType;
  province?: string;
  district?: string;
  ward?: string;
  address_detail?: string;
}

export interface CheckInResult {
  success: boolean;
  booking_id: string;
}

export interface CheckOutPayload {
  booking_id: string;
  confirm_debt: boolean;
}

export interface CheckOutResult {
  success: boolean;
  booking_id: string;
  group_id: string;
}
