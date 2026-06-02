import { Grid } from 'antd'
import type { ScreenMap } from 'antd/es/_util/responsiveObserver'

const { useBreakpoint: useAntdBreakpoint } = Grid

export interface Breakpoints {
	isMobile: boolean
	isTablet: boolean
	isDesktop: boolean
	screens: ScreenMap | Partial<Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl', boolean>>
}

export function useBreakpoint(): Breakpoints {
	const screens = useAntdBreakpoint()

	const isMobile = !screens.md
	const isTablet = !!screens.md && !screens.lg
	const isDesktop = !!screens.lg

	return { isMobile, isTablet, isDesktop, screens }
}