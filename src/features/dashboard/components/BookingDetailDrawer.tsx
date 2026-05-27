import {
  Alert,
  Badge,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
  type TableColumnsType,
} from 'antd'
import {
  CalendarOutlined,
  DollarOutlined,
  IdcardOutlined,
  PhoneOutlined,
  UserOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useBookingDetail, type BookingGuest } from '../hooks/useBookingDetail'

const { Text, Title } = Typography

interface Props {
  bookingId: string | null
  open: boolean
  onClose: () => void
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

function StatusTag({ status }: { status: string }): React.JSX.Element {
  const map: Record<string, { color: string; label: string }> = {
    booked: { color: 'blue', label: 'Da dat' },
    'checked-in': { color: 'green', label: 'Dang o' },
    'checked-out': { color: 'default', label: 'Da tra' },
    cancelled: { color: 'red', label: 'Da huy' },
  }

  const cfg = map[status] ?? { color: 'default', label: status }
  return <Tag color={cfg.color}>{cfg.label}</Tag>
}

function SourceTag({ source }: { source: string | null }): React.JSX.Element {
  const label = source ?? 'Other'
  return <Tag color={label === 'Booking.com' ? 'orange' : 'cyan'}>{label}</Tag>
}

export function BookingDetailDrawer({ bookingId, open, onClose }: Props): React.JSX.Element {
  const { data, isLoading, error } = useBookingDetail(open ? bookingId : null)
  const balanceDue = data?.balance_due ?? 0

  const guestColumns: TableColumnsType<BookingGuest> = [
    {
      title: 'Ho ten',
      dataIndex: ['customer', 'full_name'],
      render: (name: BookingGuest['customer']['full_name'], row) => (
        <Space>
          {row.is_primary ? <Badge color="blue" title="Khach chinh" /> : null}
          <Text>{name ?? '-'}</Text>
        </Space>
      ),
    },
    {
      title: 'Giay to',
      render: (_, row) => {
        const customer = row.customer
        if (!customer.document_type || !customer.document_number) {
          return <Text type="secondary">-</Text>
        }

        return (
          <Space size={4}>
            <IdcardOutlined />
            <Text>
              {customer.document_type}: {customer.document_number}
            </Text>
          </Space>
        )
      },
    },
    {
      title: 'SDT',
      dataIndex: ['customer', 'phone'],
      render: (phone: BookingGuest['customer']['phone']) =>
        phone ? (
          <Space size={4}>
            <PhoneOutlined />
            <Text>{phone}</Text>
          </Space>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
  ]

  return (
    <Drawer
      title={
        <Space>
          <CalendarOutlined />
          <span>Chi tiet dat phong</span>
          {data ? <StatusTag status={data.status} /> : null}
        </Space>
      }
      open={open}
      onClose={onClose}
      width={560}
      destroyOnClose
    >
      {isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}

      {!isLoading && error ? (
        <Empty description={<Text type="danger">Khong tai duoc du lieu</Text>} />
      ) : null}

      {!isLoading && data ? (
        <>
          {balanceDue > 0 ? (
            <Alert
              type="warning"
              message={`Con no: ${formatVND(balanceDue)}`}
              style={{ marginBottom: 16 }}
              showIcon
            />
          ) : null}

          {data.ota_booking_number ? (
            <Alert
              type="info"
              message={
                <Text>
                  OTA Booking: <Text strong>{data.ota_booking_number}</Text>
                </Text>
              }
              style={{ marginBottom: 16 }}
            />
          ) : null}

          <Title level={5} style={{ marginBottom: 12 }}>
            <CalendarOutlined /> Dat phong
          </Title>
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="Phong">{data.room_id}</Descriptions.Item>
            <Descriptions.Item label="Nguon">
              <SourceTag source={data.group.source} />
            </Descriptions.Item>
            <Descriptions.Item label="Nhan phong">
              {dayjs(data.check_in).format('DD/MM/YYYY')}
              {data.has_early_check_in ? <Tag color="blue" style={{ marginLeft: 4 }}>Early</Tag> : null}
            </Descriptions.Item>
            <Descriptions.Item label="Tra phong">
              {dayjs(data.check_out).format('DD/MM/YYYY')}
              {data.has_late_check_out ? <Tag color="blue" style={{ marginLeft: 4 }}>Late</Tag> : null}
            </Descriptions.Item>
            <Descriptions.Item label="So dem">{data.nights}</Descriptions.Item>
            <Descriptions.Item label="So khach">{data.guests_count}</Descriptions.Item>
            {data.actual_check_in ? (
              <Descriptions.Item label="Check-in thuc te" span={2}>
                {dayjs(data.actual_check_in).format('DD/MM/YYYY HH:mm')}
              </Descriptions.Item>
            ) : null}
            {data.actual_check_out ? (
              <Descriptions.Item label="Check-out thuc te" span={2}>
                {dayjs(data.actual_check_out).format('DD/MM/YYYY HH:mm')}
              </Descriptions.Item>
            ) : null}
            {data.note ? (
              <Descriptions.Item label="Ghi chu" span={2}>
                {data.note}
              </Descriptions.Item>
            ) : null}
          </Descriptions>

          <Divider />

          <Title level={5} style={{ marginBottom: 12 }}>
            <UserOutlined /> Nguoi dat
          </Title>
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="Ho ten">{data.group.customer_name ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="SDT">
              {data.group.customer_phone ? (
                <Space size={4}>
                  <PhoneOutlined />
                  {data.group.customer_phone}
                </Space>
              ) : (
                '-'
              )}
            </Descriptions.Item>
          </Descriptions>

          {data.guests.length > 0 ? (
            <>
              <Divider />
              <Title level={5} style={{ marginBottom: 12 }}>
                <UserOutlined /> Danh sach khach ({data.guests.length})
              </Title>
              <Table<BookingGuest>
                dataSource={data.guests}
                columns={guestColumns}
                rowKey="id"
                size="small"
                pagination={false}
              />
            </>
          ) : null}

          <Divider />

          <Title level={5} style={{ marginBottom: 12 }}>
            <DollarOutlined /> Folio
          </Title>
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="Gia/dem">{formatVND(data.price_per_night)}</Descriptions.Item>
            <Descriptions.Item label="Subtotal">{formatVND(data.room_subtotal)}</Descriptions.Item>
            {data.surcharge > 0 ? (
              <Descriptions.Item label="Surcharge (card)">{formatVND(data.surcharge)}</Descriptions.Item>
            ) : null}
            {data.tax_amount > 0 ? (
              <Descriptions.Item label="Thue">{formatVND(data.tax_amount)}</Descriptions.Item>
            ) : null}

            {data.services.map((service) => (
              <Descriptions.Item key={service.id} label={`${service.name} x${service.qty}`}>
                {formatVND(service.price * service.qty)}
              </Descriptions.Item>
            ))}

            {data.discounts.map((discount) => (
              <Descriptions.Item
                key={discount.id}
                label={`Giam: ${discount.description || '-'}`}
              >
                <Text type="success">-{formatVND(discount.amount)}</Text>
              </Descriptions.Item>
            ))}

            <Descriptions.Item label={<Text strong>Tong</Text>}>
              <Text strong>{formatVND(data.grand_total)}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Da thanh toan">
              <Text type="success">{formatVND(data.group.paid)}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Con lai" span={2}>
              <Text type={balanceDue > 0 ? 'danger' : 'success'} strong>
                {formatVND(balanceDue)}
              </Text>
            </Descriptions.Item>
          </Descriptions>
        </>
      ) : null}
    </Drawer>
  )
}