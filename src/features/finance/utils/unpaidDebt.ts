// src/features/finance/utils/unpaidDebt.ts
// Hàm thuần tính công nợ khách theo cấp group.
// Nợ thật của khách = groups.grand_total − groups.paid.
// KHÔNG dùng net_revenue (doanh thu sau phí kênh) — so paid với net_revenue che mất
// các đoàn đã trả > net_revenue nhưng < grand_total.

import type { UnpaidGroup } from '../types'

export interface RawGroupWithBookings {
  id: string
  customer_name: string
  source: string | null
  grand_total: number | null
  net_revenue: number | null
  paid: number | null
  bookings: { check_out: string }[] | null
}

/** Số tiền khách còn nợ của 1 group (có thể âm nếu trả dư). */
export function groupDebt(g: { grand_total: number | null; paid: number | null }): number {
  return (g.grand_total ?? 0) - (g.paid ?? 0)
}

/** Lọc các group còn nợ (debt > 0), map sang UnpaidGroup, sort theo check-out tăng dần. */
export function computeUnpaidGroups(rawGroups: RawGroupWithBookings[]): UnpaidGroup[] {
  return rawGroups
    .filter((g) => groupDebt(g) > 0)
    .map((g) => {
      const checkOuts = (g.bookings ?? []).map((b) => b.check_out).filter(Boolean)
      const maxCheckOut = checkOuts.length > 0 ? checkOuts.sort().at(-1)! : ''
      return {
        id: g.id,
        customer_name: g.customer_name,
        source: g.source,
        grand_total: g.grand_total ?? 0,
        net_revenue: g.net_revenue ?? 0,
        paid: g.paid ?? 0,
        debt: groupDebt(g),
        check_out: maxCheckOut,
      }
    })
    .sort((a, b) => a.check_out.localeCompare(b.check_out))
}
