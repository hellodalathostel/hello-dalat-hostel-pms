import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import type { DashboardRoom } from '@/types/dashboard'
import {
  ROOM_BOARD_GROUP_LABEL,
  countRoomBoardGroups,
  getRoomBoardGroup,
  getRoomBoardState,
} from './roomBoardState'

const today = dayjs().format('YYYY-MM-DD')
const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD')
const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD')

// Dòng phòng giả lập — mặc định: phòng sạch, không booking, không block.
function makeRoom(overrides: Partial<DashboardRoom>): DashboardRoom {
  return {
    room_id: '101',
    room_name: '101',
    room_type: 'double',
    capacity: 2,
    housekeeping_status: 'clean',
    housekeeping_note: null,
    booking_id: null,
    check_in: null,
    check_out: null,
    status: null,
    guest_name: null,
    guests_count: null,
    customer_phone: null,
    source: null,
    paid: null,
    net_revenue: null,
    price_per_night: null,
    grand_total: null,
    balance_due: null,
    group_id: null,
    group_grand_total: null,
    group_balance_due: null,
    group_active_booking_count: null,
    is_last_active_booking: false,
    is_blocked: false,
    block_reason: null,
    ...overrides,
  }
}

const fixtures: DashboardRoom[] = [
  // Phòng sạch có booking booked đến hôm nay
  makeRoom({ room_id: '101', booking_id: 'b1', status: 'booked', check_in: today, check_out: tomorrow }),
  // Phòng sạch không booking
  makeRoom({ room_id: '102' }),
  // Phòng dirty
  makeRoom({ room_id: '103', housekeeping_status: 'dirty' }),
  // Phòng cleaning
  makeRoom({ room_id: '104', housekeeping_status: 'cleaning' }),
  // Phòng out_of_order
  makeRoom({ room_id: '105', housekeeping_status: 'out_of_order' }),
  // Phòng đang ở
  makeRoom({ room_id: '106', booking_id: 'b2', status: 'checked-in', check_in: yesterday, check_out: tomorrow }),
  // Phòng trả hôm nay
  makeRoom({ room_id: '107', booking_id: 'b3', status: 'checked-in', check_in: yesterday, check_out: today }),
  // Phòng bị block (room_blocks / OTA)
  makeRoom({ room_id: '108', is_blocked: true, block_reason: 'maintenance' }),
]

describe('getRoomBoardGroup', () => {
  it('map mỗi phòng vào đúng một nhóm', () => {
    const groups = Object.fromEntries(fixtures.map((room) => [room.room_id, getRoomBoardGroup(room)]))
    expect(groups).toEqual({
      '101': 'awaiting_arrival',
      '102': 'no_booking',
      '103': 'needs_cleaning',
      '104': 'needs_cleaning',
      '105': 'unavailable',
      '106': 'occupied',
      '107': 'checkout_today',
      '108': 'unavailable',
    })
  })

  it('phòng dirty có booking booked vẫn tính "Cần dọn", không tính "Chờ nhận"', () => {
    const room = makeRoom({ booking_id: 'b9', status: 'booked', check_in: today, check_out: tomorrow, housekeeping_status: 'dirty' })
    expect(getRoomBoardGroup(room)).toBe('needs_cleaning')
  })

  it('không đổi state dùng cho nút hành động', () => {
    expect(fixtures.map(getRoomBoardState)).toEqual([
      'vacant',
      'vacant',
      'cleaning',
      'cleaning',
      'out_of_order',
      'occupied',
      'checkout_today',
      'blocked',
    ])
  })
})

describe('countRoomBoardGroups', () => {
  it('đếm đúng từng nhóm và tổng = tổng số phòng', () => {
    const counts = countRoomBoardGroups(fixtures)
    expect(counts).toEqual({
      awaiting_arrival: 1,
      no_booking: 1,
      occupied: 1,
      checkout_today: 1,
      needs_cleaning: 2,
      unavailable: 2,
    })
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
    expect(total).toBe(fixtures.length)
  })

  it('dòng trùng phòng (checked-in + booked) chỉ đếm một lần, ưu tiên checked-in', () => {
    const rows = [
      makeRoom({ room_id: '201', booking_id: 'b10', status: 'booked', check_in: today, check_out: tomorrow }),
      makeRoom({ room_id: '201', booking_id: 'b11', status: 'checked-in', check_in: yesterday, check_out: today }),
      makeRoom({ room_id: '202' }),
    ]
    const counts = countRoomBoardGroups(rows)
    expect(counts.checkout_today).toBe(1)
    expect(counts.awaiting_arrival).toBe(0)
    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(2)
  })

  it('không còn nhãn "Trống" hay "Còn bán"', () => {
    for (const label of Object.values(ROOM_BOARD_GROUP_LABEL)) {
      expect(label).not.toMatch(/Trống|Còn bán/i)
    }
  })
})
