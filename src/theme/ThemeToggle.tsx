import { Switch } from 'antd'
import { SunOutlined, MoonOutlined } from '@ant-design/icons'
import type { JSX } from 'react'
import { useThemeStore } from '@/stores/useThemeStore'

// Đặt component này vào Header/Sidebar hiện có của PMS
export function ThemeToggle(): JSX.Element {
  const mode = useThemeStore((state) => state.mode)
  const toggleMode = useThemeStore((state) => state.toggleMode)

  return (
    <Switch
      checked={mode === 'dark'}
      onChange={toggleMode}
      checkedChildren={<MoonOutlined />}
      unCheckedChildren={<SunOutlined />}
      aria-label="Chuyển đổi chế độ sáng/tối"
    />
  )
}
