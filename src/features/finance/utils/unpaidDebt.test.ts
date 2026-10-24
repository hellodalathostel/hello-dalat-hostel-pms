import { describe, expect, it } from 'vitest'
import { computeUnpaidGroups, groupDebt, type RawGroupWithBookings } from './unpaidDebt'

function group(id: string, grand_total: number, net_revenue: number, paid: number): RawGroupWithBookings {
  return {
    id,
    customer_name: `Khách ${id}`,
    source: 'booking.com',
    grand_total,
    net_revenue,
    paid,
    bookings: [{ check_out: '2026-10-10' }],
  }
}

describe('computeUnpaidGroups — công nợ theo grand_total', () => {
  it('paid > net_revenue nhưng < grand_total → vẫn nợ 100.000 và có trong danh sách', () => {
    const result = computeUnpaidGroups([group('a', 1_000_000, 830_000, 900_000)])
    expect(result).toHaveLength(1)
    expect(result[0].debt).toBe(100_000)
    expect(result[0].grand_total).toBe(1_000_000)
  })

  it('paid = grand_total → không xuất hiện', () => {
    expect(computeUnpaidGroups([group('b', 1_000_000, 830_000, 1_000_000)])).toHaveLength(0)
  })

  it('paid > grand_total → không xuất hiện', () => {
    expect(computeUnpaidGroups([group('c', 1_000_000, 830_000, 1_100_000)])).toHaveLength(0)
  })

  it('null coi như 0; lấy check-out muộn nhất và sort tăng dần', () => {
    const late: RawGroupWithBookings = {
      ...group('late', 500_000, 500_000, 0),
      bookings: [{ check_out: '2026-10-05' }, { check_out: '2026-10-20' }],
    }
    const early: RawGroupWithBookings = { ...group('early', 300_000, 300_000, 0), paid: null }
    const result = computeUnpaidGroups([late, early])
    expect(result.map((r) => r.id)).toEqual(['early', 'late'])
    expect(result[1].check_out).toBe('2026-10-20')
    expect(result[0].paid).toBe(0)
    expect(groupDebt({ grand_total: null, paid: null })).toBe(0)
  })
})
