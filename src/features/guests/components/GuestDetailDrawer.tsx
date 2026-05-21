import { Descriptions, Drawer, Empty, Skeleton, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useGuestBookings, type GuestBooking, type GuestSummary } from '@/features/guests/hooks/useGuests'

const STATUS_COLOR: Record<string, string> = {
  booked: 'blue',
  'checked-in': 'green',
  'checked-out': 'default',
  cancelled: 'red',
}

const STATUS_LABEL: Record<string, string> = {
  booked: 'Đã đặt',
  'checked-in': 'Đang ở',
  'checked-out': 'Đã trả phòng',
  cancelled: 'Đã huỷ',
}

interface Props {
  guest: GuestSummary | null
  open: boolean
  onClose: () => void
}

function formatVND(amount: number | null): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

export function GuestDetailDrawer({ guest, open, onClose }: Props) {
  const { data: bookings, isLoading } = useGuestBookings(guest?.id ?? null)

  const columns: ColumnsType<GuestBooking> = [
    {
      title: 'Phòng',
      dataIndex: 'room_number',
      width: 88,
    },
    {
      title: 'Check-in',
      dataIndex: 'check_in',
      render: (value: string) => dayjs(value).format('DD/MM/YYYY'),
      width: 120,
    },
    {
      title: 'Check-out',
      dataIndex: 'check_out',
      render: (value: string) => dayjs(value).format('DD/MM/YYYY'),
      width: 120,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (value: string) => (
        <Tag color={STATUS_COLOR[value] ?? 'default'}>{STATUS_LABEL[value] ?? value}</Tag>
      ),
      width: 120,
    },
    {
      title: 'Tổng tiền',
      dataIndex: 'grand_total',
      align: 'right',
      render: (value: number | null) => formatVND(value),
      width: 160,
    },
  ]

  return (
    <Drawer
      title={guest?.full_name ?? 'Chi tiết khách'}
      open={open}
      onClose={onClose}
      width={720}
      destroyOnClose
    >
      {guest && (
        <>
          <Descriptions
            column={2}
            size="small"
            bordered
            style={{ marginBottom: 24 }}
          >
            <Descriptions.Item label="Họ tên" span={2}>
              {guest.full_name}
            </Descriptions.Item>
            <Descriptions.Item label="Ngày sinh">
              {guest.date_of_birth ? dayjs(guest.date_of_birth).format('DD/MM/YYYY') : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Giới tính">
              {guest.gender ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Quốc tịch">
              {guest.nationality_display ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="SĐT">
              {guest.phone ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Loại giấy tờ">
              {guest.document_type ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Số giấy tờ">
              {guest.document_number ?? '—'}
            </Descriptions.Item>
          </Descriptions>

          <div style={{ marginBottom: 8, fontWeight: 600 }}>
            Lịch sử lưu trú ({guest.booking_count} lần)
          </div>

          {isLoading ? (
            <Skeleton active />
          ) : bookings && bookings.length > 0 ? (
            <Table
              columns={columns}
              dataSource={bookings}
              rowKey="booking_id"
              size="small"
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
            />
          ) : (
            <Empty description="Chưa có booking" />
          )}
        </>
      )}
    </Drawer>
  )
}