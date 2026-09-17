import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Test này CHẶN việc pmsTheme.ts (palette hardcode cho AntD ConfigProvider)
// trôi khỏi tokens.css (CSS variable cho phần UI thuần CSS). 2 file này phải
// luôn khớp giá trị — bài học từ bug 2026-09-17 (xem brain.decisions):
// tokens.css đổi 4 lần, pmsTheme.ts đứng yên, dẫn tới Table/Card/Tag AntD
// vẽ sai màu suốt nhiều đợt mà không ai phát hiện.

// Map: tên biến CSS trong tokens.css → tên field trong palette.dark của pmsTheme.ts
const DARK_MODE_MAP: Record<string, string> = {
  '--bg': 'bg',
  '--surface': 'surface',
  '--ink': 'ink',
  '--ink-dim': 'inkDim',
  '--rule': 'rule',
  '--signal-go': 'go',
  '--signal-go-bg': 'goBg',
  '--signal-hold': 'hold',
  '--signal-hold-bg': 'holdBg',
  '--signal-stop': 'stop',
  '--signal-stop-bg': 'stopBg',
}

function extractCssVar(cssContent: string, blockSelector: string, varName: string): string | null {
  // Tìm khối [data-theme='dark'] { ... } hoặc :root { ... }, lấy giá trị 1 biến trong đó
  const blockRegex = new RegExp(`${blockSelector.replace(/[[\]']/g, '\\$&')}\\s*{([^}]*)}`)
  const blockMatch = cssContent.match(blockRegex)
  if (!blockMatch) return null

  const varRegex = new RegExp(`${varName}:\\s*(#[0-9A-Fa-f]{6})`)
  const varMatch = blockMatch[1].match(varRegex)
  return varMatch ? varMatch[1].toUpperCase() : null
}

function extractPaletteField(tsContent: string, mode: 'light' | 'dark', field: string): string | null {
  // Tìm khối light: {...} hoặc dark: {...}, lấy giá trị 1 field trong đó
  const blockRegex = new RegExp(`${mode}:\\s*{([^}]*)}`)
  const blockMatch = tsContent.match(blockRegex)
  if (!blockMatch) return null

  const fieldRegex = new RegExp(`${field}:\\s*'(#[0-9A-Fa-f]{6})'`)
  const fieldMatch = blockMatch[1].match(fieldRegex)
  return fieldMatch ? fieldMatch[1].toUpperCase() : null
}

describe('pmsTheme.ts đồng bộ với tokens.css (dark mode)', () => {
  const cssContent = readFileSync(resolve(__dirname, './tokens.css'), 'utf-8')
  const tsContent = readFileSync(resolve(__dirname, './pmsTheme.ts'), 'utf-8')

  for (const [cssVar, tsField] of Object.entries(DARK_MODE_MAP)) {
    it(`${cssVar} (tokens.css) khớp ${tsField} (pmsTheme.ts palette.dark)`, () => {
      // Truyền selector THÔ — extractCssVar tự escape. Nếu escape sẵn ở đây
      // sẽ bị escape 2 lần và regex không match được khối nào.
      const cssValue = extractCssVar(cssContent, "[data-theme='dark']", cssVar)
      const tsValue = extractPaletteField(tsContent, 'dark', tsField)

      expect(cssValue, `Không tìm thấy ${cssVar} trong tokens.css`).not.toBeNull()
      expect(tsValue, `Không tìm thấy field '${tsField}' trong palette.dark của pmsTheme.ts`).not.toBeNull()
      expect(tsValue).toBe(cssValue)
    })
  }
})
