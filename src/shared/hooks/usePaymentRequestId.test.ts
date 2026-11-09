import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePaymentRequestId } from './usePaymentRequestId'

// Repo chưa có @testing-library/react / jsdom (không thêm thư viện) — chạy hook trong một
// component render bằng react-dom/server. useRef giữ giá trị suốt lần render đó, đủ để kiểm
// vòng đời id (giữa các lần re-render thì useRef do React bảo đảm).
type Hook = ReturnType<typeof usePaymentRequestId>

function runHook(fn: (hook: Hook) => void) {
  function Probe() {
    fn(usePaymentRequestId())
    return null
  }
  renderToString(createElement(Probe))
}

describe('usePaymentRequestId', () => {
  let counter = 0

  beforeEach(() => {
    counter = 0
    vi.spyOn(crypto, 'randomUUID').mockImplementation(
      () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('cùng key gọi 2 lần → cùng id', () => {
    runHook(({ getRequestId }) => {
      const a = getRequestId('g1|1000|cash')
      const b = getRequestId('g1|1000|cash')
      expect(b).toBe(a)
    })
    expect(counter).toBe(1)
  })

  it('key đổi → id mới', () => {
    runHook(({ getRequestId }) => {
      const a = getRequestId('g1|1000|cash')
      const b = getRequestId('g1|2000|cash')
      const c = getRequestId('g1|2000|card')
      expect(b).not.toBe(a)
      expect(c).not.toBe(b)
    })
  })

  it('sau rotateRequestId() → id mới dù key giữ nguyên', () => {
    runHook(({ getRequestId, rotateRequestId }) => {
      const a = getRequestId('g1|1000|cash')
      rotateRequestId()
      const b = getRequestId('g1|1000|cash')
      expect(b).not.toBe(a)
      expect(getRequestId('g1|1000|cash')).toBe(b)
    })
  })
})
