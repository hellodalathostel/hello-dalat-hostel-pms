import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { normalizeError } from '@/shared/utils/normalizeError'
import type { CalendarEvent, RoomBlock, RoomRow } from '@/types/calendar'
import type { HousekeepingStatus } from '@/types/database'

// Thứ tự mặc định chỉ dùng khi chưa có dữ liệu phòng từ DB
const DEFAULT_ROOM_ORDER = ['101', '102', '103', '201', '202', '203', '301', '302']

interface BaseRoom {
  id: string
  name: string
  housekeeping_status?: HousekeepingStatus
  housekeeping_note?: string | null
}

interface UseRoomCalendarParams {
  startDate?: string
  endDate?: string
  rooms?: BaseRoom[]
}

interface RoomCalendarData {
  dates: string[]
  rooms: RoomRow[]
}

interface RoomCalendarRawRecord {
  room_id: number | string
  room_name?: string | null
  date?: string | null
  check_in?: string | null
  check_out?: string | null
  start_date?: string | null
  end_date?: string | null
  booking_id?: string | null
  code?: string | null
  block_id?: string | null
  entry_type?: 'booking' | 'block' | null
  group_id?: string | null
  booking_status?: 'booked' | 'checked-in' | 'checked-out' | 'cancelled' | null
  is_blocked?: boolean | null
  guest_name?: string | null
  customer_phone?: string | null
  checkin_at?: string | null
  checkout_at?: string | null
  grand_total?: number | null
  block_reason?: string | null
}

function buildDateRange(startDate: string, endDate: string): string[] {
  const start = dayjs(startDate)
  const end = dayjs(endDate)
  const totalDays = end.diff(start, 'day')

  return Array.from({ length: totalDays + 1 }, (_, index) => start.add(index, 'day').format('YYYY-MM-DD'))
}

function buildShortGuestName(guestName: string | null): string {
  if (!guestName) {
    return 'Đang giữ phòng'
  }

  const words = guestName.trim().split(/\s+/)

  if (words.length <= 2) {
    return guestName
  }

  return `${words[0]} ${words[words.length - 1]}`
}

function buildMergeKey(event: CalendarEvent | null): string | null {
  if (!event || event.is_blocked || event.status === null) {
    return null
  }

  return `${event.booking_id ?? event.guest_name ?? event.checkin_at ?? event.date}:${event.status}`
}

// Gộp các ngày liên tiếp cùng booking/block thành 1 RoomBlock — thay thế
// vòng lặp colSpan cũ. Mỗi block lưu rawStart/rawEnd (index ngày trong viewport)
// để CalendarTimeline render bằng computeCalendarBlockLayout.
function buildRoomBlocks(dates: string[], roomEvents: Map<string, CalendarEvent>): RoomBlock[] {
  const blocks: RoomBlock[] = []
  let dateIndex = 0

  while (dateIndex < dates.length) {
    const currentDate = dates[dateIndex]
    const currentEvent = roomEvents.get(currentDate) ?? null
    const currentVariant = currentEvent?.is_blocked ? 'blocked' : currentEvent?.status

    // Vacant — không tạo block, để CalendarTimeline render ô nền trống
    if (!currentVariant) {
      dateIndex += 1
      continue
    }

    if (currentVariant === 'blocked') {
      blocks.push({
        event: currentEvent!,
        variant: 'blocked',
        rawStart: dateIndex,
        rawEnd: dateIndex + 1,
        shortLabel: 'Blocked',
      })
      dateIndex += 1
      continue
    }

    const mergeKey = buildMergeKey(currentEvent)
    let span = 1
    while (dateIndex + span < dates.length) {
      const nextEvent = roomEvents.get(dates[dateIndex + span]) ?? null
      const nextVariant = nextEvent?.is_blocked ? 'blocked' : nextEvent?.status
      if (nextVariant !== currentVariant || buildMergeKey(nextEvent) !== mergeKey) {
        break
      }
      span += 1
    }

    blocks.push({
      event: currentEvent!,
      variant: currentVariant,
      rawStart: dateIndex,
      rawEnd: dateIndex + span,
      shortLabel: buildShortGuestName(currentEvent?.guest_name ?? null),
    })
    dateIndex += span
  }

  return blocks
}

