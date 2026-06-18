import { LockOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import type { JSX, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CalendarEvent, RoomRow } from '@/types/calendar'
import { computeCalendarBlockLayout } from '@/features/calendar/utils/calendarBlockLayout'
import { HousekeepingBadge } from './HousekeepingBadge'

interface CalendarTimelineProps {
  dates: string[]
  rooms: RoomRow[]
  onBookingClick?: (event: CalendarEvent) => void
}

// Độ rộng cố định mỗi cột ngày (px) — phải khớp với CSS grid-template-columns
const DAY_COLUMN_WIDTH = 92
const ROOM_COLUMN_WIDTH = 116
const ROW_HEIGHT = 64

function formatHeaderDate(date: string): string {
  return dayjs(date).format('DD/MM')
}

function formatWeekday(date: string): string {
  return dayjs(date).format('ddd')
}

function formatEventTime(dateTime: string | null): string {
  if (!dateTime) {
    return '--:--'
  }

  return dayjs(dateTime).format('HH:mm')
}

function isToday(date: string): boolean {
  return dayjs(date).isSame(dayjs(), 'day')
}

function useDragScroll() {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const dragState = useRef({ active: false, moved: false, startX: 0, scrollLeft: 0 })
  const [isDragging, setIsDragging] = useState(false)

  const DRAG_THRESHOLD = 5

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const element = wrapperRef.current
    if (!element) {
      return
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }

    dragState.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      scrollLeft: element.scrollLeft,
    }

    element.setPointerCapture(event.pointerId)
  }, [])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active) {
      return
    }

    const element = wrapperRef.current
    if (!element) {
      return
    }

    const deltaX = event.clientX - dragState.current.startX

    if (!dragState.current.moved && Math.abs(deltaX) > DRAG_THRESHOLD) {
      dragState.current.moved = true
      setIsDragging(true)
      element.classList.add('calendar-table-wrapper--dragging')
    }

    if (dragState.current.moved) {
      element.scrollLeft = dragState.current.scrollLeft - deltaX
    }
  }, [])

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const element = wrapperRef.current
    dragState.current.active = false
    dragState.current.moved = false
    element?.classList.remove('calendar-table-wrapper--dragging')

    if (element?.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId)
    }

    requestAnimationFrame(() => setIsDragging(false))
  }, [])

  return { wrapperRef, isDragging, onPointerDown, onPointerMove, onPointerUp }
}

