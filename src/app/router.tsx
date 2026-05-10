import { Navigate, createBrowserRouter } from 'react-router-dom'
import { MainLayout } from '@/app/layouts/MainLayout'
import AuthGuard from '@/components/AuthGuard'
import Dashboard from '@/pages/Dashboard'
import CheckinImportPage from '@/pages/CheckinImportPage'
import DK14Report from '@/pages/DK14Report'
import LoginPage from '@/pages/LoginPage'
import NewBooking from '@/pages/NewBooking'
import RevenueDashboard from '@/pages/RevenueDashboard'
import RoomCalendar from '@/pages/RoomCalendar'
import { ICalFeedPanel } from '@/pages/Settings/ICalFeedPanel'
import SettingsPage from '@/pages/Settings/SettingsPage'

export const appRouter = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <AuthGuard>
        <MainLayout />
      </AuthGuard>
    ),
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: 'dashboard',
        element: <Dashboard />,
      },
      {
        path: 'new-booking',
        element: <NewBooking />,
      },
      {
        path: 'calendar',
        element: <RoomCalendar />,
      },
      {
        path: 'revenue',
        element: <RevenueDashboard />,
      },
      {
        path: 'orevenue',
        element: <RevenueDashboard />,
      },
      {
        path: 'dk14-report',
        element: <DK14Report />,
      },
      {
        path: 'checkin-import',
        element: <CheckinImportPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
        children: [
          {
            index: true,
            element: <Navigate to="/settings/ical" replace />,
          },
          {
            path: 'ical',
            element: <ICalFeedPanel />,
          },
        ],
      },
    ],
  },
])