function transformCalendarRows(
  records: CalendarEvent[],
  startDate: string,
  endDate: string,
  baseRooms?: BaseRoom[],
): RoomCalendarData {
  const dates = buildDateRange(startDate, endDate)

  // Bước 1: rooms table là source of truth — xác định danh sách và thứ tự phòng từ DB.
  // Khi baseRooms chưa load (loading), fallback về DEFAULT_ROOM_ORDER + tên từ calendar data.
  const roomNameFromCalendar = new Map<string, string>()
  for (const record of records) {
    if (record.room_id && record.room_name && !roomNameFromCalendar.has(record.room_id)) {
      roomNameFromCalendar.set(record.room_id, record.room_name)
    }
  }

  const orderedRooms: {
    id: string
    name: string
    housekeeping_status: HousekeepingStatus
    housekeeping_note: string | null
  }[] =
    baseRooms && baseRooms.length > 0
      ? baseRooms.map((r) => ({
          id: r.id,
          name: r.name,
          housekeeping_status: r.housekeeping_status ?? 'clean',
          housekeeping_note: r.housekeeping_note ?? null,
        }))
      : DEFAULT_ROOM_ORDER.map((id) => ({
          id,
          name: roomNameFromCalendar.get(id) ?? `Phòng ${id}`,
          housekeeping_status: 'clean' as HousekeepingStatus,
          housekeeping_note: null,
        }))

  // Bước 2: group calendar events theo room_id → merge vào từng hàng phòng
  const eventsByRoom = new Map<string, Map<string, CalendarEvent>>()
  for (const record of records) {
    if (!record.room_id) continue
    const dateMap = eventsByRoom.get(record.room_id) ?? new Map<string, CalendarEvent>()
    dateMap.set(record.date, record)
    eventsByRoom.set(record.room_id, dateMap)
  }

  // Bước 3: render blocks cho mỗi phòng — phòng không có event vẫn xuất hiện (toàn vacant)
  const rooms: RoomRow[] = orderedRooms.map(({ id: roomId, name: roomName, housekeeping_status, housekeeping_note }) => {
    const roomEvents = eventsByRoom.get(roomId) ?? new Map<string, CalendarEvent>()
    return {
      room_id: roomId,
      room_name: roomName,
      housekeeping_status,
      housekeeping_note,
      blocks: buildRoomBlocks(dates, roomEvents),
    }
  })

  return { dates, rooms }
}

function toRoomId(roomId: number | string): string {
  if (typeof roomId === 'string') {
    return roomId
  }

  return String(roomId)
}

function expandRangeRecordToDailyEvents(
  record: RoomCalendarRawRecord,
  startDate: string,
  endDate: string,
): CalendarEvent[] {
  const roomId = toRoomId(record.room_id)
  const roomName = record.room_name ?? null
  const baseStart = dayjs(record.check_in ?? record.start_date ?? record.checkin_at ?? record.date)
  const baseEnd = dayjs(record.check_out ?? record.end_date ?? record.checkout_at ?? record.date)

  if (!baseStart.isValid() || !baseEnd.isValid()) {
    return []
  }

  // Booking hach toan theo dem: ngay check_out la exclusive, khong to mau tren lich.
  const effectiveBaseEnd =
    record.entry_type === 'booking' || Boolean(record.booking_id)
      ? baseEnd.startOf('day').subtract(1, 'day')
      : baseEnd.startOf('day')

  const queryStart = dayjs(startDate).startOf('day')
  const queryEnd = dayjs(endDate).startOf('day')
  const clippedStart = baseStart.startOf('day').isAfter(queryStart, 'day')
    ? baseStart.startOf('day')
    : queryStart
  const clippedEnd = effectiveBaseEnd.isBefore(queryEnd, 'day')
    ? effectiveBaseEnd
    : queryEnd

  if (clippedEnd.isBefore(clippedStart, 'day')) {
    return []
  }

  const days = clippedEnd.diff(clippedStart, 'day')

  return Array.from({ length: days + 1 }, (_, index) => {
    const currentDate = clippedStart.add(index, 'day').format('YYYY-MM-DD')

    return {
      room_id: roomId,
      room_name: roomName,
      date: currentDate,
      booking_id: record.booking_id ?? null,
      code: record.code ?? null,
      block_id: record.block_id ?? null,
      entry_type: record.entry_type ?? (record.is_blocked ? 'block' : record.booking_id ? 'booking' : null),
      group_id: record.group_id ?? null,
      status: record.booking_status ?? null,
      is_blocked: record.is_blocked ?? false,
      guest_name: record.guest_name ?? null,
      guest_phone: record.customer_phone ?? null,
      check_in: record.check_in ?? record.start_date ?? null,
      check_out: record.check_out ?? record.end_date ?? null,
      checkin_at: record.checkin_at ?? record.check_in ?? record.start_date ?? null,
      checkout_at: record.checkout_at ?? record.check_out ?? record.end_date ?? null,
      grand_total: record.grand_total ?? null,
      block_reason: record.block_reason ?? null,
    }
  })
}

