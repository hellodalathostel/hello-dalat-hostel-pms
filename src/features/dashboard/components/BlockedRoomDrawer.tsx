// Drawer hiển thị OTA block active và hỗ trợ tạo booking nội bộ cho phòng đang blocked
import { CalendarOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Descriptions, Divider, Drawer, Form, Input, InputNumber, Space, Spin, Tag } from 'antd'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useState } from 'react'
import { supabase } from '@/api/supabase'
import type { DashboardRoom } from '@/types/dashboard'
import { useCreateBookingFromOtaBlock } from '../hooks/useCreateBookingFromOtaBlock'

interface BlockedRoomDrawerProps {
  room: DashboardRoom | null
  open: boolean
  onClose: () => void
}

interface OtaBlock {
  id: string
  ical_uid: string
  ota_source: string
  check_in: string
  check_out: string
  summary: string | null
  linked_group_id: string | null
}

interface CreateBookingFormValues {
  customer_name: string
  customer_phone?: string
  price_per_night: number
  guests_count: number
}

function formatDate(value: string | null): string {
  if (!value) {
    return '-'
  }

  return dayjs(value).format('DD/MM/YYYY')
}

function getNights(checkIn: string, checkOut: string): number {
  return dayjs(checkOut).diff(dayjs(checkIn), 'day')
}

// "deluxe_double" → "Deluxe Double"
function formatRoomType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function BlockedRoomDrawer({ room, open, onClose }: BlockedRoomDrawerProps): React.JSX.Element {
  const roomId = room?.room_id?.toString() ?? null
  const [showForm, setShowForm] = useState(false)

  const [form] = Form.useForm<CreateBookingFormValues>()
  const createBooking = useCreateBookingFromOtaBlock()

  const { data: block, isLoading } = useQuery<OtaBlock | null>({
    queryKey: ['ota-blocks', roomId, 'active'],
    queryFn: async () => {
      if (!roomId) {
        return null
      }

      const today = dayjs().format('YYYY-MM-DD')
      const { data, error } = await supabase
        .from('ota_calendar_feed')
        .select('id, ical_uid, ota_source, check_in, check_out, summary, linked_group_id')
        .eq('room_id', roomId)
        .lte('check_in', today)
        .gt('check_out', today)
        .order('check_in', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        throw error
      }

      return data as OtaBlock | null
    },
    enabled: open && Boolean(roomId),
  })

  const title = room ? `P${room.room_id} — ${formatRoomType(room.room_type)}` : 'Chi tiết phòng'
  const nights = block ? getNights(block.check_in, block.check_out) : 0

  const handleClose = () => {
    setShowForm(false)
    form.resetFields()
    onClose()
  }

  const handleOpenForm = () => {
    setShowForm(true)
    form.setFieldsValue({ guests_count: 2 })
  }

  const handleCancelForm = () => {
    setShowForm(false)
    form.resetFields()
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()

    if (!block || !roomId) {
      return
    }

    await createBooking.mutateAsync({
      ical_uid: block.ical_uid,
      room_id: roomId,
      check_in: block.check_in,
      check_out: block.check_out,
      customer_name: values.customer_name,
      customer_phone: values.customer_phone,
      price_per_night: values.price_per_night,
      guests_count: values.guests_count,
    })

    form.resetFields()
    setShowForm(false)
    onClose()
  }

  return (
    <Drawer
      title={
        <Space>
          <span>{title}</span>
          <Tag color="red">Đóng phòng</Tag>
        </Space>
      }
      open={open}
      onClose={handleClose}
      width={420}
      styles={{ body: { padding: '16px 24px' } }}
    >
      {isLoading ? (
        <Spin />
      ) : !block ? (
        <Alert message="Không tìm thấy OTA block active cho phòng này" type="warning" />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Nguồn">
              <Tag color="blue">{block.ota_source}</Tag>
            </Descriptions.Item>
            <Descriptions.Item
              label={
                <>
                  <CalendarOutlined /> Check-in
                </>
              }
            >
              {formatDate(block.check_in)}
            </Descriptions.Item>
            <Descriptions.Item
              label={
                <>
                  <CalendarOutlined /> Check-out
                </>
              }
            >
              {formatDate(block.check_out)}
            </Descriptions.Item>
            <Descriptions.Item label="Số đêm">{nights}</Descriptions.Item>
            {block.summary ? <Descriptions.Item label="Summary">{block.summary}</Descriptions.Item> : null}
            <Descriptions.Item label="Trạng thái">
              {block.linked_group_id ? (
                <Tag color="green" icon={<LinkOutlined />}>
                  Đã có booking
                </Tag>
              ) : (
                <Tag color="orange">Chưa có booking nội bộ</Tag>
              )}
            </Descriptions.Item>
          </Descriptions>

          {block.linked_group_id ? (
            <Alert style={{ marginTop: 16 }} type="success" message="Block này đã có booking nội bộ." />
          ) : null}

          {!block.linked_group_id && !showForm ? (
            <Button type="primary" icon={<PlusOutlined />} style={{ width: '100%' }} onClick={handleOpenForm}>
              Tạo booking từ block này
            </Button>
          ) : null}

          {!block.linked_group_id && showForm ? (
            <>
              <Divider>Thông tin khách</Divider>
              <Form form={form} layout="vertical">
                <Form.Item
                  label="Tên khách"
                  name="customer_name"
                  rules={[{ required: true, message: 'Nhập tên khách' }]}
                >
                  <Input placeholder="Nguyen Van A" />
                </Form.Item>

                <Form.Item label="Số điện thoại" name="customer_phone">
                  <Input placeholder="09xxxxxxxx" />
                </Form.Item>

                <Form.Item
                  label="Giá/đêm (VND)"
                  name="price_per_night"
                  rules={[
                    { required: true, message: 'Nhập giá' },
                    { type: 'number', min: 1, message: 'Giá phải lớn hơn 0' },
                  ]}
                >
                  <InputNumber<number>
                    style={{ width: '100%' }}
                    min={0}
                    step={50000}
                    formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(value) => Number((value ?? '').replace(/,/g, ''))}
                  />
                </Form.Item>

                <Form.Item label="Số khách" name="guests_count" initialValue={2}>
                  <InputNumber<number> min={1} max={10} style={{ width: '100%' }} />
                </Form.Item>

                <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                  <Button onClick={handleCancelForm}>Huỷ</Button>
                  <Button type="primary" loading={createBooking.isPending} onClick={() => void handleSubmit()}>
                    Xác nhận tạo booking
                  </Button>
                </Space>
              </Form>
            </>
          ) : null}
        </Space>
      )}
    </Drawer>
  )
}
