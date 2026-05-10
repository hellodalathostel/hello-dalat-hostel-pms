import { useState } from 'react'
import dayjs from 'dayjs'
import {
  Alert,
  Button,
  Card,
  Divider,
  Drawer,
  Empty,
  Grid,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography,
} from 'antd'
import { LoginOutlined, LogoutOutlined } from '@ant-design/icons'
import { useBookingDetail, type BookingRow } from '@/hooks/useBookingDetail'
import { CheckInModal } from '@/components/checkin/CheckInModal'
import { CheckOutModal } from '@/components/checkout/CheckOutModal'
import { PaymentModal } from './PaymentModal'
type BookingDetailDrawerProps = {
  groupId: string | null
  open: boolean
  onClose: () => void
  onEditBooking: (booking: BookingRow) => void
}

const statusMeta: Record<BookingRow['status'], { label: string; color: string }> = {
  booked: { label: 'Booked', color: 'blue' },
  'checked-in': { label: 'Checked-in', color: 'green' },
  'checked-out': { label: 'Checked-out', color: 'default' },
  cancelled: { label: 'Cancelled', color: 'red' },
}

const paymentMethodLabel: Record<'cash' | 'transfer' | 'card' | 'other', string> = {
  cash: 'Tien mat',
  transfer: 'Chuyen khoan',
  card: 'The tin dung',
  other: 'Khac',
}

