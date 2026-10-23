import { useState } from 'react'
import { Button, Input, Table, Tag, Typography } from 'antd'
import { SearchOutlined, UserOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { GuestDetailDrawer } from '@/features/guests/components/GuestDetailDrawer'
import { useGuests, type GuestSummary } from '@/features/guests/hooks/useGuests'
import { getQueryViewState } from '@/lib/queryViewState'
import { QueryErrorState } from '@/components/QueryErrorState'

const { Title } = Typography

export default function GuestsPage() {
  const [search, setSearch] = useState('')
  const [selectedGuest, setSelectedGuest] = useState<GuestSummary | null>(null)
  const guestsQuery = useGuests(search)
  const guests = guestsQuery.data
  // F04: lỗi tải KHÔNG được hiện như danh sách rỗng
  const viewState = getQueryViewState({
    isLoading: guestsQuery.isLoading,
    isError: guestsQuery.isError,
    data: guests,
  })
  const retryGuests = () => void guestsQuery.refetch()

  const columns: ColumnsType<GuestSummary> = [
    {
      title: 'Họ tên',
      dataIndex: 'full_name',
      render: (name: string, record: GuestSummary) => (
        <Button
          type="link"
          style={{ padding: 0 }}
          onClick={() => setSelectedGuest(record)}
        >
          {name}
        </Button>
      ),
    },
    {
      title: 'Quốc tịch',
      dataIndex: 'nationality_display',
      width: 120,
      render: (value: string | null) => value ?? '—',
    },
    {
      title: 'Giấy tờ',
      width: 200,
      render: (_value: unknown, record: GuestSummary) => (
        record.document_number ? (
          <span>
            <Tag style={{ marginRight: 4 }}>{record.document_type ?? '?'}</Tag>
            {record.document_number}
          </span>
        ) : '—'
      ),
    },
    {
      title: 'SĐT',
      dataIndex: 'phone',
      width: 140,
      render: (value: string | null) => value ?? '—',
    },
    {
      title: 'Số lần ở',
      dataIndex: 'booking_count',
      width: 110,
      align: 'center',
      sorter: (a, b) => a.booking_count - b.booking_count,
    },
    {
      title: 'Lần cuối',
      dataIndex: 'last_stay',
      width: 120,
      render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY') : '—'),
      sorter: (a, b) => (a.last_stay ?? '').localeCompare(b.last_stay ?? ''),
    },
    {
      title: '',
      width: 72,
      render: (_value: unknown, record: GuestSummary) => (
        <Button
          size="small"
          icon={<UserOutlined />}
          onClick={() => setSelectedGuest(record)}
        />
      ),
    },
  ]

  return (
    <div style={{ padding: '16px 12px' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          justifyContent: 'space-between',
        }}
      >
        <Title level={4} style={{ margin: 0, whiteSpace: 'nowrap' }}>
          {viewState === 'error' ? 'Khách' : `Khách (${guests?.length ?? 0})`}
        </Title>
        <Input
          placeholder="Tìm theo tên, CCCD, SĐT..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          allowClear
          style={{ flex: '1 1 200px', maxWidth: 320 }}
        />
      </div>

      {viewState === 'stale-error' && (
        <QueryErrorState
          variant="banner"
          title="Không tải được danh sách khách"
          onRetry={retryGuests}
          isRetrying={guestsQuery.isFetching}
        />
      )}

      {/* Tìm kiếm không ra kết quả = 'empty' (empty mặc định của Table), khác với 'error' */}
      {viewState === 'error' ? (
        <QueryErrorState
          title="Không tải được danh sách khách"
          error={guestsQuery.error}
          onRetry={retryGuests}
          isRetrying={guestsQuery.isFetching}
        />
      ) : (
        <Table
          columns={columns}
          dataSource={guests ?? []}
          rowKey="id"
          loading={viewState === 'loading'}
          size="small"
          scroll={{ x: true }}
          pagination={{ pageSize: 20, showSizeChanger: false }}
        />
      )}

      <GuestDetailDrawer
        guest={selectedGuest}
        open={Boolean(selectedGuest)}
        onClose={() => setSelectedGuest(null)}
      />
    </div>
  )
}