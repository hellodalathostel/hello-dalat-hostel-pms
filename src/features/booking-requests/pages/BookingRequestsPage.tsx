import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import {
  useBookingRequests,
  useConfirmRequest,
  useConvertRequest,
  useRejectRequest,
  type BookingRequest,
  type BookingRequestStatus,
} from '@/features/booking-requests/hooks/useBookingRequests'

const { Text } = Typography

const STATUS_COLOR: Record<BookingRequestStatus, string> = {
  pending: 'orange',
  confirmed: 'green',
  rejected: 'red',
}

const STATUS_LABEL: Record<BookingRequestStatus, string> = {
  pending: 'Chờ xử lý',
  confirmed: 'Đã xác nhận',
  rejected: 'Đã từ chối',
}

export default function BookingRequestsPage() {
  const { data: requests = [], isLoading } = useBookingRequests()
  const confirmMutation = useConfirmRequest()
  const rejectMutation = useRejectRequest()
  const convertMutation = useConvertRequest()

  const [rejectModal, setRejectModal] = useState<{ open: boolean, id: string | null }>({
    open: false,
    id: null,
  })
  const [rejectReason, setRejectReason] = useState('')

  const [convertModal, setConvertModal] = useState<{ open: boolean, request: BookingRequest | null }>({
    open: false,
    request: null,
  })
  const [pricePerNight, setPricePerNight] = useState<number | null>(null)

  const columns: ColumnsType<BookingRequest> = useMemo(() => [
    {
      title: 'Thời gian',
      dataIndex: 'created_at',
      width: 128,
      render: (value: string) => dayjs(value).format('DD/MM HH:mm'),
      sorter: (a, b) => dayjs(a.created_at).unix() - dayjs(b.created_at).unix(),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Khách',
      key: 'guest',
      render: (_, request) => (
        <Space direction="vertical" size={0}>
          <Text strong>{request.name}</Text>
          <Text type="secondary">{request.phone}</Text>
          {request.email ? <Text type="secondary">{request.email}</Text> : null}
        </Space>
      ),
    },
    {
      title: 'Phòng',
      dataIndex: 'room_id',
      width: 92,
      render: (value: string) => `P.${value}`,
    },
    {
      title: 'Ngày',
      key: 'dates',
      width: 188,
      render: (_, request) => {
        const nights = dayjs(request.check_out).diff(dayjs(request.check_in), 'day')

        return (
          <Space direction="vertical" size={0}>
            <Text>{dayjs(request.check_in).format('DD/MM/YYYY')}</Text>
            <Text>{`→ ${dayjs(request.check_out).format('DD/MM/YYYY')}`}</Text>
            <Text type="secondary">{`${nights} đêm`}</Text>
          </Space>
        )
      },
    },
    {
      title: 'Ghi chú',
      dataIndex: 'note',
      ellipsis: true,
      render: (value: string | null) => value ?? '—',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 130,
      filters: [
        { text: 'Chờ xử lý', value: 'pending' },
        { text: 'Đã xác nhận', value: 'confirmed' },
        { text: 'Đã từ chối', value: 'rejected' },
      ],
      onFilter: (value, request) => request.status === value,
      render: (value: BookingRequestStatus) => <Tag color={STATUS_COLOR[value]}>{STATUS_LABEL[value]}</Tag>,
    },
    {
      title: 'Hành động',
      key: 'actions',
      width: 216,
      render: (_, request) => {
        if (request.status === 'rejected') {
          return <Text type="secondary">Đã từ chối</Text>
        }

        if (request.converted_group_id) {
          return <Text type="success">Đã tạo booking</Text>
        }

        if (request.status !== 'pending') {
          return <Text type="secondary">Đã xử lý</Text>
        }

        return (
          <Space>
            <Button
              loading={confirmMutation.isPending && request.id === confirmMutation.variables}
              onClick={() => {
                confirmMutation.mutate(request.id)
              }}
            >
              Xác nhận
            </Button>
            <Button
              type="primary"
              loading={convertMutation.isPending && convertModal.request?.id === request.id}
              onClick={() => {
                setConvertModal({ open: true, request })
                setPricePerNight(null)
              }}
            >
              Tạo booking
            </Button>
            <Button
              danger
              loading={rejectMutation.isPending && rejectModal.id === request.id}
              onClick={() => {
                setRejectModal({ open: true, id: request.id })
                setRejectReason('')
              }}
            >
              Từ chối
            </Button>
          </Space>
        )
      },
    },
  ], [
    confirmMutation.isPending,
    confirmMutation.variables,
    convertModal.request?.id,
    convertMutation.isPending,
    rejectModal.id,
    rejectMutation.isPending,
  ])

  const handleReject = async () => {
    if (!rejectModal.id) {
      return
    }

    try {
      await rejectMutation.mutateAsync({
        id: rejectModal.id,
        reason: rejectReason.trim() || undefined,
      })
      setRejectModal({ open: false, id: null })
      setRejectReason('')
    } catch {
      // Toast da duoc xu ly trong mutation.
    }
  }

  const handleConvert = async () => {
    if (!convertModal.request || !pricePerNight || pricePerNight <= 0) {
      return
    }

    try {
      await convertMutation.mutateAsync({
        request: convertModal.request,
        pricePerNight,
      })
      setConvertModal({ open: false, request: null })
      setPricePerNight(null)
    } catch {
      // Toast da duoc xu ly trong mutation.
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        Yêu cầu đặt phòng trực tiếp
      </Typography.Title>

      <Table<BookingRequest>
        rowKey="id"
        loading={isLoading}
        dataSource={requests}
        columns={columns}
        pagination={{ pageSize: 10, showSizeChanger: false }}
      />

      <Modal
        title="Từ chối yêu cầu"
        open={rejectModal.open}
        onCancel={() => {
          setRejectModal({ open: false, id: null })
          setRejectReason('')
        }}
        onOk={handleReject}
        okText="Xác nhận từ chối"
        cancelText="Hủy"
        okButtonProps={{ danger: true, loading: rejectMutation.isPending }}
      >
        <Input.TextArea
          rows={4}
          value={rejectReason}
          onChange={(event) => setRejectReason(event.target.value)}
          placeholder="Lý do từ chối (không bắt buộc)"
        />
      </Modal>

      <Modal
        title="Chuyển thành booking"
        open={convertModal.open}
        onCancel={() => {
          setConvertModal({ open: false, request: null })
          setPricePerNight(null)
        }}
        onOk={handleConvert}
        okText="Tạo booking"
        cancelText="Hủy"
        okButtonProps={{
          loading: convertMutation.isPending,
          disabled: !pricePerNight || pricePerNight <= 0,
        }}
      >
        {convertModal.request ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Alert
              type="info"
              showIcon
              message={(
                <Text>
                  Chuyển request của <Text strong>{convertModal.request.name}</Text> thành booking thật
                  cho phòng <Text strong>{`P.${convertModal.request.room_id}`}</Text>
                </Text>
              )}
            />

            <div>
              <Text strong>Giá mỗi đêm (VND)</Text>
              <InputNumber
                min={0}
                step={100_000}
                style={{ width: '100%', marginTop: 8 }}
                value={pricePerNight}
                onChange={(value) => setPricePerNight(typeof value === 'number' ? value : null)}
                placeholder="Nhập giá mỗi đêm"
                formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => Number(value?.replace(/,/g, '') ?? 0)}
              />
            </div>
          </Space>
        ) : null}
      </Modal>
    </Space>
  )
}
