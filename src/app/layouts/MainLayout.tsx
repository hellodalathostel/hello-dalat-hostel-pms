import {
  AuditOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  DollarOutlined,
  FileExcelOutlined,
  FormOutlined,
  HomeOutlined,
  InboxOutlined,
  LinkOutlined,
  RiseOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserAddOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { Badge, Layout, Menu, Space, Typography } from 'antd'
import { useMemo } from 'react'
import type { JSX } from 'react'
import type { ItemType } from 'antd/es/menu/interface'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { usePendingRequestCount } from '@/features/booking-requests/hooks/useBookingRequests'
import { BottomNav } from '@/features/layout/components/BottomNav'
import { useBreakpoint } from '@/shared/hooks/useBreakpoint'

const { Header, Content } = Layout

function createMenuItems(pendingCount: number): ItemType[] {
  return [
    { key: '/', icon: <HomeOutlined />, label: 'Tổng quan' },
    { key: '/new-booking', icon: <FormOutlined />, label: 'Tạo đặt phòng mới' },
    { key: '/calendar', icon: <CalendarOutlined />, label: 'Lịch phòng' },
    { key: '/bookings', icon: <UnorderedListOutlined />, label: 'Đặt phòng' },
    {
      key: '/booking-requests',
      icon: <InboxOutlined />,
      label: (
        <Space size={8}>
          <span>Đặt phòng trực tiếp</span>
          {pendingCount > 0 ? <Badge count={pendingCount} color="red" /> : null}
        </Space>
      ),
    },
    { key: '/guests', icon: <TeamOutlined />, label: 'Khách' },
    { key: '/housekeeping', icon: <CheckSquareOutlined />, label: 'Housekeeping' },
    { key: '/so-quy', icon: <WalletOutlined />, label: 'Sổ quỹ' },
    { key: '/finance', icon: <DollarOutlined />, label: 'Tài chính' },
    { key: '/revenue', icon: <RiseOutlined />, label: 'Doanh thu' },
    { key: '/dk14-report', icon: <FileExcelOutlined />, label: 'Báo cáo ĐK14' },
    { key: '/s1a', icon: <AuditOutlined />, label: 'Sổ S1a — Doanh thu HKD' },
    { key: '/checkin-import', icon: <UserAddOutlined />, label: 'Import Check-in (Excel)' },
    { key: '/settings/rooms', icon: <HomeOutlined />, label: 'Quản lý phòng' },
    { key: '/settings/ical', icon: <LinkOutlined />, label: 'iCal Feed' },
  ]
}

function resolveSelectedKeys(pathname: string): string[] {
  const prefixMap: [string, string][] = [
    ['/new-booking', '/new-booking'],
    ['/calendar', '/calendar'],
    ['/bookings', '/bookings'],
    ['/booking-requests', '/booking-requests'],
    ['/guests', '/guests'],
    ['/housekeeping', '/housekeeping'],
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

  for (const [prefix, key] of prefixMap) {
    if (pathname.startsWith(prefix)) {
      return [key]
    }
  }

  return ['/']
}

export function MainLayout(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { isMobile } = useBreakpoint()
  const { data: pendingCount = 0 } = usePendingRequestCount()

  const selectedKeys = useMemo(() => resolveSelectedKeys(location.pathname), [location.pathname])
  const menuItems = useMemo(() => createMenuItems(pendingCount), [pendingCount])

  return (
    <Layout className="main-layout">
      <Header className="main-header">
        <Space direction="vertical" size={2}>
          <Typography.Text className="brand-kicker">Hello Dalat Hostel</Typography.Text>
          <Typography.Title level={4} className="brand-title">
            {isMobile ? 'PMS' : 'Hệ thống PMS / CRM'}
          </Typography.Title>
        </Space>
        {!isMobile && (
          <Menu
            mode="horizontal"
            items={menuItems}
            selectedKeys={selectedKeys}
            onClick={(event) => navigate(event.key)}
            className="main-menu"
          />
        )}
      </Header>
      <Content
        className="main-content"
        style={isMobile ? { paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' } : undefined}
      >
        <Outlet />
      </Content>
      <BottomNav />
    </Layout>
  )
}
