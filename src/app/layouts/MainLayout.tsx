import { PlusOutlined } from '@ant-design/icons'
import { Button, Layout, Space, Typography } from 'antd'
import type { JSX } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { usePendingRequestCount } from '@/features/booking-requests/hooks/useBookingRequests'
import { BottomNav } from '@/features/layout/components/BottomNav'
import { MainNav } from '@/features/layout/components/MainNav'
import { NEW_BOOKING_LABEL, NEW_BOOKING_PATH } from '@/features/layout/navItems'
import { useBreakpoint } from '@/shared/hooks/useBreakpoint'
import { ThemeToggle } from '@/theme/ThemeToggle'

const { Header, Content } = Layout

export function MainLayout(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  // isDesktop = AntD lg (>= 992px): thanh menu ngang; dưới mức này dùng nút menu + ngăn kéo
  const { isMobile, isDesktop } = useBreakpoint()
  const pendingQuery = usePendingRequestCount()
  // F04: lỗi tải số yêu cầu chờ → ẩn badge (0) thay vì hiện số cũ có thể sai
  const pendingCount = pendingQuery.isError ? 0 : pendingQuery.data ?? 0
  const isOnNewBooking = location.pathname.startsWith(NEW_BOOKING_PATH)

  return (
    <Layout className="main-layout">
      {/* C1: nền header phủ 100% viewport; nội dung header nằm trong khung max-width căn giữa */}
      <Header className="main-header">
        <div className="main-header-inner">
          <Space direction="vertical" size={2} className="main-brand">
            {!isMobile && <Typography.Text className="brand-kicker">Hello Dalat Hostel</Typography.Text>}
            <Typography.Title level={4} className="brand-title">
              {isMobile ? 'PMS' : 'Hệ thống PMS / CRM'}
            </Typography.Title>
          </Space>
          {/* main-nav co giãn (min-width: 0) để không bao giờ đẩy tràn trang */}
          <div className="main-nav">
            {isDesktop && <MainNav isDesktop pendingCount={pendingCount} />}
            {/* C2: nút chính luôn hiển thị, không nằm trong dropdown */}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate(NEW_BOOKING_PATH)}
              aria-current={isOnNewBooking ? 'page' : undefined}
              className="main-new-booking"
            >
              {NEW_BOOKING_LABEL}
            </Button>
            {!isMobile && <ThemeToggle />}
            {!isDesktop && <MainNav isDesktop={false} pendingCount={pendingCount} />}
          </div>
        </div>
      </Header>
      <Content
        className="main-content"
        style={isMobile ? { paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' } : undefined}
      >
        <div className="main-content-inner">
          <Outlet />
        </div>
      </Content>
      <BottomNav />
    </Layout>
  )
}
