import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntdApp, ConfigProvider } from 'antd'
import viVN from 'antd/locale/vi_VN'
import dayjs from 'dayjs'
import 'dayjs/locale/vi'
import { useEffect, useState } from 'react'
import type { JSX, PropsWithChildren } from 'react'
import { getPmsTheme } from '@/theme/pmsTheme'
import { useThemeStore } from '@/stores/useThemeStore'

dayjs.locale('vi')

// U-09: locale vi_VN mặc định để Empty là "Trống" — đổi sang "Không có dữ liệu" cho rõ nghĩa
const pmsLocale = { ...viVN, Empty: { ...viVN.Empty, description: 'Không có dữ liệu' } }

type AppProvidersProps = PropsWithChildren

export function AppProviders({ children }: AppProvidersProps): JSX.Element {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  const mode = useThemeStore((state) => state.mode)

  // Set data-theme lên <html> để tokens.css (CSS variable) áp dụng đúng mode
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode)
  }, [mode])

  return (
    <ConfigProvider locale={pmsLocale} theme={getPmsTheme(mode)}>
      <AntdApp>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  )
}
