import { LockOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Tag, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CalendarEvent, RoomRow } from '@/types/calendar'

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

// Timeline hiển thị theo ma trận phòng-ngày và gộp các ô booking liên tiếp bằng colSpan.
export function CalendarTimeline({ dates, rooms, onBookingClick }: CalendarTimelineProps): JSX.Element {
  const navigate = useNavigate()

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
      <div className="calendar-table-wrapper">
        <table className="calendar-table">
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
                  <div className="calendar-room-name">{room.room_name}</div>
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
                              {day.variant === 'checked-in' ? 'Đang ở' : 'Sắp đến'}
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