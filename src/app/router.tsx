import { lazy, Suspense } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { MainLayout } from '@/app/layouts/MainLayout'
import AuthGuard from '@/shared/components/AuthGuard'
import LoginPage from '@/pages/LoginPage'
import BookPage from '@/pages/BookPage'
import { ICalFeedPanel } from '@/features/settings/components/ICalFeedPanel'

const DashboardPage = lazy(() => import('@/features/dashboard/pages/DashboardPage'))
const NewBookingPage = lazy(() => import('@/features/bookings/pages/NewBookingPage'))
const RoomCalendarPage = lazy(() => import('@/features/calendar/pages/RoomCalendarPage'))
const RevenueDashboardPage = lazy(() => import('@/features/dashboard/pages/RevenueDashboardPage'))
const FinancePage = lazy(() => import('@/features/finance/pages/FinancePage'))
const DK14ReportPage = lazy(() => import('@/features/compliance/pages/DK14ReportPage'))
const CheckinImportPage = lazy(() => import('@/features/checkin/pages/CheckinImportPage'))
const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage'))
const BookingsPage = lazy(() => import('@/features/bookings/pages/BookingsPage').then((m) => ({ default: m.BookingsPage })))
const GuestsPage = lazy(() => import('@/pages/GuestsPage'))
const HousekeepingPage = lazy(() => import('@/features/housekeeping/pages/HousekeepingPage'))

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
      { path: 'checkin-import', element: <Suspense fallback={null}><CheckinImportPage /></Suspense> },
      { path: 'bookings', element: <Suspense fallback={null}><BookingsPage /></Suspense> },
      { path: 'guests', element: <Suspense fallback={null}><GuestsPage /></Suspense> },
      {
        path: 'settings',
        element: <Suspense fallback={null}><SettingsPage /></Suspense>,
        children: [
          { index: true, element: <Navigate to="ical" replace /> },
          { path: 'ical', element: <ICalFeedPanel /> },
        ],
      },
    ],
  },
])