function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)} d`
}

function formatDate(date: string): string {
  return dayjs(date).format('DD/MM/YYYY')
}

function getNights(checkIn: string, checkOut: string, nights: number | null): number {
  if (typeof nights === 'number') {
    return nights
  }

  return dayjs(checkOut).diff(dayjs(checkIn), 'day')
}

export function BookingDetailDrawer(props: BookingDetailDrawerProps) {
  const { groupId, open, onClose, onEditBooking } = props
  const screens = Grid.useBreakpoint()
  const { data, isLoading, isError, error } = useBookingDetail(groupId)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [checkinBookingId, setCheckinBookingId] = useState<string | null>(null)
  const [checkoutBookingId, setCheckoutBookingId] = useState<string | null>(null)
  const group = data

  const balanceColor = (group?.balance_due ?? 0) > 0 ? '#ff4d4f' : '#52c41a'

  return (
    <Drawer
      title='Chi tiet booking'
      open={open}
      onClose={onClose}
      width={screens.md ? 560 : '100%'}
      destroyOnClose
      footer={
        <Button
          type='primary'
          onClick={() => setPaymentOpen(true)}
          disabled={!group?.bookings.length}
        >
          Ghi thanh toan
        </Button>
      }
    >
      <Spin spinning={isLoading}>
        <Space direction='vertical' size='middle' style={{ width: '100%' }}>
          {isError && (
            <Alert
              type='error'
              message='Khong the tai thong tin booking'
              description={error instanceof Error ? error.message : 'Da co loi xay ra'}
              showIcon
            />
          )}

          {!isError && group && (
            <>
              <section>
                <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>
                  {group.customer_name}
                </Typography.Title>
                <Space size={8} wrap style={{ marginBottom: 8 }}>
                  {group.source ? <Tag>{group.source}</Tag> : null}
                  {group.ota_booking_number ? <Tag color='gold'>{group.ota_booking_number}</Tag> : null}
                </Space>
                <Typography.Text>
                  SDT: {group.customer_phone?.trim() ? group.customer_phone : 'Khong co'}
                </Typography.Text>
                {group.customer_note?.trim() ? (
                  <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                    Ghi chu: {group.customer_note}
                  </Typography.Paragraph>
                ) : null}
              </section>

              <Divider style={{ margin: '4px 0' }} />

              <section>
                <Typography.Title level={5} style={{ marginTop: 0 }}>
                  Tong tien
                </Typography.Title>
                <Space direction='vertical' size={4} style={{ width: '100%' }}>
                  <Typography.Text>
                    Grand total: <strong>{formatVnd(group.grand_total)}</strong>
                  </Typography.Text>
                  <Typography.Text>
                    Da thanh toan: <strong>{formatVnd(group.paid)}</strong>
                  </Typography.Text>
                  <Typography.Text style={{ color: balanceColor }}>
                    Con lai: <strong>{formatVnd(group.balance_due)}</strong>
                  </Typography.Text>
                </Space>
              </section>

              <Divider style={{ margin: '4px 0' }} />

              <section>
                <Typography.Title level={5} style={{ marginTop: 0 }}>
                  Danh sach phong
                </Typography.Title>
                <Space direction='vertical' size='middle' style={{ width: '100%' }}>
                  {group.bookings.map((booking) => {
                    const status = statusMeta[booking.status]
                    const nights = getNights(booking.check_in, booking.check_out, booking.nights)

                    return (
                      <Card key={booking.id} size='small'>
                        <Space
                          align='start'
                          style={{ width: '100%', justifyContent: 'space-between' }}
                          wrap
                        >
                          <Typography.Text strong>Phong {booking.room_id}</Typography.Text>
                          <Tag color={status.color}>{status.label}</Tag>
                        </Space>

                        <Typography.Paragraph style={{ marginBottom: 8, marginTop: 8 }}>
                          {formatDate(booking.check_in)} -&gt; {formatDate(booking.check_out)} ({nights} dem)
                        </Typography.Paragraph>

                        <Typography.Paragraph style={{ marginBottom: 8 }}>
                          Gia: {formatVnd(booking.price)} / dem | Tong:{' '}
                          {booking.grand_total === null ? 'chua tinh' : formatVnd(booking.grand_total)}
                        </Typography.Paragraph>

                        {booking.note?.trim() ? (
                          <Typography.Paragraph style={{ marginBottom: 8 }}>
                            Note: {booking.note}
                          </Typography.Paragraph>
                        ) : null}

                        {booking.status === 'booked' ? (
                          <Space size={8}>
                            <Button
                              type='primary'
                              icon={<LoginOutlined />}
                              onClick={() => setCheckinBookingId(booking.id)}
                            >
                              Check-in
                            </Button>
                            <Button onClick={() => onEditBooking(booking)}>Sua</Button>
                          </Space>
                        ) : null}

                        {booking.status === 'checked-in' ? (
                          <Button
                            danger
                            icon={<LogoutOutlined />}
                            onClick={() => setCheckoutBookingId(booking.id)}
                          >
                            Check-out
                          </Button>
                        ) : null}
                      </Card>
                    )
                  })}
                </Space>
              </section>

              <Divider style={{ margin: '4px 0' }} />

              <section>
                <Typography.Title level={5} style={{ marginTop: 0 }}>
                  Lich su thanh toan
                </Typography.Title>
                {group.payments.length === 0 ? (
                  <Empty description='Chua co thanh toan' image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <Timeline
                    items={group.payments.map((payment) => ({
                      children: (
                        <Typography.Text>
                          {formatDate(payment.date)} |{' '}
                          {payment.method ? paymentMethodLabel[payment.method] : 'Khong ro'} |{' '}
                          {formatVnd(payment.amount)}
                        </Typography.Text>
                      ),
                    }))}
                  />
                )}
              </section>
            </>
          )}
        </Space>
      </Spin>

      <PaymentModal
        groupId={paymentOpen ? groupId : null}
        firstBookingId={group?.bookings[0]?.id ?? null}
        balanceDue={group?.balance_due ?? 0}
        onClose={() => setPaymentOpen(false)}
        onSuccess={() => setPaymentOpen(false)}
      />

      {checkinBookingId ? (
        <CheckInModal
          isOpen={Boolean(checkinBookingId)}
          onClose={() => setCheckinBookingId(null)}
          bookingId={checkinBookingId}
        />
      ) : null}

      {checkoutBookingId ? (
        <CheckOutModal
          isOpen={Boolean(checkoutBookingId)}
          onClose={() => setCheckoutBookingId(null)}
          bookingId={checkoutBookingId}
        />
      ) : null}
    </Drawer>
  )
}
