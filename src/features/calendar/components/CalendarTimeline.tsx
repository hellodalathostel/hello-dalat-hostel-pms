import { LockOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Tag, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import type { JSX, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBookingStatusLabel } from '@/features/bookings/utils/bookingLabel'
import type { BookingStatus } from '@/features/bookings/types'
import type { CalendarEvent, RoomRow } from '@/types/calendar'
import { HousekeepingBadge } from './HousekeepingBadge'

interface CalendarTimelineProps {
  dates: string[]
  rooms: RoomRow[]
  onBookingClick?: (event: CalendarEvent) => void
}

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

// Timeline hiển thị theo ma trận phòng-ngày và gộp các ô booking liên tiếp bằng colSpan.
export function CalendarTimeline({ dates, rooms, onBookingClick }: CalendarTimelineProps): JSX.Element {
  const navigate = useNavigate()
  const { wrapperRef, isDragging, onPointerDown, onPointerMove, onPointerUp } = useDragScroll()

  const buildVacantEvent = (roomId: string, date: string): CalendarEvent => ({
    room_id: roomId,
    room_name: null,
    date,
    booking_id: null,
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

  return (
    <Card className="calendar-shell" styles={{ body: { padding: 0 } }}>
      <div
        ref={wrapperRef}
        className="calendar-table-wrapper"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <table
          className="calendar-table"
          style={{
            tableLayout: 'fixed',
            width: `${116 + dates.length * 92}px`,
          }}
        >
          <thead>
            <tr>
              <th className="calendar-room-header">Phòng</th>
              {dates.map((date) => (
                <th key={date} className="calendar-date-header">
                  <div>{formatHeaderDate(date)}</div>
                  <Typography.Text type="secondary">{formatWeekday(date)}</Typography.Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.room_id}>
                <th className="calendar-room-cell">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="calendar-room-name">{room.room_name}</span>
                    <HousekeepingBadge
                      roomId={room.room_id}
                      status={room.housekeeping_status}
                      note={room.housekeeping_note}
                    />
                  </div>
                  <Typography.Text type="secondary">Mã {room.room_id}</Typography.Text>
                </th>
                {room.days.map((day) => {
                  if (!day.isVisible) {
                    return null
                  }

                  const event = day.event
                  const cellClassName = `calendar-slot calendar-slot--${day.variant}`

                  if (day.variant === 'vacant') {
                    return (
                      <td
                        key={`${room.room_id}-${day.date}`}
                        colSpan={1}
                        className={cellClassName}
                        style={onBookingClick ? { cursor: 'pointer' } : undefined}
                        onClick={() => {
                          if (isDragging) {
                            return
                          }

                          if (onBookingClick) {
                            onBookingClick(buildVacantEvent(room.room_id, day.date))
                          }
                        }}
                      >
                        <div className="calendar-slot__vacant">
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

                              navigate(`/new-booking?roomId=${room.room_id}&checkIn=${day.date}`)
                            }}
                          >
                            Add
                          </Button>
                        </div>
                      </td>
                    )
                  }

                  if (day.variant === 'blocked') {
                    return (
                      <td
                        key={`${room.room_id}-${day.date}`}
                        colSpan={1}
                        className={cellClassName}
                        style={onBookingClick && event ? { cursor: 'pointer' } : undefined}
                        onClick={() => {
                          if (isDragging) {
                            return
                          }

                          if (onBookingClick && event) {
                            onBookingClick(event)
                          }
                        }}
                      >
                        <Tooltip title={event?.block_reason ?? 'Phòng đang bị khóa'}>
                          <div className="calendar-slot__content calendar-slot__content--blocked">
                            <LockOutlined />
                            <span>{event?.block_reason ?? 'Blocked'}</span>
                          </div>
                        </Tooltip>
                      </td>
                    )
                  }

                  return (
                    <td
                      key={`${room.room_id}-${day.date}`}
                      colSpan={day.colSpan}
                      className={cellClassName}
                      style={onBookingClick && event ? { cursor: 'pointer' } : undefined}
                      onClick={() => {
                        if (isDragging) {
                          return
                        }

                        if (onBookingClick && event) {
                          onBookingClick(event)
                        }
                      }}
                    >
                      <Tooltip
                        title={
                          <div>
                            <div>{event?.guest_name ?? 'Khách chưa xác định'}</div>
                            <div>SĐT: {event?.guest_phone ?? 'Chưa có'}</div>
                            <div>Check-in: {formatEventTime(event?.checkin_at ?? null)}</div>
                            <div>Check-out: {formatEventTime(event?.checkout_at ?? null)}</div>
                          </div>
                        }
                      >
                        <div className="calendar-slot__content">
                          <div className="calendar-slot__title-row">
                            <span className="calendar-slot__title">{day.shortLabel}</span>
                            <Tag color={day.variant === 'checked-in' ? 'purple' : 'blue'}>
                              {getBookingStatusLabel(
                                ((event?.status ?? day.variant) as BookingStatus),
                                event?.check_in ?? day.date,
                              )}
                            </Tag>
                          </div>
                          <Typography.Text className="calendar-slot__meta">
                            {event?.guest_phone ?? 'Chưa có số điện thoại'}
                          </Typography.Text>
                        </div>
                      </Tooltip>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}