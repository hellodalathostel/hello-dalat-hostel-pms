import {
  CalendarOutlined,
  DollarOutlined,
  HomeOutlined,
  UnorderedListOutlined,
  AppstoreOutlined,
} from '@ant-design/icons'
import type { JSX } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useCurrentUserRole } from '@/features/auth/hooks/useCurrentUserRole'
import { useBreakpoint } from '@/shared/hooks/useBreakpoint'
import styles from './BottomNav.module.css'

type NavItem = {
  key: string
  path: string
  icon: JSX.Element
  label: string
  ownerOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    path: '/',
    icon: <HomeOutlined />,
    label: 'Tổng quan',
  },
  {
    key: 'calendar',
    path: '/calendar',
    icon: <CalendarOutlined />,
    label: 'Lịch',
  },
  {
    key: 'bookings',
    path: '/bookings',
    icon: <UnorderedListOutlined />,
    label: 'Booking',
  },
  {
    key: 'housekeeping',
    path: '/housekeeping',
    icon: <AppstoreOutlined />,
    label: 'Phòng',
  },
  {
    key: 'finance',
    path: '/finance',
    icon: <DollarOutlined />,
    label: 'Tài chính',
    ownerOnly: true,
  },
]

export function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isMobile, initialized } = useBreakpoint()
  const { data: role } = useCurrentUserRole()

  if (!initialized || !isMobile) {
    return null
  }

  const visibleItems = NAV_ITEMS.filter((item) => !item.ownerOnly || role === 'owner')

  return (
    <nav className={styles.bottomNav} aria-label="Điều hướng nhanh">
      {visibleItems.map((item) => {
        const isActive =
          item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)

        return (
          <button
            key={item.key}
            className={`${styles.navItem} ${isActive ? styles.active : ''}`}
            onClick={() => navigate(item.path)}
            type="button"
          >
            <span className={styles.icon}>{item.icon}</span>
            <span className={styles.label}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}