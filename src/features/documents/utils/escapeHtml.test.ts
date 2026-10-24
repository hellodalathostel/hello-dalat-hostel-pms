import { describe, expect, it } from 'vitest'
import { escapeHtml } from './escapeHtml'

describe('escapeHtml', () => {
  it('escape đủ 5 ký tự & < > " \'', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('null/undefined → chuỗi rỗng', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })

  it('giữ nguyên chuỗi thường, tiếng Việt và số', () => {
    expect(escapeHtml('Nguyễn Văn A')).toBe('Nguyễn Văn A')
    expect(escapeHtml(123)).toBe('123')
  })

  it('vô hiệu hoá payload XSS', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;')
    expect(escapeHtml('"><script>x</script>')).toBe('&quot;&gt;&lt;script&gt;x&lt;/script&gt;')
  })
})
