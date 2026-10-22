import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'
import { CASH_ENTRY_DIRECTION } from '@/constants/cashBook'
import type {
  CashBookDailyRow,
  CashBookDayResult,
  CashBookDetailRow,
  CashOpeningRow,
  CashEntryType,
  AddCashEntryResult,
  UpdateCashEntryResult,
  VoidCashEntryResult,
  CloseCashShiftResult,
  ReopenCashShiftResult,
} from '@/types/cashBook'

const CASH_BOOK_KEY = ['cash-book'] as const
const CASH_BOOK_OPENING_KEY = ['cashbook-opening'] as const
const CASH_BOOK_DAY_KEY = ['cashbook-day'] as const

// Sau moi mutation lien quan so quy: lam moi danh sach + moc khai so + tong hop ngay dang chon.
function invalidateCashBook(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: CASH_BOOK_KEY }),
    queryClient.invalidateQueries({ queryKey: CASH_BOOK_OPENING_KEY }),
    queryClient.invalidateQueries({ queryKey: CASH_BOOK_DAY_KEY }),
  ])
}

// F02: moc khai so doc thang tu bang cash_shifts, KHONG tim trong N dong cua cash_book_daily.
// Ly do: view cash_book_daily chi co dong cho ngay co giao dich, nen dong khai so co the nam
// ngoai 30 dong gan nhat (hoac khong co trong view neu ngay khai so khong phat sinh giao dich).
async function fetchOpening(): Promise<CashOpeningRow | null> {
  const { data, error } = await supabase
    .from('cash_shifts')
    .select('shift_date, opening_balance')
    .eq('is_opening_entry', true)
    .order('shift_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw normalizeError(error)
  return (data as CashOpeningRow | null) ?? null
}

/** Moc khai so quy (toi da 1 dong, moi nhat). null = chua khai so. */
export function useCashBookOpening() {
  return useQuery({
    queryKey: CASH_BOOK_OPENING_KEY,
    queryFn: fetchOpening,
  })
}

/**
 * Tong hop cua DUNG ngay duoc chon.
 * - Ngay co giao dich: lay dong that tu cash_book_daily.
 * - Ngay khong phat sinh: ton dau = ton cuoi = ton mang sang tu dong gan nhat truoc do
 *   (hoac ton khai so neu tu luc khai so chua co giao dich), thu/chi = 0. KHONG mac dinh 0.
 * - Ngay truoc moc khai so (hoac chua khai so): khong co so lieu.
 */
export function useCashBookDayRow(date: string) {
  return useQuery({
    queryKey: [...CASH_BOOK_DAY_KEY, date],
    queryFn: async (): Promise<CashBookDayResult> => {
      const { data: actual, error: actualError } = await supabase
        .from('cash_book_daily')
        .select('*')
        .eq('entry_date', date)
        .maybeSingle()
      if (actualError) throw normalizeError(actualError)
      if (actual) {
        return { kind: 'actual', row: actual as CashBookDailyRow }
      }

      const opening = await fetchOpening()
      if (!opening || date < opening.shift_date) {
        return { kind: 'before-opening', row: null }
      }

      const [prevRes, shiftRes] = await Promise.all([
        supabase
          .from('cash_book_daily')
          .select('ton_luy_ke')
          .lt('entry_date', date)
          .order('entry_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Ca cua chinh ngay nay (co the da chot du khong co giao dich)
        supabase
          .from('cash_shifts')
          .select('opening_balance, counted_balance, expected_balance, discrepancy, closed_at, is_opening_entry')
          .eq('shift_date', date)
          .maybeSingle(),
      ])
      if (prevRes.error) throw normalizeError(prevRes.error)
      if (shiftRes.error) throw normalizeError(shiftRes.error)

      const prev = prevRes.data as Pick<CashBookDailyRow, 'ton_luy_ke'> | null
      const shift = shiftRes.data as Pick<
        CashBookDailyRow,
        'opening_balance' | 'counted_balance' | 'expected_balance' | 'discrepancy' | 'closed_at' | 'is_opening_entry'
      > | null
      // View chi tinh tu ngay khai so, nen khong co dong truoc do = chua phat sinh tu luc khai so
      const carried = prev ? prev.ton_luy_ke : opening.opening_balance

      return {
        kind: 'carried',
        row: {
          entry_date: date,
          thu_trong_ngay: 0,
          chi_trong_ngay: 0,
          thuan_trong_ngay: 0,
          so_giao_dich: 0,
          ton_luy_ke: carried,
          opening_balance: shift?.opening_balance ?? null,
          counted_balance: shift?.counted_balance ?? null,
          expected_balance: shift?.expected_balance ?? null,
          discrepancy: shift?.discrepancy ?? null,
          closed_at: shift?.closed_at ?? null,
          is_opening_entry: shift?.is_opening_entry ?? false,
        },
      }
    },
    enabled: Boolean(date),
  })
}

/** Tong hop theo ngay, moi nhat truoc */
export function useCashBookDaily(limit = 30) {
  return useQuery({
    queryKey: [...CASH_BOOK_KEY, 'daily', limit],
    queryFn: async (): Promise<CashBookDailyRow[]> => {
      const { data, error } = await supabase
        .from('cash_book_daily')
        .select('*')
        .order('entry_date', { ascending: false })
        .limit(limit)
      if (error) throw normalizeError(error)
      return (data ?? []) as CashBookDailyRow[]
    },
  })
}

/** Chi tiet giao dich cua mot ngay cu the */
export function useCashBookDetail(date: string) {
  return useQuery({
    queryKey: [...CASH_BOOK_KEY, 'detail', date],
    queryFn: async (): Promise<CashBookDetailRow[]> => {
      const { data, error } = await supabase
        .from('cash_book_detail')
        .select('*')
        .eq('entry_date', date)
        .order('created_at', { ascending: true })
      if (error) throw normalizeError(error)
      return (data ?? []) as CashBookDetailRow[]
    },
    enabled: Boolean(date),
  })
}

interface AddEntryInput {
  entryType: CashEntryType
  amount: number
  description: string
  entryDate?: string
  note?: string
}

/** Them giao dich nhap tay */
export function useAddCashEntry() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async (input: AddEntryInput): Promise<AddCashEntryResult> => {
      const { data, error } = await supabase.rpc('add_cash_book_entry_txn', {
        p_direction: CASH_ENTRY_DIRECTION[input.entryType],
        p_entry_type: input.entryType,
        p_amount: input.amount,
        p_description: input.description,
        p_entry_date: input.entryDate ?? dayjs().format('YYYY-MM-DD'),
        p_note: input.note ?? null,
      })
      if (error) throw normalizeError(error)
      return data as AddCashEntryResult
    },
    onSuccess: () => {
      void invalidateCashBook(queryClient)
      message.success('Đã ghi giao dịch vào sổ quỹ')
    },
    onError: (err) => message.error(normalizeError(err).message),
  })
}

