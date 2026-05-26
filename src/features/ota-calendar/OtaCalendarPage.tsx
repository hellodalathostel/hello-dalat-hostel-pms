// src/features/ota-calendar/OtaCalendarPage.tsx
// Tab OTA Calendar — hiển thị events import từ Booking.com, badge conflict, Sync Now

import { useState } from 'react'
import {
  Badge, Button, Card, Empty, Select, Space, Table, Tag, Tooltip, Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SyncOutlined, WarningOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useOtaEvents, useRoomsWithFeed, useDismissOtaEvent } from './hooks/useOtaCalendar'
import { useOtaImport } from './hooks/useOtaImport'
import type { OtaCalendarEvent } from './types'

// Enable relativeTime for dayjs
dayjs.extend(relativeTime)

const { Title, Text } = Typography

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  conflict: { color: 'red',    icon: <WarningOutlined />,      label: 'Conflict'  },
  pending:  { color: 'orange', icon: <ClockCircleOutlined />,  label: 'Pending'   },
  synced:   { color: 'green',  icon: <CheckCircleOutlined />,  label: 'Synced'    },
  dismissed:{ color: 'default',icon: null,                     label: 'Dismissed' },
} as const

// ─── Component ───────────────────────────────────────────────────────────────

export default function OtaCalendarPage() {
  const [statusFilter, setStatusFilter] = useState<OtaCalendarEvent['status'] | 'all'>('all')
  const [roomFilter, setRoomFilter] = useState<string | 'all'>('all')

  const { data: rooms = [], isLoading: roomsLoading } = useRoomsWithFeed()
  const { data: events = [], isLoading: eventsLoading } = useOtaEvents({
    status: statusFilter === 'all' ? undefined : statusFilter,
    room_id: roomFilter === 'all' ? undefined : roomFilter,
  })

  const { mutate: syncNow, isPending: syncing } = useOtaImport()
  const { mutate: dismiss, isPending: dismissing } = useDismissOtaEvent()

  // Badge count: chỉ đếm conflict + pending
  const conflictCount = events.filter(e => e.status === 'conflict').length
  const pendingCount  = events.filter(e => e.status === 'pending').length
  const alertCount    = conflictCount + pendingCount

  // Phòng có feed
  const roomsWithFeed = rooms.filter(r => r.ota_feed_url)
  const lastSynced = roomsWithFeed
    .map(r => r.ota_last_synced_at)
    .filter(Boolean)
    .sort()
    .at(-1)

  const columns: ColumnsType<OtaCalendarEvent> = [
    {
      title: 'Phòng',
      dataIndex: 'room_id',
      width: 80,
      render: (roomId: string) =>
        rooms.find(r => r.id === roomId)?.name ?? roomId,
    },
    {
      title: 'Check-in',
      dataIndex: 'check_in',
      width: 110,
      render: (d: string) => dayjs(d).format('DD/MM/YYYY'),
      sorter: (a, b) => a.check_in.localeCompare(b.check_in),
      defaultSortOrder: 'ascend',
    },
    {
      title: 'Check-out',
      dataIndex: 'check_out',
      width: 110,
      render: (d: string) => dayjs(d).format('DD/MM/YYYY'),
    },
    {
      title: 'Nguồn',
      dataIndex: 'ota_source',
      width: 120,
      render: (src: string) => <Tag>{src}</Tag>,
    },
    {
      title: 'Booking #',
      dataIndex: 'ota_booking_num',
      width: 150,
      render: (num: string | null) => num ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Summary',
      dataIndex: 'summary',
      ellipsis: true,
      render: (s: string | null) => s ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 120,
      render: (status: OtaCalendarEvent['status']) => {
        const cfg = STATUS_CONFIG[status]
        return (
          <Tag color={cfg.color} icon={cfg.icon}>
            {cfg.label}
          </Tag>
        )
      },
    },
    {
      title: 'Sync lúc',
      dataIndex: 'last_synced_at',
      width: 140,
      render: (t: string) => (
        <Tooltip title={dayjs(t).format('DD/MM/YYYY HH:mm:ss')}>
          <Text type="secondary">{dayjs(t).fromNow()}</Text>
        </Tooltip>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: OtaCalendarEvent) =>
        record.status !== 'dismissed' && record.status !== 'synced' ? (
          <Button
            size="small"
            onClick={() => dismiss(record.id)}
            loading={dismissing}
          >
            Dismiss
          </Button>
        ) : null,
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <Space align="center" style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Space align="center">
          <Title level={4} style={{ margin: 0 }}>OTA Calendar</Title>
          {alertCount > 0 && (
            <Badge
              count={alertCount}
              color={conflictCount > 0 ? 'red' : 'orange'}
              title={`${conflictCount} conflict, ${pendingCount} pending`}
            />
          )}
        </Space>
        <Space>
          {lastSynced && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Sync lần cuối: {dayjs(lastSynced).format('HH:mm DD/MM')}
            </Text>
          )}
          <Button
            icon={<SyncOutlined spin={syncing} />}
            loading={syncing}
            onClick={() => syncNow()}
            type={alertCount > 0 ? 'primary' : 'default'}
          >
            Sync Now
          </Button>
        </Space>
      </Space>

      {/* Cảnh báo nếu chưa có phòng nào connect OTA */}
      {!roomsLoading && roomsWithFeed.length === 0 && (
        <Card style={{ marginBottom: 16, background: '#fffbe6', border: '1px solid #ffe58f' }}>
          <Text>
            ⚠️ Chưa có phòng nào được kết nối OTA feed.
            Điền <Text code>ota_feed_url</Text> cho phòng trong Settings để bắt đầu sync.
          </Text>
        </Card>
      )}

      {/* Filters */}
      <Space style={{ marginBottom: 16 }}>
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 140 }}
          options={[
            { value: 'all',       label: 'Tất cả status' },
            { value: 'conflict',  label: '⚠️ Conflict'   },
            { value: 'pending',   label: '🕐 Pending'    },
            { value: 'synced',    label: '✅ Synced'     },
            { value: 'dismissed', label: 'Dismissed'     },
          ]}
        />
        <Select
          value={roomFilter}
          onChange={setRoomFilter}
          style={{ width: 140 }}
          loading={roomsLoading}
          options={[
            { value: 'all', label: 'Tất cả phòng' },
            ...rooms.map(r => ({ value: r.id, label: r.name })),
          ]}
        />
      </Space>

      {/* Table */}
      <Table<OtaCalendarEvent>
        columns={columns}
        dataSource={events}
        rowKey="id"
        loading={eventsLoading}
        size="small"
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        locale={{
          emptyText: (
            <Empty
              description={
                roomsWithFeed.length === 0
                  ? 'Chưa có OTA feed nào được cấu hình'
                  : 'Không có events — bấm Sync Now để fetch'
              }
            />
          ),
        }}
        rowClassName={(record) =>
          record.status === 'conflict' ? 'ota-row-conflict' : ''
        }
      />
    </div>
  )
}