function normalizeCalendarRecords(
  records: RoomCalendarRawRecord[],
  startDate: string,
  endDate: string,
): CalendarEvent[] {
  const normalized: CalendarEvent[] = []

  for (const record of records) {
    if (record.date) {
      normalized.push({
        room_id: toRoomId(record.room_id),
        room_name: record.room_name ?? null,
        date: record.date,
        booking_id: record.booking_id ?? null,
        code: record.code ?? null,
        block_id: record.block_id ?? null,
        entry_type: record.entry_type ?? (record.is_blocked ? 'block' : record.booking_id ? 'booking' : null),
        group_id: record.group_id ?? null,
        status: record.booking_status ?? null,
        is_blocked: record.is_blocked ?? false,
        guest_name: record.guest_name ?? null,
        guest_phone: record.customer_phone ?? null,
        check_in: record.check_in ?? record.start_date ?? null,
        check_out: record.check_out ?? record.end_date ?? null,
        checkin_at: record.checkin_at ?? record.check_in ?? null,
        checkout_at: record.checkout_at ?? record.check_out ?? null,
        grand_total: record.grand_total ?? null,
        block_reason: record.block_reason ?? null,
      })
      continue
    }

    normalized.push(...expandRangeRecordToDailyEvents(record, startDate, endDate))
  }

  return normalized
}

function isMissingDateColumnsError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase()
  return (
    lower.includes('check_in') ||
    lower.includes('check_out') ||
    lower.includes('column') ||
    lower.includes('does not exist')
  )
}

async function fetchRoomCalendar(startDate: string, endDate: string, baseRooms?: BaseRoom[]): Promise<RoomCalendarData> {
  try {
    const overlapQuery = await supabase
      .from('room_calendar')
      .select('*')
      .lte('check_in', endDate)
      .gt('check_out', startDate)
      .order('room_id')
      .order('check_in')

    let records = overlapQuery.data as RoomCalendarRawRecord[] | null
    let queryError = overlapQuery.error

    // Fallback cho view kiểu cũ có cột date (mỗi ngày một dòng).
    if (queryError && isMissingDateColumnsError(queryError.message)) {
      const dailyQuery = await supabase
        .from('room_calendar')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('room_id')
        .order('date')

      records = dailyQuery.data as RoomCalendarRawRecord[] | null
      queryError = dailyQuery.error
    }

    if (queryError) {
      throw queryError
    }

    const normalizedRecords = normalizeCalendarRecords(records ?? [], startDate, endDate)

    return transformCalendarRows(normalizedRecords, startDate, endDate, baseRooms)
  } catch (error) {
    throw normalizeError(error)
  }
}

// Hook lấy lịch phòng theo khoảng ngày, đồng thời chuẩn hóa dữ liệu theo từng hàng phòng.
export function useRoomCalendar(params: UseRoomCalendarParams = {}) {
  const startDate = params.startDate ?? dayjs().format('YYYY-MM-DD')
  const endDate = params.endDate ?? dayjs().add(14, 'day').format('YYYY-MM-DD')
  const rooms = params.rooms

  return useQuery({
    queryKey: ['room-calendar', startDate, endDate],
    queryFn: () => fetchRoomCalendar(startDate, endDate, rooms),
  })
}