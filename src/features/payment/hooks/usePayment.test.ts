import { beforeEach, describe, expect, it, vi } from 'vitest'

// Không render React: mock useState/useMutation để gọi thẳng mutationFn/onSuccess của hook thật.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: <T,>(init: T | (() => T)) => [typeof init === 'function' ? (init as () => T)() : init, () => {}],
  }
})

type MutationOptions = {
  mutationFn: (payload: unknown) => Promise<unknown>
  onSuccess?: (data: unknown, vars: unknown) => Promise<void> | void
  onError?: (err: unknown) => Promise<void> | void
}

vi.mock('@tanstack/react-query', () => ({
  useMutation: (opts: MutationOptions) => opts,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

const messageMock = { success: vi.fn(), info: vi.fn(), error: vi.fn() }
vi.mock('@/shared/hooks/useAppFeedback', () => ({
  useAppFeedback: () => ({ message: messageMock }),
}))
vi.mock('@/shared/hooks/useRefreshBookingData', () => ({
  useRefreshBookingData: () => vi.fn(),
}))

const rpc = vi.fn()
vi.mock('@/api/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }))

const { useRecordPayment } = await import('./usePayment')
const { useDepositActions } = await import('@/features/bookings/hooks/useDepositActions')

const payload = { groupId: 'g1', amount: 500000, method: 'transfer' as const, note: '' }

function requestIdOfCall(i: number): string {
  return (rpc.mock.calls[i][1] as { p_request_id: string }).p_request_id
}

beforeEach(() => {
  rpc.mockReset()
  Object.values(messageMock).forEach((m) => m.mockReset())
})

describe('useRecordPayment — record_payment_idempotent_txn', () => {
  it('gọi đúng RPC idempotent với p_request_id dạng UUID', async () => {
    rpc.mockResolvedValueOnce({ data: { success: true, replayed: false }, error: null })
    const m = useRecordPayment() as unknown as MutationOptions
    await m.mutationFn(payload)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('record_payment_idempotent_txn')
    expect(requestIdOfCall(0)).toMatch(/^[0-9a-f-]{36}$/)
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_group_id: 'g1', p_amount: 500000, p_method: 'transfer' })
  })

  it('retry sau lỗi mạng cùng ý định → cùng p_request_id', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
      .mockResolvedValueOnce({ data: { success: true, replayed: true }, error: null })
    const m = useRecordPayment() as unknown as MutationOptions
    await expect(m.mutationFn(payload)).rejects.toThrow()
    await m.mutationFn(payload)
    expect(requestIdOfCall(1)).toBe(requestIdOfCall(0))
  })

  it('khoản thu mới sau khi thành công → p_request_id khác', async () => {
    rpc.mockResolvedValue({ data: { success: true, replayed: false }, error: null })
    const m = useRecordPayment() as unknown as MutationOptions
    await m.mutationFn(payload)
    await m.mutationFn(payload)
    expect(requestIdOfCall(1)).not.toBe(requestIdOfCall(0))
  })

  it('đổi số tiền sau lỗi → p_request_id khác', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
      .mockResolvedValueOnce({ data: { success: true }, error: null })
    const m = useRecordPayment() as unknown as MutationOptions
    await expect(m.mutationFn(payload)).rejects.toThrow()
    await m.mutationFn({ ...payload, amount: 400000 })
    expect(requestIdOfCall(1)).not.toBe(requestIdOfCall(0))
  })

  it('P0017 → báo tiếng Việt, lần sau sinh id mới', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: 'P0017', message: 'REQUEST_ID_REUSED: request_id x đã dùng cho một thanh toán khác.' } })
      .mockResolvedValueOnce({ data: { success: true }, error: null })
    const m = useRecordPayment() as unknown as MutationOptions
    const err = await m.mutationFn(payload).catch((e: unknown) => e)
    expect((err as Error).message).toContain('Mã yêu cầu thu tiền đã được dùng')
    await m.mutationFn(payload)
    expect(requestIdOfCall(1)).not.toBe(requestIdOfCall(0))
  })

  it('replayed = true → thông báo "đã được ghi trước đó", không báo lỗi', async () => {
    const m = useRecordPayment() as unknown as MutationOptions
    await m.onSuccess?.({ success: true, replayed: true }, payload)
    expect(messageMock.info).toHaveBeenCalledWith(expect.stringContaining('đã được ghi trước đó'))
    expect(messageMock.success).not.toHaveBeenCalled()
    expect(messageMock.error).not.toHaveBeenCalled()
  })
})

describe('useDepositActions.addDeposit — record_payment_idempotent_txn', () => {
  it('retry cùng ý định giữ id, khoản mới đổi id', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
      .mockResolvedValueOnce({ data: { success: true, replayed: false }, error: null })
      .mockResolvedValueOnce({ data: { success: true, replayed: false }, error: null })
    const { addDeposit } = useDepositActions() as unknown as { addDeposit: MutationOptions }
    await expect(addDeposit.mutationFn(payload)).rejects.toThrow()
    await addDeposit.mutationFn(payload)
    await addDeposit.mutationFn(payload)
    expect(rpc.mock.calls.every((c) => c[0] === 'record_payment_idempotent_txn')).toBe(true)
    expect(requestIdOfCall(1)).toBe(requestIdOfCall(0))
    expect(requestIdOfCall(2)).not.toBe(requestIdOfCall(1))
  })
})