// Timeline hiển thị theo ma trận phòng-ngày. Mỗi phòng là 1 row CSS Grid với
// position: relative; các block booking/block render bằng absolute div,
// vị trí tính bằng computeCalendarBlockLayout (% left/width theo numDays).
// Ô vacant render bằng grid nền (z-index thấp) để vẫn bấm-để-add được.
export function CalendarTimeline({ dates, rooms, onBookingClick }: CalendarTimelineProps): JSX.Element {
  const navigate = useNavigate()
  const { wrapperRef, isDragging, onPointerDown, onPointerMove, onPointerUp } = useDragScroll()

  const numDays = dates.length
  const gridWidth = ROOM_COLUMN_WIDTH + numDays * DAY_COLUMN_WIDTH
  const gridTemplateColumns = `${ROOM_COLUMN_WIDTH}px repeat(${numDays}, ${DAY_COLUMN_WIDTH}px)`

  const buildVacantEvent = (roomId: string, date: string): CalendarEvent => ({
    room_id: roomId,
    room_name: null,
    date,
    booking_id: null,
    code: null,
    block_id: null,
    entry_type: null,
    group_id: null,
    status: null,
    is_blocked: false,
    guest_name: null,
    guest_phone: null,
    check_in: date,
    check_out: date,
    checkin_at: null,
    checkout_at: null,
    grand_total: null,
    block_reason: null,
  })

  const handleCellClick = (roomId: string, date: string) => {
    if (isDragging || !onBookingClick) {
      return
    }

    onBookingClick(buildVacantEvent(roomId, date))
  }

  return (
    <Card className="calendar-shell" styles={{ body: { padding: 0 } }}>
      <div
        ref={wrapperRef}
        className="calendar-grid-wrapper"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="calendar-grid" style={{ width: gridWidth, gridTemplateColumns }}>
          {/* Header row */}
          <div className="calendar-grid-cell calendar-room-header">Phòng</div>
          {dates.map((date) => (
            <div
              key={date}
              className={`calendar-grid-cell calendar-date-header${isToday(date) ? ' calendar-date-header--today' : ''}`}
            >
              <div>{formatHeaderDate(date)}</div>
              <Typography.Text type="secondary">{formatWeekday(date)}</Typography.Text>
            </div>
          ))}

          {/* Room rows */}
          {rooms.map((room) => (
            <div
              key={room.room_id}
              className="calendar-room-row"
              style={{ height: ROW_HEIGHT, gridColumn: `1 / ${numDays + 2}` }}
            >
              {/* Cột phòng — sticky bên trái */}
              <div className="calendar-room-cell" style={{ width: ROOM_COLUMN_WIDTH }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="calendar-room-name">{room.room_id}</span>
                  <HousekeepingBadge
                    roomId={room.room_id}
                    status={room.housekeeping_status}
                    note={room.housekeeping_note}
                  />
                </div>
              </div>

              {/* Nền vacant — luôn render đủ numDays ô để bấm-add, block sẽ phủ lên trên */}
              <div
                className="calendar-vacant-layer"
                style={{ left: ROOM_COLUMN_WIDTH, width: numDays * DAY_COLUMN_WIDTH }}
              >
                {dates.map((date) => (
                  <div
                    key={date}
                    className={`calendar-vacant-cell${isToday(date) ? ' calendar-vacant-cell--today' : ''}`}
                    style={{ width: DAY_COLUMN_WIDTH }}
                    onClick={() => handleCellClick(room.room_id, date)}
                  >
                    <Button
                      type="default"
                      size="small"
                      icon={<PlusOutlined />}
                      className="calendar-add-button"
                      onClick={(event) => {
                        event.stopPropagation()

                        if (isDragging) {
                          return
                        }

                        navigate(`/new-booking?roomId=${room.room_id}&checkIn=${date}`)
                      }}
                    >
                      Add
                    </Button>
                  </div>
                ))}
              </div>

              {/* Block layer — absolute positioned theo % */}
              <div
                className="calendar-block-layer"
                style={{ left: ROOM_COLUMN_WIDTH, width: numDays * DAY_COLUMN_WIDTH }}
              >
                {room.blocks
                  .filter((block) => block.variant !== 'cancelled')
                  .map((block) => {
                  const layout = computeCalendarBlockLayout(block.rawStart, block.rawEnd, numDays)
                  if (!layout) {
                    return null
                  }

                  const { event, variant, shortLabel } = block
                  const blockClassName = `cal-block cal-block--${variant}`

                  if (variant === 'blocked') {
                    return (
                      <div
                        key={`${room.room_id}-${block.rawStart}`}
                        className={blockClassName}
                        style={{ left: `${layout.leftPct}%`, width: `${layout.widthPct}%` }}
                        onClick={() => {
                          if (!isDragging && onBookingClick) {
                            onBookingClick(event)
                          }
                        }}
                      >
                        <Tooltip title={event.block_reason ?? 'Phòng đang bị khóa'}>
                          <div className="cal-block__content cal-block__content--blocked">
                            <LockOutlined />
                            <span>{event.block_reason ?? 'Blocked'}</span>
                          </div>
                        </Tooltip>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={`${room.room_id}-${block.rawStart}`}
                      className={blockClassName}
                      style={{ left: `${layout.leftPct}%`, width: `${layout.widthPct}%` }}
                      onClick={() => {
                        if (!isDragging && onBookingClick) {
                          onBookingClick(event)
                        }
                      }}
                    >
                      <Tooltip
                        title={
                          <div>
                            <div>{event.guest_name ?? 'Khách chưa xác định'}</div>
                            <div>Mã: {event.code ?? '—'}</div>
                            <div>SĐT: {event.guest_phone ?? 'Chưa có'}</div>
                            <div>Check-in: {formatEventTime(event.checkin_at)}</div>
                            <div>Check-out: {formatEventTime(event.checkout_at)}</div>
                          </div>
                        }
                      >
                        <div className="cal-block__content">
                          <span className="cal-block__title">{shortLabel}</span>
                          <Typography.Text className="cal-block__meta">
                            {event.guest_phone ?? 'Chưa có số điện thoại'}
                          </Typography.Text>
                        </div>
                      </Tooltip>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
