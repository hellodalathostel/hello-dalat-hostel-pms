import { MenuOutlined } from '@ant-design/icons'
import { Badge, Button, Drawer, Flex, Menu, Typography } from 'antd'
import type { ItemType } from 'antd/es/menu/interface'
import { useEffect, useMemo, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  NAV_GROUPS,
  findGroupKey,
  resolveActivePath,
} from '@/features/layout/navItems'
import type { NavGroup } from '@/features/layout/navItems'
import { ThemeToggle } from '@/theme/ThemeToggle'

const BOOKING_REQUESTS_PATH = '/booking-requests'

type MainNavProps = {
  // true: thanh menu ngang 3 dropdown (desktop). false: nút menu mở ngăn kéo (mobile/tablet).
  isDesktop: boolean
  pendingCount: number
}

function renderItemLabel(path: string, label: string, pendingCount: number): ReactNode {
  if (path === BOOKING_REQUESTS_PATH && pendingCount > 0) {
    return (
      <Flex align="center" gap={8} component="span">
        <span>{label}</span>
        <Badge count={pendingCount} color="red" aria-label={`${pendingCount} yêu cầu chờ xử lý`} />
      </Flex>
    )
  }
  return label
}

// Nhãn nhóm: đánh dấu khi trang đang xem nằm trong nhóm; hiện chấm đỏ nếu "Đặt phòng trực tiếp"
// có yêu cầu chờ — để badge không bị giấu trong dropdown đang đóng.
function renderGroupLabel(group: NavGroup, isActive: boolean, pendingCount: number): ReactNode {
  const hasPending = pendingCount > 0 && group.items.some((item) => item.path === BOOKING_REQUESTS_PATH)
  return (
    <span className={isActive ? 'nav-group-label nav-group-label--active' : 'nav-group-label'}>
      {hasPending ? (
        <Badge dot color="red" offset={[6, 0]}>
          <span>{group.label}</span>
        </Badge>
      ) : (
        group.label
      )}
    </span>
  )
}

export function MainNav({ isDesktop, pendingCount }: MainNavProps): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [openKeys, setOpenKeys] = useState<string[]>([])
  const [lastPathname, setLastPathname] = useState(location.pathname)

  const activePath = resolveActivePath(location.pathname)
  const activeGroupKey = findGroupKey(activePath)

  // Đổi trang (kể cả bằng nút Back hay nút "Tạo đặt phòng mới") → đóng dropdown và ngăn kéo.
  // Điều chỉnh state ngay trong render thay vì useEffect (tránh render dây chuyền).
  if (lastPathname !== location.pathname) {
    setLastPathname(location.pathname)
    setOpenKeys([])
    setDrawerOpen(false)
  }

  // rc-menu chỉ bắt Esc khi focus nằm trong menu; dropdown mở bằng chuột thì focus ở ngoài
  // → lắng nghe Esc trên document trong lúc có dropdown đang mở.
  const hasOpenDropdown = openKeys.length > 0
  useEffect(() => {
    if (!hasOpenDropdown) {
      return undefined
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpenKeys([])
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [hasOpenDropdown])

  const desktopItems = useMemo<ItemType[]>(
    () =>
      NAV_GROUPS.map((group) => ({
        key: group.key,
        label: renderGroupLabel(group, group.key === activeGroupKey, pendingCount),
        popupClassName: 'main-menu-popup',
        children: group.items.map((item) => ({
          key: item.path,
          icon: item.icon,
          label: renderItemLabel(item.path, item.label, pendingCount),
        })),
      })),
    [activeGroupKey, pendingCount],
  )

  const drawerItems = useMemo<ItemType[]>(
    () =>
      NAV_GROUPS.map((group) => ({
        type: 'group' as const,
        key: group.key,
        label: renderGroupLabel(group, group.key === activeGroupKey, pendingCount),
        children: group.items.map((item) => ({
          key: item.path,
          icon: item.icon,
          label: renderItemLabel(item.path, item.label, pendingCount),
        })),
      })),
    [activeGroupKey, pendingCount],
  )

  const handleNavigate = (path: string): void => {
    setOpenKeys([])
    setDrawerOpen(false)
    if (path !== location.pathname) {
      navigate(path)
    }
  }

  if (isDesktop) {
    return (
      <Menu
        mode="horizontal"
        aria-label="Menu chính"
        items={desktopItems}
        selectedKeys={[activePath]}
        openKeys={openKeys}
        onOpenChange={setOpenKeys}
        // click thay vì hover: dùng được trên màn cảm ứng, bấm ra ngoài thì đóng
        triggerSubMenuAction="click"
        onClick={(event) => handleNavigate(event.key)}
        className="main-menu"
      />
    )
  }

  return (
    <>
      <Button
        icon={<MenuOutlined />}
        onClick={() => setDrawerOpen(true)}
        aria-label="Mở menu"
        aria-expanded={drawerOpen}
        aria-controls="main-nav-drawer"
        className="main-nav-toggle"
      />
      <Drawer
        id="main-nav-drawer"
        title="Menu"
        placement="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={320}
        className="main-nav-drawer"
        closeIcon={<span aria-label="Đóng menu">✕</span>}
        footer={
          <Flex align="center" justify="space-between">
            <Typography.Text>Giao diện tối</Typography.Text>
            <ThemeToggle />
          </Flex>
        }
      >
        <Menu
          mode="inline"
          aria-label="Menu chính"
          items={drawerItems}
          selectedKeys={[activePath]}
          onClick={(event) => handleNavigate(event.key)}
          className="main-nav-drawer-menu"
        />
      </Drawer>
    </>
  )
}
