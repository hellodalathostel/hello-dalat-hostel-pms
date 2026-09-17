// Kiểu dữ liệu ngày lễ/nghỉ bù, lấy từ public.holidays
export interface Holiday {
  date: string // YYYY-MM-DD
  name: string
  is_makeup_day: boolean
  note: string | null
}
