import { describe, expect, it } from 'vitest'
import { createPaymentRequestIdStore, isReplayed, isRequestIdReused } from './paymentRequestId'

function counterStore() {
  let n = 0
  return createPaymentRequestIdStore(() => `id-${++n}`)
}

const intent = { groupId: 'g1', amount: 500000, method: 'transfer' }

describe('createPaymentRequestIdStore', () => {
  it('cùng ý định chưa thành công → dùng lại id', () => {
    const store = counterStore()
    expect(store.get(intent)).toBe('id-1')
    expect(store.get({ ...intent })).toBe('id-1')
  })

  it('đổi số tiền / phương thức / group → id mới', () => {
    const store = counterStore()
    expect(store.get(intent)).toBe('id-1')
    expect(store.get({ ...intent, amount: 400000 })).toBe('id-2')
    expect(store.get({ ...intent, amount: 400000, method: 'cash' })).toBe('id-3')
    expect(store.get({ ...intent, amount: 400000, method: 'cash', groupId: 'g2' })).toBe('id-4')
  })

  it('consume sau khi thành công → khoản sau (kể cả cùng số tiền) có id mới', () => {
    const store = counterStore()
    const first = store.get(intent)
    store.consume(first)
    expect(store.get(intent)).toBe('id-2')
  })

  it('consume id cũ không xoá id của ý định mới hơn', () => {
    const store = counterStore()
    const old = store.get(intent)
    const newer = store.get({ ...intent, amount: 1 })
    store.consume(old)
    expect(store.get({ ...intent, amount: 1 })).toBe(newer)
  })
})

describe('isReplayed / isRequestIdReused', () => {
  it('nhận đúng cờ replayed', () => {
    expect(isReplayed({ replayed: true })).toBe(true)
    expect(isReplayed({ replayed: false })).toBe(false)
    expect(isReplayed(null)).toBe(false)
  })

  it('nhận P0017 theo code hoặc message', () => {
    expect(isRequestIdReused({ code: 'P0017', message: 'x' })).toBe(true)
    expect(isRequestIdReused(new Error('REQUEST_ID_REUSED: request_id abc đã dùng'))).toBe(true)
    expect(isRequestIdReused({ code: 'P0015', message: 'OVERPAYMENT' })).toBe(false)
  })
})
