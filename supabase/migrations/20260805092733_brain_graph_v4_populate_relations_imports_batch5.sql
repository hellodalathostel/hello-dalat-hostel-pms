-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 05/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================

-- Batch 5: predicate 'imports' — frontend_file -> rpc
-- Nguon: quet regex .rpc('name') tren src/**/*.{ts,tsx} boi Claude Code CLI (05/08/2026)
-- 33 frontend_file entity moi (resolve_entity), 47 relation (add_relation, review_status=suggested)
-- Dung dung RPC add_relation()/resolve_entity() ngay tu dau (khong UPDATE truc tiep,
-- rut kinh nghiem loi batch 4 defined_in)

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY[
    'src/components/bookings/AddRoomModal.tsx',
    'src/components/checkin/KBTTImportModal.tsx',
    'src/features/auth/hooks/useCurrentUserRole.ts',
    'src/features/booking-requests/hooks/useBookingRequests.ts',
    'src/features/bookings/api/bookings.ts',
    'src/features/bookings/hooks/useAddService.ts',
    'src/features/bookings/hooks/useCreateBooking.ts',
    'src/features/bookings/hooks/useDepositActions.ts',
    'src/features/bookings/hooks/useDiscountActions.ts',
    'src/features/bookings/hooks/useServiceActions.ts',
    'src/features/bookings/hooks/useUpdateBooking.ts',
    'src/features/bookings/hooks/useVoidBooking.ts',
    'src/features/bookings/hooks/useVoidPayment.ts',
    'src/features/calendar/hooks/useHousekeeping.ts',
    'src/features/cashbook/hooks/useCashBook.ts',
    'src/features/checkin/hooks/useCheckIn.ts',
    'src/features/checkin/hooks/useCheckinImport.ts',
    'src/features/checkout/hooks/useCheckOut.ts',
    'src/features/checkout/hooks/useCheckoutBooking.ts',
    'src/features/compliance/hooks/useTaxThresholdSummary.ts',
    'src/features/dashboard/hooks/useCancelOtaBlock.ts',
    'src/features/dashboard/hooks/useCreateBookingFromOtaBlock.ts',
    'src/features/documents/documentLogging.ts',
    'src/features/documents/hooks/useDocumentLog.ts',
    'src/features/documents/useDocumentGenerator.ts',
    'src/features/finance/hooks/useManualRevenue.ts',
    'src/features/housekeeping/hooks/useMarkRoomClean.ts',
    'src/features/payment/hooks/usePayment.ts',
    'src/features/settings/hooks/useRoomMutations.ts',
    'src/hooks/useAddEarlyLate.ts',
    'src/hooks/useAddRoomToGroup.ts',
    'src/hooks/useRoomBlocks.ts',
    'src/hooks/useUndoEarlyLate.ts'
  ]) AS file_path
  LOOP
    PERFORM brain.resolve_entity(
      p_canonical_key := 'frontend_file:' || r.file_path,
      p_display_name := r.file_path
    );
  END LOOP;
