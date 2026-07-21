import type {
  CashDirection,
  CashEntryType,
  CashAutoEntryType,
  CashRefTable,
} from '@/types/cashBook'

/** Nhan tieng Viet cho loai giao dich nhap tay */
export const CASH_ENTRY_TYPE_LABEL: Record<CashEntryType, string> = {
  withdraw_from_bank: 'Rút từ ngân hàng',
  owner_contribution: 'Chủ góp tiền',
  other_in: 'Thu khác',
  deposit_to_bank: 'Nộp vào ngân hàng',
  petty_expense: 'Chi vặt',
  owner_withdrawal: 'Chủ rút tiền',
  other_out: 'Chi khác',
}

/** Nhan tieng Viet cho loai giao dich tu dong tu he thong */
export const CASH_AUTO_ENTRY_TYPE_LABEL: Record<CashAutoEntryType, string> = {
  guest_payment: 'Thu khách',
  expense: 'Chi phí',
  pass_through: 'Thu chi hộ',
}

/** Chieu tien co dinh theo loai — DB da rang buoc, day chi de hien thi */
export const CASH_ENTRY_DIRECTION: Record<CashEntryType, CashDirection> = {
  withdraw_from_bank: 'in',
  owner_contribution: 'in',
  other_in: 'in',
  deposit_to_bank: 'out',
  petty_expense: 'out',
  owner_withdrawal: 'out',
  other_out: 'out',
}

/** Thu tu hien thi trong dropdown, nhom theo chieu */
export const CASH_ENTRY_TYPE_OPTIONS = [
  {
    label: 'Tiền vào két',
    options: [
      { label: CASH_ENTRY_TYPE_LABEL.withdraw_from_bank, value: 'withdraw_from_bank' as const },
      { label: CASH_ENTRY_TYPE_LABEL.owner_contribution, value: 'owner_contribution' as const },
      { label: CASH_ENTRY_TYPE_LABEL.other_in, value: 'other_in' as const },
    ],
  },
  {
    label: 'Tiền ra khỏi két',
    options: [
      { label: CASH_ENTRY_TYPE_LABEL.deposit_to_bank, value: 'deposit_to_bank' as const },
      { label: CASH_ENTRY_TYPE_LABEL.petty_expense, value: 'petty_expense' as const },
      { label: CASH_ENTRY_TYPE_LABEL.owner_withdrawal, value: 'owner_withdrawal' as const },
      { label: CASH_ENTRY_TYPE_LABEL.other_out, value: 'other_out' as const },
    ],
  },
]

/** Lay nhan hien thi cho bat ky entry_type nao (tu dong hoac nhap tay) */
export function getCashEntryLabel(entryType: string): string {
  return (
    CASH_ENTRY_TYPE_LABEL[entryType as CashEntryType] ??
    CASH_AUTO_ENTRY_TYPE_LABEL[entryType as CashAutoEntryType] ??
    entryType
  )
}

/** Giao dich tu he thong thi khong sua/huy duoc tu So quy */
export function isAutoEntry(refTable: CashRefTable): boolean {
  return refTable !== 'cash_book_entries'
}

/** Dinh dang tien Viet: 3896000 -> "3.896.000" */
export function formatVnd(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n)
}
