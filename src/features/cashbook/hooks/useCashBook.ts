import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'
import { CASH_ENTRY_DIRECTION } from '@/constants/cashBook'
import type {
  CashBookDailyRow,
  CashBookDetailRow,
  CashEntryType,
  AddCashEntryResult,
  UpdateCashEntryResult,
  VoidCashEntryResult,
  CloseCashShiftResult,
  ReopenCashShiftResult,
} from '@/types/cashBook'

const CASH_BOOK_KEY = ['cash-book'] as const

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
      queryClient.invalidateQueries({ queryKey: CASH_BOOK_KEY })
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
      queryClient.invalidateQueries({ queryKey: CASH_BOOK_KEY })
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
      queryClient.invalidateQueries({ queryKey: CASH_BOOK_KEY })
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
      queryClient.invalidateQueries({ queryKey: CASH_BOOK_KEY })
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
      queryClient.invalidateQueries({ queryKey: CASH_BOOK_KEY })
      message.success(result.message)
    },
    onError: (err) => message.error(normalizeError(err).message),
  })
}
