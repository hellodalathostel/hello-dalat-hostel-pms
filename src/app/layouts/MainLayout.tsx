import {
  CalendarOutlined,
  CheckSquareOutlined,
  DollarOutlined,
  FileExcelOutlined,
  FormOutlined,
  HomeOutlined,
  LinkOutlined,
  RiseOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import { Layout, Menu, Space, Typography } from 'antd'
import { useMemo } from 'react'
import type { JSX } from 'react'
import type { ItemType } from 'antd/es/menu/interface'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BottomNav } from '@/features/layout/components/BottomNav'
import { useBreakpoint } from '@/shared/hooks/useBreakpoint'

const { Header, Content } = Layout

const menuItems: ItemType[] = [
  { key: '/', icon: <HomeOutlined />, label: 'Tổng quan' },
  { key: '/new-booking', icon: <FormOutlined />, label: 'Tạo đặt phòng mới' },
  { key: '/calendar', icon: <CalendarOutlined />, label: 'Lịch phòng' },
  { key: '/bookings', icon: <UnorderedListOutlined />, label: 'Đặt phòng' },
  { key: '/guests', icon: <TeamOutlined />, label: 'Khách' },
  { key: '/housekeeping', icon: <CheckSquareOutlined />, label: 'Housekeeping' },
  { key: '/finance', icon: <DollarOutlined />, label: 'Tài chính' },
  { key: '/revenue', icon: <RiseOutlined />, label: 'Doanh thu' },
  { key: '/dk14-report', icon: <FileExcelOutlined />, label: 'Báo cáo ĐK14' },
  { key: '/checkin-import', icon: <UserAddOutlined />, label: 'Import Check-in (Excel)' },
  { key: '/settings/ical', icon: <LinkOutlined />, label: 'iCal Feed' },
]

function resolveSelectedKeys(pathname: string): string[] {
  const prefixMap: [string, string][] = [
    ['/new-booking', '/new-booking'],
    ['/calendar', '/calendar'],
    ['/bookings', '/bookings'],
    ['/guests', '/guests'],
    ['/housekeeping', '/housekeeping'],
    ['/finance', '/finance'],
    ['/revenue', '/revenue'],
    ['/orevenue', '/revenue'],
    ['/dk14-report', '/dk14-report'],
    ['/checkin-import', '/checkin-import'],
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

  const selectedKeys = useMemo(() => resolveSelectedKeys(location.pathname), [location.pathname])

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
