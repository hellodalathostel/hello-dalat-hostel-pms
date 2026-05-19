## root
- App.tsx — top-level app shell rendered by Vite entrypoint — exports: default App
- main.tsx — bootstraps React app, providers, and router into DOM — exports: none

## api
- api/supabase.ts — initializes shared Supabase client from env vars — exports: supabase

## app
- app/router.tsx — defines route tree for feature pages and layouts — exports: appRouter
- app/layouts/MainLayout.tsx — shared layout wrapper for authenticated app pages — exports: MainLayout
- app/providers/AppProviders.tsx — registers global providers (query/theme/antd context) — exports: AppProviders

## components
- components/CheckoutModal.tsx — legacy quick checkout/payment modal by room target — exports: CheckoutModal

## components/booking
- components/booking/BookingDetailDrawer.tsx — legacy drawer with booking group details and actions — exports: default BookingDetailDrawer
- components/booking/BookingImportPDF.tsx — legacy PDF import + parser for booking data — exports: default BookingImportPDF

## components/checkin
- components/checkin/CheckInModal.tsx — legacy modal to submit guest check-in payload — exports: CheckInModal

## components/dashboard
- components/dashboard/RoomCard.tsx — legacy room status card for dashboard grid — exports: RoomCard

## features/bookings
- features/bookings/index.ts — feature entrypoint re-exporting booking page — exports: NewBookingPage
- features/bookings/api/bookings.ts — RPC-backed booking/group creation transaction helpers — exports: createGroupBookingTxn
- features/bookings/components/BlockRoomModal.tsx — modal to block a room with reason/date range — exports: BlockRoomModal
- features/bookings/components/BookingActionButtons.tsx — grouped CTA buttons for booking operations — exports: BookingActionButtons
- features/bookings/components/BookingDetailDrawer.tsx — booking folio/detail drawer for a booking group — exports: default BookingDetailDrawer
- features/bookings/components/BookingFolioEditModal.tsx — modal for editing booking folio line items — exports: default BookingFolioEditModal
- features/bookings/components/BookingImportPDF.tsx — booking PDF parser/import UI used in booking flow — exports: default BookingImportPDF
- features/bookings/components/DepositSection.tsx — deposit input section for booking forms — exports: DepositSection
- features/bookings/components/DiscountSection.tsx — discount editor section for booking folio — exports: DiscountSection
- features/bookings/components/EditBookingModal.tsx — modal to edit booking metadata and room/date values — exports: EditBookingModal
- features/bookings/components/ServiceSection.tsx — service line-items editor for booking folio — exports: ServiceSection
- features/bookings/hooks/useBookingActions.ts — mutations for check-in and checkout from booking views — exports: useCheckinMutation, useCheckoutMutation
- features/bookings/hooks/useBookingDetail.ts — query + mapper for booking group detail/folio payload — exports: fetchGroupDetail, useBookingDetail
- features/bookings/hooks/useBookingFolio.ts — hook to load folio totals and payment rows — exports: useBookingFolio
- features/bookings/hooks/useCreateBooking.ts — hook to create new booking/group records — exports: useCreateBooking
- features/bookings/hooks/useDepositActions.ts — CRUD mutations for folio deposit items — exports: useDepositActions
- features/bookings/hooks/useDiscountActions.ts — CRUD mutations for folio discount items — exports: useDiscountActions
- features/bookings/hooks/useRooms.ts — fetches active room catalog for booking selection — exports: useRooms
- features/bookings/hooks/useServiceActions.ts — CRUD mutations for folio service items — exports: useServiceActions
- features/bookings/hooks/useServices.ts — fetches service catalog for booking pricing lines — exports: useServices
- features/bookings/hooks/useUpdateBooking.ts — update/cancel booking mutations — exports: useUpdateBooking, useCancelBooking
- features/bookings/pages/BookingsPage.tsx — list/search page for booking groups — exports: BookingsPage
- features/bookings/pages/NewBookingPage.tsx — new booking creation page/form container — exports: default NewBooking

