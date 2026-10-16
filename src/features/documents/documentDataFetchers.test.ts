import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
type Table = 'bookings' | 'groups' | 'rooms' | 'booking_services' | 'booking_discounts' | 'payment_history'

// Dữ liệu giả lập — không gọi Supabase thật.
const db: Record<Table, Row[]> = {
  bookings: [],
  groups: [],
  rooms: [],
  booking_services: [],
  booking_discounts: [],
  payment_history: [],
}

function builder(table: Table) {
  const filters: Array<[string, unknown]> = []
  const run = () => db[table].filter((r) => filters.every(([c, v]) => r[c] === v))
  const b = {
    select: () => b,
    eq: (column: string, value: unknown) => (filters.push([column, value]), b),
    order: () => b,
    single: () => {
      const rows = run()
      return Promise.resolve(
        rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } },
      )
    },
    then: (resolve: (r: { data: Row[]; error: null }) => unknown) => resolve({ data: run(), error: null }),
  }
  return b
}

vi.mock('@/api/supabase', () => ({
  supabase: { from: (table: Table) => builder(table) },
}))

const { fetchDocumentData } = await import('./documentDataFetchers')

const GROUP_ID = 'g-1'
const BOOKING_ID = 'b-1'

beforeEach(() => {
  db.bookings = [
    {
      id: BOOKING_ID,
      group_id: GROUP_ID,
      room_id: '301',
      check_in: '2026-10-15',
      check_out: '2026-10-17',
      nights: 2,
      price_per_night: 300000,
      room_subtotal: 600000,
      surcharge: 0,
      grand_total: 600000,
      tax_rate: 0,
      tax_amount: 0,
      has_early_check_in: false,
      has_late_check_out: false,
      guest_name: 'Khách mẫu',
      guests_count: 2,
      status: 'booked',
      note: null,
    },
  ]
  // groups.paid do DB quản lý = 200.000 (khoản 300.000 đã bị void và đảo)
  db.groups = [
    {
      id: GROUP_ID,
      customer_name: 'Khách mẫu',
      customer_phone: '0900000000',
      source: 'Walk-in',
      ota_booking_number: null,
      paid: 200000,
      deposit_method: null,
    },
  ]
  db.rooms = [{ id: '301', name: 'Standard Double', type: 'standard_double' }]
  db.booking_services = []
  db.booking_discounts = []
  db.payment_history = [
    { id: 'p-ok', group_id: GROUP_ID, amount: 200000, method: 'cash', date: '2026-10-15', note: null, is_void: false },
    // Khoản thu bị void: dòng gốc + bút toán đảo đều is_void = true
    { id: 'p-void', group_id: GROUP_ID, amount: 300000, method: 'transfer', date: '2026-10-15', note: 'nhập nhầm', is_void: true },
    { id: 'p-rev', group_id: GROUP_ID, amount: -300000, method: 'transfer', date: '2026-10-16', note: 'Void: nhập nhầm', is_void: true },
  ]
})

describe('fetchDocumentData — payment đã void', () => {
  it('chỉ liệt kê khoản thu hợp lệ, bỏ dòng gốc đã void và bút toán đảo', async () => {
    const data = await fetchDocumentData(BOOKING_ID, GROUP_ID)
    expect(data.payments.map((p) => p.id)).toEqual(['p-ok'])
    expect(data.payments[0]).toMatchObject({ amount: 200000, method: 'cash' })
  })

  it('tổng tiền và số đã trả giữ nguyên (đọc từ DB, không cộng lại từ payments)', async () => {
    const data = await fetchDocumentData(BOOKING_ID, GROUP_ID)
    expect(data.grandTotal).toBe(600000)
    expect(data.paid).toBe(200000)
    // Còn lại = grandTotal - paid = 400.000, không đổi so với trước khi lọc
    expect(data.grandTotal - data.paid).toBe(400000)
    // Tổng các dòng liệt kê khớp với groups.paid
    expect(data.payments.reduce((s, p) => s + p.amount, 0)).toBe(data.paid)
  })

  it('group không có payment hợp lệ nào → danh sách rỗng', async () => {
    db.payment_history = db.payment_history.filter((p) => p.is_void)
    db.groups[0].paid = 0
    const data = await fetchDocumentData(BOOKING_ID, GROUP_ID)
    expect(data.payments).toEqual([])
    expect(data.paid).toBe(0)
  })
})
