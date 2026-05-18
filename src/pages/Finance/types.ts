export interface GroupRevenueSummary {
  group_id: string
  customer_name: string
  source: string | null
  net_revenue: number // từ groups.net_revenue (trigger-driven)
  paid: number // groups.paid
  channel_fee_rate: number // để tính OTA fee hiển thị
  service_revenue: number // từ booking_services
  check_in: string // date string
  check_out: string
}

export interface MonthlyRevenueSummary {
  groups: GroupRevenueSummary[]
  manual_revenue: number
  // computed client-side:
  total_net: number // SUM(net_revenue) + manual_revenue
  total_paid: number // SUM(paid)
  total_debt: number // total_net - total_paid
  booking_count: number
}

export interface UnpaidGroup {
  id: string
  customer_name: string
  source: string | null
  net_revenue: number
  paid: number
  debt: number
  check_out: string
}
