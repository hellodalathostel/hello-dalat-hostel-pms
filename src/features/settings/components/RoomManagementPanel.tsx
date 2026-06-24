import { useState } from 'react'
import { PlusOutlined, EditOutlined, EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, InputNumber, Modal, Space, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRooms, type RoomsQueryItem } from '@/features/bookings/hooks/useRooms'
import {
  useCreateRoom,
  useUpdateRoom,
  useToggleRoomActive,
  type CreateRoomInput,
} from '@/features/settings/hooks/useRoomMutations'
import { useCurrentUserRole } from '@/features/auth/hooks/useCurrentUserRole'

export function RoomManagementPanel() {
  const { data: role } = useCurrentUserRole()
  const isOwner = role === 'owner'

  const { data: rooms, isLoading } = useRooms(false)
  const createRoom = useCreateRoom()
  const updateRoom = useUpdateRoom()
  const toggleActive = useToggleRoomActive()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingRoom, setEditingRoom] = useState<RoomsQueryItem | null>(null)
  const [form] = Form.useForm<CreateRoomInput>()

  const openCreateModal = () => {
    setEditingRoom(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEditModal = (room: RoomsQueryItem) => {
    setEditingRoom(room)
    form.setFieldsValue({
      id: room.id,
      name: room.name,
      type: room.type,
      capacity: room.capacity,
      base_price: room.base_price,
      floor: room.floor,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()

    if (editingRoom) {
      const { name, type, capacity, base_price, floor } = values
      await updateRoom.mutateAsync({ id: editingRoom.id, name, type, capacity, base_price, floor })
    } else {
      await createRoom.mutateAsync(values)
    }
    setModalOpen(false)
  }

  const columns: ColumnsType<RoomsQueryItem> = [
    { title: 'Mã phòng', dataIndex: 'id', key: 'id', width: 90 },
    { title: 'Tên phòng', dataIndex: 'name', key: 'name' },
    { title: 'Loại', dataIndex: 'type', key: 'type' },
    { title: 'Tầng', dataIndex: 'floor', key: 'floor', width: 70 },
    { title: 'Số khách', dataIndex: 'capacity', key: 'capacity', width: 90 },
    {
      title: 'Giá cơ bản',
      dataIndex: 'base_price',
      key: 'base_price',
      width: 130,
      render: (price: number) => `${price.toLocaleString('vi-VN')}đ`,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 110,
      render: (active: boolean) =>
        active ? <Tag color="green">Đang dùng</Tag> : <Tag color="red">Đã ẩn</Tag>,
    },
    ...(isOwner
      ? [
          {
            title: 'Hành động',
            key: 'action',
            width: 140,
            render: (_: unknown, record: RoomsQueryItem) => (
              <Space>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEditModal(record)}
                />
                <Button
                  size="small"
                  danger={record.is_active}
                  icon={record.is_active ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  onClick={() =>
                    toggleActive.mutate({ id: record.id, is_active: !record.is_active })
                  }
                />
              </Space>
            ),
          },
        ]
      : []),
  ]

  return (
    <Card
      title="Quản lý phòng"
      extra={
        isOwner && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            Thêm phòng
          </Button>
        )
      }
    >
      <Table<RoomsQueryItem>
        dataSource={rooms ?? []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        pagination={false}
        size="small"
        scroll={{ x: true }}
      />

      <Modal
        title={editingRoom ? `Sửa phòng ${editingRoom.id}` : 'Thêm phòng mới'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={createRoom.isPending || updateRoom.isPending}
        okText="Lưu"
        cancelText="Huỷ"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="id"
            label="Mã phòng"
            rules={[{ required: true, message: 'Nhập mã phòng' }]}
          >
            <Input disabled={!!editingRoom} placeholder="Ví dụ: 401" />
          </Form.Item>
          <Form.Item
            name="name"
            label="Tên phòng"
            rules={[{ required: true, message: 'Nhập tên phòng' }]}
          >
            <Input placeholder="Ví dụ: Deluxe Double" />
          </Form.Item>
          <Form.Item
            name="type"
            label="Loại phòng"
            rules={[{ required: true, message: 'Nhập loại phòng' }]}
          >
            <Input placeholder="Ví dụ: Deluxe Double" />
          </Form.Item>
          <Form.Item
            name="capacity"
            label="Số khách tối đa"
            rules={[{ required: true, message: 'Nhập số khách' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="base_price"
            label="Giá cơ bản (VND/đêm)"
            rules={[{ required: true, message: 'Nhập giá cơ bản' }]}
          >
            <InputNumber
              min={0}
              step={10000}
              style={{ width: '100%' }}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            />
          </Form.Item>
          <Form.Item name="floor" label="Tầng">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
