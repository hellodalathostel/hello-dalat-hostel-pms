import { useState } from 'react'
import { Button, Input, Space, Table, Tag, Typography } from 'antd'
import { SearchOutlined, UserOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { GuestDetailDrawer } from '@/features/guests/components/GuestDetailDrawer'
import { useGuests, type GuestSummary } from '@/features/guests/hooks/useGuests'

const { Title } = Typography

export default function GuestsPage() {
  const [search, setSearch] = useState('')
  const [selectedGuest, setSelectedGuest] = useState<GuestSummary | null>(null)
  const { data: guests, isLoading } = useGuests(search)

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
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Title level={4} style={{ margin: 0 }}>
          Khách ({guests?.length ?? 0})
        </Title>
        <Input
          placeholder="Tìm theo tên, CCCD, SĐT..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          allowClear
          style={{ width: 320 }}
        />
      </Space>

      <Table
        columns={columns}
        dataSource={guests ?? []}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={{ pageSize: 20, showSizeChanger: false }}
      />

      <GuestDetailDrawer
        guest={selectedGuest}
        open={Boolean(selectedGuest)}
        onClose={() => setSelectedGuest(null)}
      />
    </div>
  )
}