import { useEffect, useMemo, useState } from 'react'
import dayjs, { Dayjs } from 'dayjs'
import { LockOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, DatePicker, Flex, Modal, Spin, Typography } from 'antd'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarTimeline } from '@/components/calendar/CalendarTimeline'
import BookingDetailDrawer from '@/components/booking/BookingDetailDrawer'
import { EditBookingModal } from '@/components/EditBookingModal'
import { BlockRoomModal } from '@/components/booking/BlockRoomModal'
import { useRoomCalendar } from '@/hooks/useRoomCalendar'
import { useRooms } from '@/hooks/useRooms'
import { useDeleteBlock } from '@/hooks/useRoomBlocks'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import type { CalendarEvent } from '@/types/calendar'
import type { BookingRow } from '@/hooks/useBookingDetail'

type DateRangeValue = [Dayjs, Dayjs]

const defaultRange: DateRangeValue = [dayjs().startOf('day'), dayjs().add(14, 'day').startOf('day')]

function formatDate(date: string | null): string {
  if (!date) {
    return '--/--/----'
  }

  return dayjs(date).format('DD/MM/YYYY')
}

// Trang lịch phòng hợp nhất cho phép xem nhanh tình trạng từng phòng theo khoảng ngày.
export default function RoomCalendar(): React.JSX.Element {
  const [manager, contextHolder] = Modal.useModal()
  const queryClient = useQueryClient()
  const { notification } = useAppFeedback()
  const deleteBlockMutation = useDeleteBlock()
  const [range, setRange] = useState<DateRangeValue>(defaultRange)
  const [detailGroupId, setDetailGroupId] = useState<string | null>(null)
  const [editingBooking, setEditingBooking] = useState<BookingRow | null>(null)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockPrefill, setBlockPrefill] = useState<{ roomId?: string; date?: string }>({})

  const { data: rooms = [], isLoading: roomsLoading } = useRooms()

  const startDate = useMemo(() => range[0].format('YYYY-MM-DD'), [range])
  const endDate = useMemo(() => range[1].format('YYYY-MM-DD'), [range])

  const { data, isLoading, isFetching, error } = useRoomCalendar({ startDate, endDate, rooms })

  const handleBookingClick = (event: CalendarEvent) => {
    if (event.entry_type === 'block' && event.block_id) {
      manager.confirm({
        title: `Mi block phong ${event.room_id}?`,
        content: `${formatDate(event.check_in)} -> ${formatDate(event.check_out)}`,
        okText: 'Mi block',
        okType: 'danger' as const,
        cancelText: 'Huy',
        onOk: () => deleteBlockMutation.mutate(event.block_id!),  // block_id luôn có khi entry_type === 'block'
      })
      return
    }

    if (event.entry_type === 'booking' && event.group_id) {
      setDetailGroupId(event.group_id)
      return
    }

    setBlockPrefill({ roomId: event.room_id, date: event.date })
    setBlockModalOpen(true)
  }

  const handleRangeChange = (values: null | [Dayjs | null, Dayjs | null]) => {
    if (!values || !values[0] || !values[1]) {
      setRange(defaultRange)
      return
    }

    setRange([values[0].startOf('day'), values[1].startOf('day')])
  }

  const handleRefresh = async () => {
    try {
      await queryClient.invalidateQueries({ queryKey: ['room-calendar'] })
    } catch (refreshError) {
      notification.error({
        message: 'Không thể làm mới lịch phòng',
        description:
          refreshError instanceof Error ? refreshError.message : 'Đã có lỗi không xác định xảy ra',
      })
    }
  }

  useEffect(() => {
    if (!error) {
      return
    }

    notification.error({
      message: 'Không thể tải lịch phòng',
      description: error.message,
    })
  }, [error, notification])

  return (
    <div className="page-grid">
      {contextHolder}

      <Flex justify="space-between" align="center" gap={12} wrap>
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>
            Lịch phòng hợp nhất
          </Typography.Title>
          <Typography.Paragraph className="page-subtitle">
            Theo dõi booking, check-in và block theo từng ngày trên một ma trận duy nhất.
          </Typography.Paragraph>
        </div>

        <Flex gap={12} wrap>
          <Button
            icon={<LockOutlined />}
            onClick={() => {
              setBlockPrefill({})
              setBlockModalOpen(true)
            }}
          >
            Block phong
          </Button>
          <DatePicker.RangePicker
            value={range}
            format="DD/MM/YYYY"
            allowClear
            onChange={handleRangeChange}
          />
          <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={isFetching}>
            Làm mới
          </Button>
        </Flex>
      </Flex>

      <Spin spinning={isLoading || isFetching || roomsLoading}>
        <CalendarTimeline
          dates={data?.dates ?? []}
          rooms={data?.rooms ?? []}
          onBookingClick={handleBookingClick}
        />
      </Spin>

      <BookingDetailDrawer
        groupId={detailGroupId}
        open={!!detailGroupId}
        onClose={() => setDetailGroupId(null)}
        onEditBooking={(booking) => setEditingBooking(booking)}
      />
      <EditBookingModal
        booking={editingBooking}
        onClose={() => setEditingBooking(null)}
        onSuccess={() => {
          setEditingBooking(null)
          // BookingDetailDrawer tu refresh vi useBookingDetail invalidated
        }}
      />
      <BlockRoomModal
        open={blockModalOpen}
        onClose={() => setBlockModalOpen(false)}
        onSuccess={() => setBlockModalOpen(false)}
        initialRoomId={blockPrefill.roomId}
        initialDate={blockPrefill.date}
      />
    </div>
  )
}