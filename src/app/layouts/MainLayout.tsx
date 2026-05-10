import {
  FileExcelOutlined,
  FormOutlined,
  HomeOutlined,
  LinkOutlined,
  RiseOutlined,
  TableOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import { Layout, Menu, Space, Typography } from 'antd'
import { useMemo } from 'react'
import type { JSX } from 'react'
import type { ItemType } from 'antd/es/menu/interface'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

const { Header, Content } = Layout

const menuItems: ItemType[] = [
  {
    key: '/',
    icon: <HomeOutlined />,
    label: 'Tổng quan',
  },
  {
    key: '/new-booking',
    icon: <FormOutlined />,
    label: 'Tạo đặt phòng mới',
  },
  {
    key: '/calendar',
    icon: <TableOutlined />,
    label: 'Lịch phòng',
  },
  {
    key: '/revenue',
    icon: <RiseOutlined />,
    label: 'Doanh thu',
  },
  {
    key: '/dk14-report',
    icon: <FileExcelOutlined />,
    label: 'Báo cáo ĐK14',
  },
  {
    key: '/checkin-import',
    icon: <UserAddOutlined />,
    label: 'Import Check-in (Excel)',
  },
  {
    key: '/settings/ical',
    icon: <LinkOutlined />,
    label: 'iCal Feed',
  },
]

export function MainLayout(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()

  const selectedKeys = useMemo(() => {
    if (location.pathname.startsWith('/new-booking')) {
      return ['/new-booking']
    }

    if (location.pathname.startsWith('/calendar')) {
      return ['/calendar']
    }

    if (location.pathname.startsWith('/revenue') || location.pathname.startsWith('/orevenue')) {
      return ['/revenue']
    }

    if (location.pathname.startsWith('/dk14-report')) {
      return ['/dk14-report']
    }

    if (location.pathname.startsWith('/checkin-import')) {
      return ['/checkin-import']
    }

    if (location.pathname.startsWith('/settings')) {
      return ['/settings/ical']
    }

    if (location.pathname.startsWith('/dashboard')) {
      return ['/']
    }

    return ['/']
  }, [location.pathname])

  return (
    <Layout className="main-layout">
      <Header className="main-header">
        <Space direction="vertical" size={2}>
          <Typography.Text className="brand-kicker">Hello Dalat Hostel</Typography.Text>
          <Typography.Title level={4} className="brand-title">
            Hệ thống PMS / CRM
          </Typography.Title>
        </Space>
        <Menu
          mode="horizontal"
          items={menuItems}
          selectedKeys={selectedKeys}
          onClick={(event) => navigate(event.key)}
          className="main-menu"
        />
      </Header>
      <Content className="main-content">
        <Outlet />
      </Content>
    </Layout>
  )
}
