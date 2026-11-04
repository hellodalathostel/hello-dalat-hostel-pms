import type { Dayjs } from 'dayjs'
import { supabase } from '@/api/supabase'

export interface NightlySuggestion {
  // Giá đêm đầu tiên — điền vào price_per_night (bookings chỉ có 1 giá/đêm)
  first: number
  min: number
  max: number
}

// Rule 3: gọi get_suggested_price(p_room_id, p_date) cho từng đêm trong [checkIn, checkOut).
// Trả null nếu phòng không có giá gợi ý (RPC trả NULL/0 cho đêm nào đó). Throw nếu RPC lỗi.
// Không tính tổng ở frontend — chỉ lấy giá từng đêm.
export async function fetchNightlySuggestedPrices(
  roomId: string,
  checkIn: Dayjs,
  checkOut: Dayjs,
): Promise<NightlySuggestion | null> {
  const nights = checkOut.diff(checkIn, 'day')
  if (nights <= 0) return null

  const results = await Promise.all(
    Array.from({ length: nights }, (_, i) =>
      supabase.rpc('get_suggested_price', {
        p_room_id: roomId,
        p_date: checkIn.add(i, 'day').format('YYYY-MM-DD'),
      }),
    ),
  )

  const prices: number[] = []
  for (const { data, error } of results) {
    if (error) throw error
    const price = data as number | null
    if (!price || price <= 0) return null
    prices.push(price)
  }

  return { first: prices[0], min: Math.min(...prices), max: Math.max(...prices) }
}
