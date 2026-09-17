// FILE: src/theme/pmsTheme.ts
/**
 * Hello Dalat PMS — Ant Design 5 Theme Config
 * Maps tokens.css values into Ant's ConfigProvider theme. Import tokens.css
 * once at app root, then wrap app with <ConfigProvider theme={getPmsTheme(mode)}>.
 */
import type { ThemeConfig } from 'antd'
import { theme as antdTheme } from 'antd'

// ---- Raw values mirrored from tokens.css (AntD không đọc CSS var trực tiếp) ----
const palette = {
  light: {
    bg: '#F5F5F3',
    surface: '#FFFFFF',
    ink: '#14141A',
    inkDim: '#6B6B66',
    rule: '#DEDDD6',
    accent: '#14141A',      // trước: '#B5552E' — đã tách khỏi --signal-hold
    accentInk: '#FFFFFF',
    go: '#5C6B4F',
    goBg: '#E7EBE2',
    hold: '#B5552E',
    holdBg: '#F3E3DA',
    stop: '#9B2C2C',
    stopBg: '#F5DEDE',
  },
  dark: {
    bg: '#0F0F0F',
    surface: '#1A1A1A',
    ink: '#F0F0EC',
    inkDim: '#ABABA4',
    rule: '#3A3A36',
    accent: '#F0F0EC',      // trước: '#D98256' — đã tách khỏi --signal-hold
    accentInk: '#14141A',
    go: '#A8D68F',
    goBg: '#1E2E17',
    hold: '#FF9D6E',
    holdBg: '#33200F',
    stop: '#FF7A7A',
    stopBg: '#331414',
  },
} as const

export function getPmsTheme(mode: 'light' | 'dark' = 'light'): ThemeConfig {
  const c = palette[mode]
  return {
    // algorithm derive các token AntD không được set tường minh ở dưới
    // (colorBgElevated, colorTextDescription, colorFillQuaternary...).
    // Không dùng undefined — AntD sẽ ngầm rơi về defaultAlgorithm (light)
    // cho các token đó dù mode đang là dark. Xem brain.decisions việc
    // sửa 2026-09-17 — bug Modal trắng + text đen trên dark mode.
    algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: c.accent,
      colorBgLayout: c.bg,
      colorBgContainer: c.surface,
      colorText: c.ink,
      colorTextSecondary: c.inkDim,
      colorBorder: c.rule,
      colorBorderSecondary: c.rule,
      colorSuccess: c.go,
      colorWarning: c.hold,
      colorError: c.stop,
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
      fontSize: 14,
      borderRadius: 4,
      borderRadiusSM: 2,
      padding: 12,
      paddingSM: 8,
      controlHeight: 36,
    },
    components: {
      Table: {
        cellPaddingBlock: 10,
        cellPaddingInline: 12,
        headerBg: c.surface,
        headerColor: c.inkDim,
        rowHoverBg: mode === 'light' ? '#EFEEEA' : '#202020',
        borderColor: c.rule,
      },
      Tag: {
        defaultBg: c.surface,
      },
      Button: {
        colorPrimary: c.accent,
        primaryColor: c.accentInk,
        borderRadius: 4,
      },
      Card: {
        boxShadow: 'none',
        boxShadowTertiary: 'none',
      },
    },
  }
}

export default getPmsTheme