## features/calendar
- features/calendar/index.ts — feature entrypoint re-exporting room calendar page — exports: RoomCalendarPage
- features/calendar/components/CalendarTimeline.tsx — timeline grid rendering bookings and blocks by room/date — exports: CalendarTimeline
- features/calendar/hooks/useRoomBlocks.ts — create/delete/fetch hooks for room blocks — exports: useCreateBlock, useDeleteBlock, useBlocksForRoom
- features/calendar/hooks/useRoomCalendar.ts — query hook for room calendar rows/events — exports: useRoomCalendar
- features/calendar/pages/RoomCalendarPage.tsx — room calendar page composition and controls — exports: default RoomCalendar

## features/checkin
- features/checkin/index.ts — feature entrypoint re-exporting check-in import page — exports: CheckinImportPage
- features/checkin/components/CheckInModal.tsx — check-in modal for entering guest identity data — exports: CheckInModal
- features/checkin/hooks/useCheckIn.ts — check-in mutation hook with payload shaping — exports: useCheckIn
- features/checkin/hooks/useCheckinImport.ts — import hook to parse/check and batch check-in guests — exports: useCheckinImport
- features/checkin/pages/CheckinImportPage.tsx — check-in import workflow page — exports: default CheckinImportPage

## features/checkout
- features/checkout/index.ts — feature entrypoint exposing checkout modals — exports: CheckoutModal, QuickCheckoutModal
- features/checkout/components/CheckoutModal.tsx — booking-id based checkout modal flow — exports: CheckoutModal
- features/checkout/components/QuickCheckoutModal.tsx — room-target quick checkout modal flow — exports: QuickCheckoutModal
- features/checkout/hooks/useCheckOut.ts — basic checkout mutation hook — exports: useCheckout
- features/checkout/hooks/useCheckoutBooking.ts — checkout + payment recording mutations — exports: useRecordPayment, useCheckoutBooking

## features/compliance
- features/compliance/index.ts — feature entrypoint re-exporting DK14 page — exports: DK14ReportPage
- features/compliance/hooks/useDK14.ts — data hook building DK14 compliance rows by date — exports: useDK14Report
- features/compliance/pages/DK14ReportPage.tsx — DK14 report page and filters — exports: default DK14Report

## features/dashboard
- features/dashboard/index.ts — feature entrypoint re-exporting dashboard pages — exports: DashboardPage, RevenueDashboardPage
- features/dashboard/api/dashboard.ts — dashboard summary fetcher from backend view/RPC — exports: fetchDashboardSummary
- features/dashboard/components/RoomCard.tsx — room occupancy card used on dashboard pages — exports: RoomCard
- features/dashboard/components/StatsBar.tsx — compact KPI strip for dashboard metrics — exports: StatsBar
- features/dashboard/hooks/useDashboard.ts — room status query + derivation hook — exports: getRoomStatus, useDashboard
- features/dashboard/hooks/useDashboardSummary.ts — summary KPI query hook — exports: useDashboardSummary
- features/dashboard/pages/DashboardPage.tsx — daily operations dashboard page — exports: default Dashboard
- features/dashboard/pages/RevenueDashboardPage.tsx — revenue dashboard page with financial charts — exports: default RevenueDashboard

## features/documents
- features/documents/index.ts — feature entrypoint exporting document action menu — exports: DocumentActionsMenu
- features/documents/DocumentActionsMenu.tsx — menu UI to generate/send booking documents — exports: DocumentActionsMenu
- features/documents/DocumentHistoryDrawer.tsx — drawer showing generated document history by group — exports: DocumentHistoryDrawer
- features/documents/documentTemplates.ts — HTML/text template builders for booking docs — exports: renderBookingConfirmation, renderDepositRequest, renderDepositConfirmation, renderInvoice, renderArrivalNotice, DOC_KIND_LABELS
- features/documents/useDocumentGenerator.ts — generator hooks for producing/storing booking documents — exports: useDocumentGenerator, useBookingDocuments, useDocumentGeneratorByGroup
- features/documents/hooks/useDocumentHistory.ts — hook to fetch and label document logs — exports: useDocumentHistory
- features/documents/hooks/useDocumentLog.ts — mutation hook to append document log entries — exports: useDocumentLog

