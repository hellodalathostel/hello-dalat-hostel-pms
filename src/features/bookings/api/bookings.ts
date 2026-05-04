import { supabase } from '@/api/supabase'
import type {
  CreateGroupBookingInput,
  CreateGroupBookingResult,
} from '@/features/bookings/types/booking'

export async function createGroupBookingTxn(
  payload: CreateGroupBookingInput,
): Promise<CreateGroupBookingResult> {
  const { data, error } = await supabase.rpc('create_group_booking_txn', payload)

  if (error) {
    throw error
  }

  const result = data as CreateGroupBookingResult | null
  if (!result) {
    throw new Error('RPC create_group_booking_txn không trả dữ liệu')
  }

  return result
}
