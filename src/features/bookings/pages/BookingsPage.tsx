import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import dayjs from 'dayjs'
import {
  Badge,
  Button,
  Flex,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useBookingsList } from '@/features/bookings/hooks/useBookingsList'
import type { BookingsListItem } from '@/features/bookings/hooks/useBookingsList'
import BookingDetailDrawer from '@/features/bookings/components/BookingDetailDrawer'
import { formatMoney } from '@/shared/utils/format'
import { getQueryViewState } from '@/lib/queryViewState'
import { QueryErrorState } from '@/components/QueryErrorState'

const STATUS_COLOR: Record<string, string> = {
  booked: 'blue',
  'checked-in': 'green',
  'checked-out': 'default',
  cancelled: 'red',
}

const STATUS_LABEL: Record<string, string> = {
  booked: 'Đã đặt',
  'checked-in': 'Đang ở',
  'checked-out': 'Đã trả',
  cancelled: 'Đã huỷ',
}

function getGroupStatus(statuses: string[]): string {
  if (statuses.includes('checked-in')) return 'checked-in'
  if (statuses.includes('booked')) return 'booked'
  if (statuses.includes('checked-out')) return 'checked-out'
  return 'cancelled'
}

// Hiển thị tiền dạng 300.000đ — dùng hàm format chung (U-09)
function formatVND(amount: number): string {
  return formatMoney(amount)
}

export function BookingsPage(): JSX.Element {
  const navigate = useNavigate()
  const bookingsQuery = useBookingsList()
  const data = useMemo(() => bookingsQuery.data ?? [], [bookingsQuery.data])
  // F04: lỗi tải KHÔNG được hiện như danh sách rỗng
  const viewState = getQueryViewState({
    isLoading: bookingsQuery.isLoading,
    isError: bookingsQuery.isError,
    data: bookingsQuery.data,
  })
  const retryBookings = () => void bookingsQuery.refetch()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const filtered = useMemo(() => {
    let result = data

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(
        (item) =>
          (item.first_booking_code ?? '').toLowerCase().includes(q) ||
          item.customer_name.toLowerCase().includes(q) ||
          (item.customer_phone ?? '').toLowerCase().includes(q) ||
          item.rooms.some((room) => room.toLowerCase().includes(q))
      )
    }

    if (statusFilter) {
      result = result.filter((item) => item.statuses.includes(statusFilter))
    }

    return result
  }, [data, search, statusFilter])

  const columns: ColumnsType<BookingsListItem> = [
    {
      title: 'Mã',
      dataIndex: 'first_booking_code',
      key: 'first_booking_code',
      width: 130,
      render: (code: string | null) =>
        code ? <Typography.Text copyable>{code}</Typography.Text> : '—',
    },
    {
      title: 'Khách hàng',
      dataIndex: 'customer_name',
      key: 'customer_name',
      render: (name: string, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{name}</Typography.Text>
          {record.customer_phone && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {record.customer_phone}
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Phòng',
      dataIndex: 'rooms',
      key: 'rooms',
      render: (rooms: string[]) => (
        <Space wrap>
          {rooms.map((room) => (
            <Tag key={room}>{room}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Check-in',
      dataIndex: 'earliest_check_in',
      key: 'check_in',
      render: (value: string) => (value ? dayjs(value).format('DD/MM/YYYY') : '—'),
      sorter: (a, b) =>
        dayjs(a.earliest_check_in).unix() - dayjs(b.earliest_check_in).unix(),
    },
    {
      title: 'Check-out',
      dataIndex: 'latest_check_out',
      key: 'check_out',
      render: (value: string) => (value ? dayjs(value).format('DD/MM/YYYY') : '—'),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_, record) => {
        const status = getGroupStatus(record.statuses)
        return <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status] ?? status}</Tag>
      },
    },
    {
      title: 'Nguồn',
      dataIndex: 'source',
      key: 'source',
      render: (value: string) => <Typography.Text type="secondary">{value}</Typography.Text>,
    },
    {
      title: 'Tổng tiền',
      dataIndex: 'grand_total',
      key: 'grand_total',
      align: 'right',
      render: (value: number) => formatVND(value),
      sorter: (a, b) => a.grand_total - b.grand_total,
    },
    {
      title: 'Còn lại',
      dataIndex: 'balance_due',
      key: 'balance_due',
      align: 'right',
      render: (value: number) => (
        <Typography.Text type={value > 0 ? 'danger' : 'success'}>{formatVND(value)}</Typography.Text>
      ),
    },
  ]

  return (
    <div className="page-grid">
      <Flex justify="space-between" align="center" gap={12} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Quản lý đặt phòng
        </Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/new-booking')}
        >
          Tạo booking mới
        </Button>
      </Flex>

      {viewState === 'error' ? (
        <QueryErrorState
          title="Không tải được danh sách đặt phòng"
          error={bookingsQuery.error}
          onRetry={retryBookings}
          isRetrying={bookingsQuery.isFetching}
        />
      ) : (
        <>
          {viewState === 'stale-error' && (
            <QueryErrorState
              variant="banner"
              title="Không tải được danh sách đặt phòng"
              onRetry={retryBookings}
              isRetrying={bookingsQuery.isFetching}
            />
          )}

          <Space wrap style={{ marginTop: 16, marginBottom: 8 }}>
            <Input
              placeholder="Tìm tên khách, SĐT, phòng..."
              prefix={<SearchOutlined />}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              allowClear
              style={{ width: 280 }}
            />
            <Select
              placeholder="Lọc trạng thái"
              allowClear
              value={statusFilter ?? undefined}
              onChange={(value) => setStatusFilter(value ?? null)}
              style={{ width: 160 }}
              options={[
                { value: 'booked', label: 'Đã đặt' },
                { value: 'checked-in', label: 'Đang ở' },
                { value: 'checked-out', label: 'Đã trả phòng' },
                { value: 'cancelled', label: 'Đã huỷ' },
              ]}
            />
            <Badge count={filtered.length} showZero color="blue" style={{ marginLeft: 8 }} />
          </Space>

          {/* 'empty' và "không có kết quả cho bộ lọc" đều dùng empty mặc định của Table */}
          <Table
            columns={columns}
            dataSource={filtered}
            rowKey="group_id"
            loading={viewState === 'loading'}
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: false }}
            onRow={(record) => ({
              onClick: () => {
                setSelectedGroupId(record.group_id)
                setDrawerOpen(true)
              },
              style: { cursor: 'pointer' },
            })}
            scroll={{ x: 930 }}
          />
        </>
      )}

      <BookingDetailDrawer
        groupId={selectedGroupId}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false)
          setSelectedGroupId(null)
        }}
      />
    </div>
  )
}