## features/finance
- features/finance/index.ts — feature entrypoint re-exporting finance page — exports: FinancePage
- features/finance/components/FinanceTabs.tsx — tabbed finance dashboard container — exports: FinanceTabs
- features/finance/components/RevenueKPICards.tsx — KPI cards for monthly revenue summary — exports: RevenueKPICards
- features/finance/components/SourceBreakdown.tsx — channel/source revenue composition visualization — exports: SourceBreakdown
- features/finance/components/UnpaidTable.tsx — table of unpaid booking groups — exports: UnpaidTable
- features/finance/components/WeeklyBarChart.tsx — weekly revenue bar chart for selected month — exports: WeeklyBarChart
- features/finance/hooks/useMonthlyRevenue.ts — monthly summary query hook — exports: useMonthlyRevenue
- features/finance/hooks/useRevenue.ts — yearly revenue fetch/aggregation hook — exports: fetchRevenue, aggregateByMonth, useRevenue
- features/finance/hooks/useUnpaidBookings.ts — unpaid bookings query hook — exports: useUnpaidBookings
- features/finance/pages/FinancePage.tsx — finance analytics page composition — exports: default FinancePage
- features/finance/utils/exportFinanceExcel.ts — Excel export utility for finance summary sheet — exports: exportFinanceExcel

## features/payment
- features/payment/index.ts — feature entrypoint exposing payment modal — exports: PaymentModal
- features/payment/components/PaymentModal.tsx — modal UI for recording booking payments — exports: PaymentModal
- features/payment/hooks/usePayment.ts — mutation hook for posting payment records — exports: useRecordPayment

## features/settings
- features/settings/index.ts — feature entrypoint for iCal panel and settings page — exports: ICalFeedPanel, SettingsPage
- features/settings/components/ICalFeedPanel.tsx — iCal feed management panel — exports: ICalFeedPanel
- features/settings/pages/SettingsPage.tsx — settings page container and sections — exports: default SettingsPage

## hooks
- hooks/useCheckIn.ts — legacy shared check-in mutation hook — exports: useCheckIn
- hooks/useCheckinImport.ts — legacy shared check-in import hook — exports: useCheckinImport
- hooks/useCheckOut.ts — legacy shared checkout mutation hook — exports: useCheckout
- hooks/useCreateBooking.ts — legacy shared booking creation hook — exports: useCreateBooking
- hooks/useRoomBlocks.ts — legacy shared room-block CRUD hooks — exports: useCreateBlock, useDeleteBlock, useBlocksForRoom

## lib
- lib/schemas.ts — zod validation schemas for booking/payment/check-in forms — exports: newBookingSchema, paymentSchema, checkinGuestSchema

## pages
- pages/CheckinImportPage.tsx — legacy route page for check-in import — exports: default CheckinImportPage
- pages/LoginPage.tsx — login/auth page view — exports: default LoginPage
- pages/NewBooking.tsx — legacy route page for new booking flow — exports: default NewBooking
- pages/RevenueDashboard.tsx — legacy route page for revenue dashboard — exports: default RevenueDashboard
- pages/Settings/ICalFeedPanel.tsx — legacy iCal settings panel copy — exports: ICalFeedPanel

## shared/components
- shared/components/AuthGuard.tsx — route guard redirecting unauthenticated users — exports: default AuthGuard

## shared/hooks
- shared/hooks/useAppFeedback.ts — app-wide feedback helper hook for toasts/messages — exports: useAppFeedback

## shared/utils
- shared/utils/normalizeError.ts — normalizes unknown errors to Error objects — exports: normalizeError
- shared/utils/parseCheckinExcel.ts — Excel parsing and grouping utilities for check-in import — exports: parseDate, parseDateTime, parseCheckinExcel, groupByRoomAndDate
