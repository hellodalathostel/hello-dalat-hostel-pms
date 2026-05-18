import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { normalizeError } from '@/shared/utils/normalizeError'

export interface DK14Row {
  stt?: number | null
  ho_va_ten: string | null
  ngay_sinh: string | null
  gioi_tinh: string | null
  quoc_gia: string | null
  quoc_tich: string | null
  loai_giay_to: string | null
  ten_giay_to: string | null
  so_giay_to: string | null
  so_dien_thoai: string | null
  loai_cu_tru: string | null
  tinh_tp: string | null
  quan_huyen: string | null
  phuong_xa: string | null
  dia_chi_chi_tiet: string | null
  tu_ngay: string | null
  den_ngay: string | null
  ly_do_luu_tru: string | null
  ten_phong: string | null
}

async function fetchDK14Report(dateStr: string): Promise<DK14Row[]> {
  try {
    const { data, error } = await supabase
      .from('dk14_luu_tru')
      .select('*')
      .lte('check_in', dateStr)
      .gt('check_out', dateStr)
      .order('stt')

    if (error) {
      throw error
    }

    return (data ?? []) as DK14Row[]
  } catch (error) {
    throw normalizeError(error)
  }
}

export function useDK14Report(selectedDate: dayjs.Dayjs) {
  const dateStr = selectedDate.format('YYYY-MM-DD')

  return useQuery({
    queryKey: ['dk14-report', dateStr],
    queryFn: () => fetchDK14Report(dateStr),
    refetchOnWindowFocus: true,
  })
}
