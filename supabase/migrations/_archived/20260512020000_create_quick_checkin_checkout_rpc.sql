-- Migration: Quick check-in/check-out RPC functions for Room Card and Calendar

-- RPC: Quick check-in (status: booked → checked-in)
CREATE OR REPLACE FUNCTION process_checkin(p_booking_id UUID)
RETURNS jsonb AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE bookings
  SET status = 'checked-in'
  WHERE id = p_booking_id AND status = 'booked';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Booking không tồn tại hoặc không ở trạng thái "Đã đặt"'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'booking_id', p_booking_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', FALSE,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RPC: Quick check-out (status: checked-in → checked-out)
CREATE OR REPLACE FUNCTION process_checkout(p_booking_id UUID)
RETURNS jsonb AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE bookings
  SET status = 'checked-out'
  WHERE id = p_booking_id AND status = 'checked-in';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Booking không tồn tại hoặc không ở trạng thái "Đang ở"'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'booking_id', p_booking_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', FALSE,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
