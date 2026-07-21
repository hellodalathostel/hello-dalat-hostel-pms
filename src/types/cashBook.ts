// Kieu du lieu cho module So quy tien mat

/** Chieu tien: vao ket hoac ra khoi ket */
export type CashDirection = 'in' | 'out'

/** Loai giao dich NHAP TAY (bang cash_book_entries) */
export type CashEntryType =
  | 'deposit_to_bank'
  | 'withdraw_from_bank'
  | 'petty_expense'
  | 'owner_withdrawal'
  | 'owner_contribution'
  | 'other_in'
  | 'other_out'

/** Loai giao dich TU DONG tu he thong (view cash_book_detail gop vao) */
export type CashAutoEntryType = 'guest_payment' | 'expense' | 'pass_through'

/** Nguon goc giao dich */
export type CashRefTable =
  | 'payment_history'
  | 'expenses'
  | 'pass_through_transactions'
  | 'cash_book_entries'

/** Mot dong trong view cash_book_detail */
export interface CashBookDetailRow {
  entry_date: string
  direction: CashDirection
  entry_type: CashEntryType | CashAutoEntryType
  amount: number
  description: string | null
  ref_id: string
  ref_table: CashRefTable
  created_at: string
}

/** Mot dong trong view cash_book_daily */
export interface CashBookDailyRow {
  entry_date: string
  thu_trong_ngay: number
  chi_trong_ngay: number
  thuan_trong_ngay: number
  so_giao_dich: number
  ton_luy_ke: number
  opening_balance: number | null
  counted_balance: number | null
  expected_balance: number | null
  /** CANH BAO: cot generated, ngay chua chot tra 0 chu khong phai null.
   *  Dung closed_at de biet da chot hay chua. */
  discrepancy: number | null
  closed_at: string | null
  is_opening_entry: boolean
}

export interface AddCashEntryResult {
  id: string
  entry_date: string
  direction: CashDirection
  entry_type: CashEntryType
  amount: number
}

export interface UpdateCashEntryResult extends AddCashEntryResult {
  message: string
}

export interface VoidCashEntryResult {
  id: string
  entry_date: string
  amount: number
  message: string
}

export interface CloseCashShiftResult {
  shift_date: string
  counted_balance: number
  expected_balance: number
  discrepancy: number
  message: string
}

export interface ReopenCashShiftResult {
  shift_date: string
  message: string
}
