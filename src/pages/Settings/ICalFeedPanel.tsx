import { CopyOutlined, LinkOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Space, Table, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { supabase } from '@/api/supabase'

const { Text, Link } = Typography

const ICAL_BASE_URL =
  'https://rcfhhgywjdwqcgnpkbtl.supabase.co/functions/v1/ical-feed'

interface Room {
  id: string
  name: string
  type: string
}

export function ICalFeedPanel() {
  const { data: rooms, isLoading } = useQuery<Room[]>({
    queryKey: ['rooms', 'ical'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, name, type')
        .order('id')

      if (error) {
        throw error
      }

      return data ?? []
    },
  })

  const handleCopy = async (roomId: string, roomName: string) => {
    try {
      const feedUrl = `${ICAL_BASE_URL}?room_id=${roomId}`
      await navigator.clipboard.writeText(feedUrl)
      message.success(`Da copy iCal URL cho phong ${roomName}`)
    } catch (error) {
      console.error(error)
      message.error('Khong the copy iCal URL')
    }
  }

  const columns: ColumnsType<Room> = [
    {
      title: 'Phong',
      dataIndex: 'id',
      key: 'id',
      width: 100,
    },
    {
      title: 'Loai phong',
      dataIndex: 'type',
      key: 'type',
      width: 160,
    },
    {
      title: 'iCal Feed URL',
      key: 'url',
      render: (_, record) => {
        const feedUrl = `${ICAL_BASE_URL}?room_id=${record.id}`

        return (
          <Text
            code
            copyable={false}
            style={{ fontSize: 11, wordBreak: 'break-all' }}
          >
            {feedUrl}
          </Text>
        )
      },
    },
    {
      title: 'Action',
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={() => handleCopy(record.id, record.name)}
          >
            Copy URL
          </Button>
          <Link
            href={`${ICAL_BASE_URL}?room_id=${record.id}`}
            target="_blank"
            rel="noreferrer"
          >
            <LinkOutlined /> Test
          </Link>
        </Space>
      ),
    },
  ]

  return (
    <Card
      title="iCal Feed - OTA Sync"
      extra={
        <Text type="secondary" style={{ fontSize: 12 }}>
          Copy URL, dan vao Booking.com / Availability / iCal Import
        </Text>
      }
    >
      <Table<Room>
        dataSource={rooms ?? []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        pagination={false}
        size="small"
      />
    </Card>
  )
}