interface UpdateEntryInput {
  entryId: string
  entryType: CashEntryType
  amount: number
  description: string
  note?: string
}

/** Sua giao dich nhap tay ghi nham */
export function useUpdateCashEntry() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async (input: UpdateEntryInput): Promise<UpdateCashEntryResult> => {
      const { data, error } = await supabase.rpc('update_cash_book_entry_txn', {
        p_entry_id: input.entryId,
        p_entry_type: input.entryType,
        p_amount: input.amount,
        p_description: input.description,
        p_note: input.note ?? null,
      })
      if (error) throw normalizeError(error)
      return data as UpdateCashEntryResult
    },
    onSuccess: (result) => {
      void invalidateCashBook(queryClient)
      message.success(result.message)
    },
    onError: (err) => message.error(normalizeError(err).message),
  })
}

/** Huy giao dich nhap tay (soft-delete, giu dau vet) */
export function useVoidCashEntry() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async (input: { entryId: string; reason: string }): Promise<VoidCashEntryResult> => {
      const { data, error } = await supabase.rpc('void_cash_book_entry_txn', {
        p_entry_id: input.entryId,
        p_reason: input.reason,
      })
      if (error) throw normalizeError(error)
      return data as VoidCashEntryResult
    },
    onSuccess: (result) => {
      void invalidateCashBook(queryClient)
      message.success(result.message)
    },
    onError: (err) => message.error(normalizeError(err).message),
  })
}

interface CloseShiftInput {
  shiftDate: string
  countedBalance: number
  note?: string
}

/** Chot ca cuoi ngay */
export function useCloseCashShift() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async (input: CloseShiftInput): Promise<CloseCashShiftResult> => {
      const { data, error } = await supabase.rpc('close_cash_shift_txn', {
        p_shift_date: input.shiftDate,
        p_counted_balance: input.countedBalance,
        p_note: input.note ?? null,
      })
      if (error) throw normalizeError(error)
      return data as CloseCashShiftResult
    },
    onSuccess: (result) => {
      void invalidateCashBook(queryClient)
      message.success(result.message)
    },
    onError: (err) => message.error(normalizeError(err).message),
  })
}

/** Mo lai ca da chot de sua giao dich */
export function useReopenCashShift() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async (input: { shiftDate: string; reason: string }): Promise<ReopenCashShiftResult> => {
      const { data, error } = await supabase.rpc('reopen_cash_shift_txn', {
        p_shift_date: input.shiftDate,
        p_reason: input.reason,
      })
      if (error) throw normalizeError(error)
      return data as ReopenCashShiftResult
    },
    onSuccess: (result) => {
      void invalidateCashBook(queryClient)
      message.success(result.message)
    },
    onError: (err) => message.error(normalizeError(err).message),
  })
}