END $$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('src/components/bookings/AddRoomModal.tsx', 'get_suggested_price'),
    ('src/components/checkin/KBTTImportModal.tsx', 'checkin_booking_txn'),
    ('src/features/auth/hooks/useCurrentUserRole.ts', 'current_user_role'),
    ('src/features/booking-requests/hooks/useBookingRequests.ts', 'confirm_booking_request_txn'),
    ('src/features/booking-requests/hooks/useBookingRequests.ts', 'reject_booking_request_txn'),
    ('src/features/bookings/api/bookings.ts', 'create_group_booking_txn'),
    ('src/features/bookings/hooks/useAddService.ts', 'add_booking_service_txn'),
    ('src/features/bookings/hooks/useCreateBooking.ts', 'create_group_booking_txn'),
    ('src/features/bookings/hooks/useCreateBooking.ts', 'record_payment_txn'),
    ('src/features/bookings/hooks/useDepositActions.ts', 'record_payment_txn'),
    ('src/features/bookings/hooks/useDiscountActions.ts', 'add_discount_txn'),
    ('src/features/bookings/hooks/useDiscountActions.ts', 'delete_booking_discount_txn'),
    ('src/features/bookings/hooks/useServiceActions.ts', 'add_booking_service_txn'),
    ('src/features/bookings/hooks/useServiceActions.ts', 'delete_booking_service_txn'),
    ('src/features/bookings/hooks/useUpdateBooking.ts', 'update_booking_txn'),
    ('src/features/bookings/hooks/useVoidBooking.ts', 'void_checkedout_booking_txn'),
    ('src/features/bookings/hooks/useVoidPayment.ts', 'void_payment_txn'),
    ('src/features/calendar/hooks/useHousekeeping.ts', 'update_housekeeping_status'),
    ('src/features/cashbook/hooks/useCashBook.ts', 'add_cash_book_entry_txn'),
    ('src/features/cashbook/hooks/useCashBook.ts', 'close_cash_shift_txn'),
    ('src/features/cashbook/hooks/useCashBook.ts', 'reopen_cash_shift_txn'),
    ('src/features/cashbook/hooks/useCashBook.ts', 'update_cash_book_entry_txn'),
    ('src/features/cashbook/hooks/useCashBook.ts', 'void_cash_book_entry_txn'),
    ('src/features/checkin/hooks/useCheckIn.ts', 'checkin_booking_txn'),
    ('src/features/checkin/hooks/useCheckinImport.ts', 'checkin_booking_txn'),
    ('src/features/checkout/hooks/useCheckOut.ts', 'checkout_last_booking_and_settle_txn'),
    ('src/features/checkout/hooks/useCheckOut.ts', 'checkout_single_booking_txn'),
    ('src/features/checkout/hooks/useCheckoutBooking.ts', 'checkout_last_booking_and_settle_txn'),
    ('src/features/checkout/hooks/useCheckoutBooking.ts', 'checkout_single_booking_txn'),
    ('src/features/checkout/hooks/useCheckoutBooking.ts', 'record_payment_txn'),
    ('src/features/compliance/hooks/useTaxThresholdSummary.ts', 'get_tax_threshold_summary'),
    ('src/features/dashboard/hooks/useCancelOtaBlock.ts', 'cancel_ota_block'),
    ('src/features/dashboard/hooks/useCreateBookingFromOtaBlock.ts', 'create_group_booking_txn'),
    ('src/features/documents/documentLogging.ts', 'create_document_log'),
    ('src/features/documents/hooks/useDocumentLog.ts', 'create_document_log'),
    ('src/features/documents/useDocumentGenerator.ts', 'create_document_log'),
    ('src/features/finance/hooks/useManualRevenue.ts', 'create_manual_revenue_txn'),
    ('src/features/housekeeping/hooks/useMarkRoomClean.ts', 'mark_room_clean_txn'),
    ('src/features/payment/hooks/usePayment.ts', 'record_payment_txn'),
    ('src/features/settings/hooks/useRoomMutations.ts', 'create_room_txn'),
    ('src/features/settings/hooks/useRoomMutations.ts', 'toggle_room_active_txn'),
    ('src/features/settings/hooks/useRoomMutations.ts', 'update_room_txn'),
    ('src/hooks/useAddEarlyLate.ts', 'add_early_late_txn'),
    ('src/hooks/useAddRoomToGroup.ts', 'add_booking_to_group_txn'),
    ('src/hooks/useRoomBlocks.ts', 'create_room_block_txn'),
    ('src/hooks/useRoomBlocks.ts', 'delete_room_block_txn'),
    ('src/hooks/useUndoEarlyLate.ts', 'undo_early_late_txn')
  ) AS t(file_path, rpc_name)
  LOOP
    PERFORM brain.add_relation(
      p_subject_canonical_key := 'frontend_file:' || r.file_path,
      p_predicate := 'imports',
      p_object_canonical_key := 'rpc:public.' || r.rpc_name,
      p_source := 'db_introspection',
      p_review_status := 'suggested',
      p_note := 'Frontend goi RPC qua supabase.rpc(), quet bang regex .rpc(''name'') tren src/ (Claude Code CLI, 05/08/2026)'
    );
  END LOOP;
END $$;
