import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import type { MonthlyRevenueSummary } from '../types'

// Hiển thị số tiền dạng thuần số (không ký hiệu) để nhập kế toán
function toNumber(amount: number): number {
  return Math.round(amount)
}

function formatMonth(month: dayjs.Dayjs): string {
  return month.format('MM/YYYY')
}

// Tính OTA fee cho một group theo channel_fee_rate
function calcOtaFee(netRevenue: number, channelFeeRate: number): number {
  if (!channelFeeRate) return 0
  // net_revenue = gross * (1 - rate) => gross = net / (1 - rate), fee = gross * rate
  // hoặc đơn giản: fee ≈ net_revenue * rate
  return Math.round(netRevenue * channelFeeRate)
}

export function exportFinanceExcel(summary: MonthlyRevenueSummary, month: dayjs.Dayjs): void {
  const wb = XLSX.utils.book_new()
  const monthLabel = formatMonth(month)
  const fileName = `DoanhThu_${month.format('MM-YYYY')}.xlsx`

  // --- Sheet 1: Tổng hợp ---
  const summaryRows: (string | number)[][] = []

  summaryRows.push([`Báo cáo Doanh thu Tháng ${monthLabel}`])
  summaryRows.push([])
  summaryRows.push(['Tháng', monthLabel])
  summaryRows.push(['Tổng doanh thu net (VND)', toNumber(summary.total_net)])
  summaryRows.push(['Đã thu (VND)', toNumber(summary.total_paid)])
  summaryRows.push(['Còn nợ (VND)', toNumber(summary.total_debt)])
  summaryRows.push(['Thu thêm khác (VND)', toNumber(summary.manual_revenue)])
  summaryRows.push(['Số nhóm khách', summary.booking_count])
  summaryRows.push([])

  // Phân theo kênh
  summaryRows.push(['Phân theo kênh'])
  summaryRows.push(['Kênh', 'Số booking', 'Doanh thu (VND)', 'OTA fee (VND)', 'Net sau fee (VND)'])

  // Tổng hợp theo nguồn
  const bySource = new Map<string, { count: number; revenue: number; otaFee: number }>()
  for (const g of summary.groups) {
    const src = g.source ?? 'Khác'
    const existing = bySource.get(src) ?? { count: 0, revenue: 0, otaFee: 0 }
    const fee = calcOtaFee(g.net_revenue, g.channel_fee_rate)
    bySource.set(src, {
      count: existing.count + 1,
      revenue: existing.revenue + g.net_revenue,
      otaFee: existing.otaFee + fee,
    })
  }

  for (const [src, val] of bySource.entries()) {
    summaryRows.push([
      src,
      val.count,
      toNumber(val.revenue),
      toNumber(val.otaFee),
      toNumber(val.revenue - val.otaFee),
    ])
  }

  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows)
  // Thiết lập độ rộng cột
  ws1['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Tổng hợp')

  // --- Sheet 2: Chi tiết từng booking ---
  const detailHeaders = [
    'STT',
    'Khách',
    'Kênh',
    'Check-in',
    'Check-out',
    'Doanh thu (VND)',
    'OTA fee (VND)',
    'Net sau fee (VND)',
    'Đã thu (VND)',
    'Còn nợ (VND)',
  ]
  const detailRows: (string | number)[][] = [detailHeaders]

  summary.groups.forEach((g, idx) => {
    const otaFee = calcOtaFee(g.net_revenue, g.channel_fee_rate)
    const debt = g.net_revenue - g.paid
    detailRows.push([
      idx + 1,
      g.customer_name,
      g.source ?? 'Khác',
      g.check_in ? dayjs(g.check_in).format('DD/MM/YYYY') : '',
      g.check_out ? dayjs(g.check_out).format('DD/MM/YYYY') : '',
      toNumber(g.net_revenue),
      toNumber(otaFee),
      toNumber(g.net_revenue - otaFee),
      toNumber(g.paid),
      toNumber(debt),
    ])
  })

  const ws2 = XLSX.utils.aoa_to_sheet(detailRows)
  ws2['!cols'] = [
    { wch: 5 },
    { wch: 25 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 20 },
    { wch: 18 },
    { wch: 20 },
    { wch: 18 },
    { wch: 15 },
  ]
  XLSX.utils.book_append_sheet(wb, ws2, 'Chi tiết')

  XLSX.writeFile(wb, fileName)
}
