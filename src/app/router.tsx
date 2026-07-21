import { Suspense } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { MainLayout } from '@/app/layouts/MainLayout'
import AuthGuard from '@/shared/components/AuthGuard'
import LoginPage from '@/pages/LoginPage'
import BookPage from '@/pages/BookPage'
import { ICalFeedPanel } from '@/features/settings/components/ICalFeedPanel'
import { RoomManagementPanel } from '@/features/settings/components/RoomManagementPanel'
import {
  DashboardPage,
  NewBookingPage,
  RoomCalendarPage,
  RevenueDashboardPage,
  FinancePage,
  DK14ReportPage,
  CheckinImportPage,
  SettingsPage,
  BookingsPage,
  GuestsPage,
  HousekeepingPage,
  BookingRequestsPage,
  S1aPage,
  CashBookPage,
} from '@/app/routes'

export const appRouter = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/book', element: <BookPage /> },
  {
    path: '/',
    element: (<AuthGuard><MainLayout /></AuthGuard>),
    children: [
      { index: true, element: <Suspense fallback={null}><DashboardPage /></Suspense> },
      { path: 'dashboard', element: <Suspense fallback={null}><DashboardPage /></Suspense> },
      { path: 'new-booking', element: <Suspense fallback={null}><NewBookingPage /></Suspense> },
      { path: 'calendar', element: <Suspense fallback={null}><RoomCalendarPage /></Suspense> },
      { path: 'housekeeping', element: <Suspense fallback={null}><HousekeepingPage /></Suspense> },
      { path: 'revenue', element: <Suspense fallback={null}><RevenueDashboardPage /></Suspense> },
      { path: 'finance', element: <Suspense fallback={null}><FinancePage /></Suspense> },
      { path: 'orevenue', element: <Suspense fallback={null}><RevenueDashboardPage /></Suspense> },
      { path: 'dk14-report', element: <Suspense fallback={null}><DK14ReportPage /></Suspense> },
      { path: 's1a', element: <Suspense fallback={null}><S1aPage /></Suspense> },
      { path: 'checkin-import', element: <Suspense fallback={null}><CheckinImportPage /></Suspense> },
      { path: 'bookings', element: <Suspense fallback={null}><BookingsPage /></Suspense> },
      { path: 'booking-requests', element: <Suspense fallback={null}><BookingRequestsPage /></Suspense> },
      { path: 'guests', element: <Suspense fallback={null}><GuestsPage /></Suspense> },
      { path: 'so-quy', element: <Suspense fallback={null}><CashBookPage /></Suspense> },
      {
        path: 'settings',
        element: <Suspense fallback={null}><SettingsPage /></Suspense>,
        children: [
          { index: true, element: <Navigate to="ical" replace /> },
          { path: 'ical', element: <ICalFeedPanel /> },
          { path: 'rooms', element: <RoomManagementPanel /> },
        ],
      },
    ],
  },
])
