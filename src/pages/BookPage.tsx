// Trang dat phong truc tiep - public, khong can dang nhap

import { useState, type CSSProperties } from 'react'
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Divider,
  Form,
  Input,
  Select,
  Typography,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { ROOM_OPTIONS } from '@/shared/constants/rooms'

const { RangePicker } = DatePicker
const { Title, Text, Paragraph } = Typography

const EDGE_FN_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-booking-request`
  : ''

type BookFormValues = {
  name: string
  phone: string
  email?: string
  room_id: string
  dates: [Dayjs, Dayjs]
  note?: string
  website?: string
}

type VietQRInfo = {
  url: string
  bank: string
  account: string
  account_name: string
  note: string
}

type SubmitSuccessResult = {
  success: true
  request_id: string
  has_conflict: boolean
  deposit: number
  nights: number
  vietqr: VietQRInfo
}

type SubmitErrorResult = {
  error?: string
  success?: false
}

function isSubmitSuccessResult(data: unknown): data is SubmitSuccessResult {
  if (!data || typeof data !== 'object') return false

  const candidate = data as Record<string, unknown>
  const vietqr = candidate.vietqr

  return (
    candidate.success === true
    && typeof candidate.request_id === 'string'
    && typeof candidate.has_conflict === 'boolean'
    && !!vietqr
    && typeof vietqr === 'object'
    && typeof (vietqr as Record<string, unknown>).url === 'string'
    && typeof (vietqr as Record<string, unknown>).bank === 'string'
    && typeof (vietqr as Record<string, unknown>).account === 'string'
    && typeof (vietqr as Record<string, unknown>).account_name === 'string'
    && typeof (vietqr as Record<string, unknown>).note === 'string'
  )
}

export default function BookPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SubmitSuccessResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleSubmit = async (values: BookFormValues) => {
    if (!EDGE_FN_URL) {
      setErrorMsg('Thiếu cấu hình server, vui lòng thử lại sau.')
      return
    }

    setLoading(true)
    setErrorMsg(null)

    try {
      const response = await fetch(EDGE_FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          phone: values.phone.trim(),
          email: values.email?.trim() || undefined,
          room_id: values.room_id,
          check_in: values.dates[0].format('YYYY-MM-DD'),
          check_out: values.dates[1].format('YYYY-MM-DD'),
          note: values.note?.trim() || undefined,
          website: values.website || '',
        }),
      })

      const data: unknown = await response.json()

      if (!response.ok || !isSubmitSuccessResult(data)) {
        const apiError = data as SubmitErrorResult
        setErrorMsg(apiError.error ?? 'Có lỗi xảy ra, vui lòng thử lại.')
        return
      }

      setResult(data)
    } catch {
      setErrorMsg('Không thể kết nối server, vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div style={styles.pageWrapper}>
        <Card style={styles.container}>
          <div style={styles.header}>
            <Title level={2} style={{ marginBottom: 4 }}>
              Hello Dalat Hostel
            </Title>
            <Text type="secondary">33/18/2 Phan Đình Phùng, P.1, Đà Lạt</Text>
          </div>

          <Divider />

          <Title level={3} style={{ textAlign: 'center' }}>
            Yêu cầu đặt phòng đã gửi
          </Title>

          {result.has_conflict && (
            <Alert
              type="warning"
              showIcon
              message="Phòng có thể đã kín trong khoảng ngày này. Chúng tôi sẽ gọi xác nhận sớm nhất."
              style={{ marginBottom: 16 }}
            />
          )}

          <Paragraph>
            Để giữ phòng, vui lòng chuyển khoản đặt cọc và ghi đúng nội dung bên dưới. Chúng tôi
            sẽ xác nhận qua điện thoại sau khi nhận thanh toán.
          </Paragraph>

          {result.deposit > 0 && (
            <Paragraph>
              <Text strong>Số tiền cọc (1 đêm): </Text>
              <Text>{result.deposit.toLocaleString('vi-VN')}đ</Text>
            </Paragraph>
          )}

          <Card style={styles.qrCard}>
            <img src={result.vietqr.url} alt="VietQR thanh toán" style={styles.qrImage} />
            <div style={styles.bankInfo}>
              <Text strong>{result.vietqr.bank}</Text>
              <br />
              <Text>{result.vietqr.account}</Text>
              <br />
              <Text>{result.vietqr.account_name}</Text>
              <br />
              <Text strong>Nội dung CK:</Text>
              <br />
              <Text strong>{result.vietqr.note}</Text>
            </div>
          </Card>

          <Divider />

          <Paragraph style={{ marginBottom: 8 }}>
            <Text strong>Mã yêu cầu:</Text> {result.request_id}
          </Paragraph>
          <Paragraph style={{ marginBottom: 0 }}>
            Hotline: <a href="tel:0969975935">0969 975 935</a>
          </Paragraph>
        </Card>
      </div>
    )
  }

  return (
    <div style={styles.pageWrapper}>
      <Card style={styles.container}>
        <div style={styles.header}>
          <Title level={2} style={{ marginBottom: 4 }}>
            Hello Dalat Hostel
          </Title>
          <Text type="secondary">33/18/2 Phan Đình Phùng, P.1, Đà Lạt</Text>
        </div>

        <Divider />

        <Title level={3}>Đặt phòng trực tiếp</Title>

        {errorMsg && (
          <Alert
            type="error"
            showIcon
            closable
            message={errorMsg}
            onClose={() => setErrorMsg(null)}
            style={{ marginBottom: 16 }}
          />
        )}

        <Form<BookFormValues> layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item name="website" style={{ display: 'none' }}>
            <Input autoComplete="off" tabIndex={-1} aria-hidden="true" />
          </Form.Item>

          <Form.Item
            label="Họ và tên"
            name="name"
            rules={[
              { required: true, message: 'Vui lòng nhập họ và tên' },
              { max: 120, message: 'Họ và tên tối đa 120 ký tự' },
            ]}
          >
            <Input size="large" maxLength={120} placeholder="Nguyễn Văn A" />
          </Form.Item>

          <Form.Item
            label="Số điện thoại"
            name="phone"
            rules={[
              { required: true, message: 'Vui lòng nhập số điện thoại' },
              { max: 30, message: 'Số điện thoại tối đa 30 ký tự' },
            ]}
          >
            <Input size="large" maxLength={30} placeholder="0901234567" />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
            rules={[
              { type: 'email', message: 'Email không hợp lệ' },
              { max: 254, message: 'Email tối đa 254 ký tự' },
            ]}
          >
            <Input size="large" maxLength={254} placeholder="ban@example.com" />
          </Form.Item>

          <Form.Item
            label="Chọn phòng"
            name="room_id"
            rules={[{ required: true, message: 'Vui lòng chọn phòng' }]}
          >
            <Select size="large" options={ROOM_OPTIONS} placeholder="Chọn phòng mong muốn" />
          </Form.Item>

          <Form.Item
            label="Ngày lưu trú"
            name="dates"
            rules={[
              { required: true, message: 'Vui lòng chọn ngày nhận và trả phòng' },
              {
                validator: (_, value) => {
                  if (value && value[0] && value[1] && !value[1].isAfter(value[0], 'day')) {
                    return Promise.reject('Ngày trả phòng phải sau ngày nhận phòng')
                  }
                  return Promise.resolve()
                },
              },
            ]}
          >
            <RangePicker
              size="large"
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              disabledDate={(current) => Boolean(current && current.isBefore(dayjs().startOf('day')))}
              placeholder={['Nhận phòng', 'Trả phòng']}
            />
          </Form.Item>

          <Form.Item
            label="Ghi chú"
            name="note"
            rules={[{ max: 1000, message: 'Ghi chú tối đa 1000 ký tự' }]}
          >
            <Input.TextArea
              rows={4}
              maxLength={1000}
              placeholder="Ví dụ: đến muộn sau 22h, cần giường tầng thấp..."
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 16 }}>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>
              Gửi yêu cầu đặt phòng
            </Button>
          </Form.Item>
        </Form>

        <Paragraph style={{ marginBottom: 0, textAlign: 'center' }}>
          Hotline: <a href="tel:0969975935">0969 975 935</a>
          {' · '}
          <a href="mailto:hellodalathostel@gmail.com">hellodalathostel@gmail.com</a>
        </Paragraph>
      </Card>
    </div>
  )
}

const styles = {
  pageWrapper: {
    minHeight: '100vh',
    background: '#f5f5f5',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '24px 16px 48px',
  } as CSSProperties,

  container: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  } as CSSProperties,

  header: {
    textAlign: 'center',
    marginBottom: 4,
  } as CSSProperties,

  qrCard: {
    textAlign: 'center',
    background: '#fafafa',
    border: '1px solid #e8e8e8',
  } as CSSProperties,

  qrImage: {
    width: 220,
    height: 'auto',
    marginBottom: 16,
    borderRadius: 8,
  } as CSSProperties,

  bankInfo: {
    lineHeight: 1.8,
  } as CSSProperties,
}