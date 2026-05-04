import { supabase } from './supabase';
import type {
  CheckInResult,
  CheckOutPayload,
  CheckOutResult,
  GuestCheckInPayload,
} from '../lib/schemas/checkInOut';

export const processCheckInTxn = async (
  bookingId: string,
  guests: GuestCheckInPayload[],
): Promise<CheckInResult> => {
  const { data, error } = await supabase.rpc('process_check_in_txn', {
    p_booking_id: bookingId,
    p_guests: guests,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as CheckInResult;
};

export const processCheckOutTxn = async (
  payload: CheckOutPayload,
): Promise<CheckOutResult> => {
  const { data, error } = await supabase.rpc('process_check_out_txn', {
    p_booking_id: payload.booking_id,
    p_confirm_debt: payload.confirm_debt,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as CheckOutResult;
};
