import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
type Filter = { op: 'eq' | 'lt' | 'in'; column: string; value: unknown }

// Dữ liệu giả lập — không gọi Supabase thật.
const db: { bookings: Row[]; groups: Row[] } = { bookings: [], groups: [] }

function matches(row: Row, f: Filter): boolean {
  const v = row[f.column]
  if (f.op === 'eq') return v === f.value
  if (f.op === 'lt') return String(v) < String(f.value)
  return (f.value as unknown[]).includes(v)
}

function builder(table: 'bookings' | 'groups') {
  const filters: Filter[] = []
  const b = {
    select: () => b,
    eq: (column: string, value: unknown) => (filters.push({ op: 'eq', column, value }), b),
    lt: (column: string, value: unknown) => (filters.push({ op: 'lt', column, value }), b),
    in: (column: string, value: unknown[]) => (filters.push({ op: 'in', column, value }), b),
    order: () => b,
    then: (resolve: (r: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: db[table].filter((r) => filters.every((f) => matches(r, f))), error: null }),
  }
  return b
}

vi.mock('@/api/supabase', () => ({
  supabase: { from: (table: 'bookings' | 'groups') => builder(table) },
}))

const { fetchOverdueBookings } = await import('./useOverdueBookings')

const TODAY = '2026-10-16'

function booking(id: string, group_id: string, room_id: string, check_out: string, status = 'checked-in'): Row {
  return { id, group_id, room_id, check_in: '2026-10-10', check_out, status, is_deleted: false }
}

describe('fetchOverdueBookings', () => {
  beforeEach(() => {
    db.bookings = []
    db.groups = []
  })

  it('trả mảng rỗng khi không có booking quá hạn', async () => {
    db.bookings = [booking('b1', 'g1', '201', TODAY), booking('b2', 'g1', '202', '2026-10-15', 'booked')]
    db.groups = [{ id: 'g1', customer_name: 'A', grand_total: 100, paid: 0, is_deleted: false }]
    expect(await fetchOverdueBookings(TODAY)).toEqual([])
  })

  it('isLastActiveInGroup = false khi group còn 2 booking active, true khi chỉ còn 1', async () => {
    db.bookings = [
      booking('b1', 'g1', '201', '2026-10-15'),
      booking('b2', 'g1', '202', '2026-10-20', 'booked'),
      booking('b3', 'g2', '301', '2026-10-14'),
      booking('b4', 'g2', '302', '2026-10-14', 'checked-out'),
    ]
    db.groups = [
      { id: 'g1', customer_name: 'A', grand_total: 1_000_000, paid: 400_000, is_deleted: false },
      { id: 'g2', customer_name: 'B', grand_total: 500_000, paid: 500_000, is_deleted: false },
    ]

    const rows = await fetchOverdueBookings(TODAY)
    const b1 = rows.find((r) => r.bookingId === 'b1')
    const b3 = rows.find((r) => r.bookingId === 'b3')

    expect(b1?.isLastActiveInGroup).toBe(false)
    expect(b1?.remaining).toBe(600_000)
    expect(b3?.isLastActiveInGroup).toBe(true)
    expect(b3?.remaining).toBe(0)
  })

  it('daysOverdue tính đúng theo ngày', async () => {
    db.bookings = [booking('b1', 'g1', '201', '2026-10-15'), booking('b2', 'g1', '202', '2026-10-09')]
    db.groups = [{ id: 'g1', customer_name: 'A', grand_total: 0, paid: 0, is_deleted: false }]

    const rows = await fetchOverdueBookings(TODAY)
    expect(rows.find((r) => r.bookingId === 'b1')?.daysOverdue).toBe(1)
    expect(rows.find((r) => r.bookingId === 'b2')?.daysOverdue).toBe(7)
  })

  it('bỏ qua booking có group đã soft-delete', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.bookings = [booking('b1', 'g1', '201', '2026-10-15'), booking('b2', 'g2', '202', '2026-10-15')]
    db.groups = [
      { id: 'g1', customer_name: 'A', grand_total: 0, paid: 0, is_deleted: true },
      { id: 'g2', customer_name: 'B', grand_total: 0, paid: 0, is_deleted: false },
    ]

    const rows = await fetchOverdueBookings(TODAY)
    expect(rows.map((r) => r.bookingId)).toEqual(['b2'])
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
