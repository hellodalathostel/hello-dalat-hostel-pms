import {
  AuditOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  DollarOutlined,
  FileExcelOutlined,
  HomeOutlined,
  InboxOutlined,
  LinkOutlined,
  RiseOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserAddOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import type { JSX } from 'react'

// C2 (QA 16/10/2026): 14 mục menu gom thành 3 nhóm. Route và nhãn giữ nguyên bản gốc.
// "Tạo đặt phòng mới" KHÔNG nằm ở đây — nó là nút chính luôn hiển thị trên header.
export const NEW_BOOKING_PATH = '/new-booking'
export const NEW_BOOKING_LABEL = 'Tạo đặt phòng mới'

export type NavItem = {
  path: string
  label: string
  icon: JSX.Element
}

export type NavGroup = {
  key: string
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'grp-van-hanh',
    label: 'Vận hành',
    items: [
      { path: '/', label: 'Tổng quan', icon: <HomeOutlined /> },
      { path: '/calendar', label: 'Lịch phòng', icon: <CalendarOutlined /> },
      { path: '/bookings', label: 'Đặt phòng', icon: <UnorderedListOutlined /> },
      { path: '/booking-requests', label: 'Đặt phòng trực tiếp', icon: <InboxOutlined /> },
      { path: '/guests', label: 'Khách', icon: <TeamOutlined /> },
      { path: '/housekeeping', label: 'Housekeeping', icon: <CheckSquareOutlined /> },
    ],
  },
  {
    key: 'grp-bao-cao',
    label: 'Báo cáo',
    items: [
      { path: '/so-quy', label: 'Sổ quỹ', icon: <WalletOutlined /> },
      { path: '/finance', label: 'Tài chính', icon: <DollarOutlined /> },
      { path: '/revenue', label: 'Doanh thu', icon: <RiseOutlined /> },
      { path: '/dk14-report', label: 'Báo cáo ĐK14', icon: <FileExcelOutlined /> },
      { path: '/s1a', label: 'Sổ S1a — Doanh thu HKD', icon: <AuditOutlined /> },
    ],
  },
  {
    key: 'grp-thiet-lap',
    label: 'Thiết lập',
    items: [
      { path: '/checkin-import', label: 'Import Check-in (Excel)', icon: <UserAddOutlined /> },
      { path: '/settings/rooms', label: 'Quản lý phòng', icon: <HomeOutlined /> },
      { path: '/settings/ical', label: 'iCal Feed', icon: <LinkOutlined /> },
    ],
  },
]

// Map pathname → key mục menu đang xem. Thứ tự quan trọng: prefix dài/cụ thể đứng trước.
const PREFIX_MAP: [string, string][] = [
  ['/new-booking', NEW_BOOKING_PATH],
  ['/calendar', '/calendar'],
  ['/bookings', '/bookings'],
  ['/booking-requests', '/booking-requests'],
  ['/guests', '/guests'],
  ['/housekeeping', '/housekeeping'],
  ['/so-quy', '/so-quy'],
  ['/finance', '/finance'],
  ['/revenue', '/revenue'],
  ['/orevenue', '/revenue'],
  ['/dk14-report', '/dk14-report'],
  ['/s1a', '/s1a'],
  ['/checkin-import', '/checkin-import'],
  ['/settings/rooms', '/settings/rooms'],
  ['/settings', '/settings/ical'],
  ['/dashboard', '/'],
]

export function resolveActivePath(pathname: string): string {
  for (const [prefix, key] of PREFIX_MAP) {
    if (pathname.startsWith(prefix)) {
      return key
    }
  }
  return '/'
}

export function findGroupKey(activePath: string): string | null {
  return NAV_GROUPS.find((group) => group.items.some((item) => item.path === activePath))?.key ?? null
}
