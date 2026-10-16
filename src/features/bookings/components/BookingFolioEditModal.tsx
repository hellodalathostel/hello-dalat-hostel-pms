// FILE: src/features/bookings/components/BookingFolioEditModal.tsx
// Modal chỉnh sửa folio: Thanh toán | Dịch vụ | Giảm giá
// Mở từ BookingDetailDrawer hoặc bất kỳ nơi nào có bookingId + groupId
import {
  Modal, Tabs, Form, InputNumber, Select, Input, Button,
  Table, Popconfirm, Tag, Divider, Space, Typography, Spin,
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useBookingFolio } from '@/features/bookings/hooks/useBookingFolio'
import { useDepositActions } from '@/features/bookings/hooks/useDepositActions'
import { useServiceActions } from '@/features/bookings/hooks/useServiceActions'
import { useDiscountActions } from '@/features/bookings/hooks/useDiscountActions'
import { useVoidPayment } from '@/features/bookings/hooks/useVoidPayment'
import { formatMoney, formatDate, formatPaymentMethod, PAYMENT_METHOD_LABEL } from '@/shared/utils/format'

const { Text } = Typography

const METHOD_OPTIONS = (['cash', 'transfer', 'card', 'momo', 'zalopay', 'other'] as const).map((value) => ({
  value,
  label: PAYMENT_METHOD_LABEL[value],
}))

// Key dùng chung với AddServiceModal để share TanStack Query cache
const SERVICE_CATALOG_KEY = ['service-catalog']

interface ServiceCatalogItem {
  id: string
  name: string
  price: number
}

// Hiển thị tiền dạng 300.000đ — hàm format chung (U-09)
const fmt = (n?: number | null) => formatMoney(n)

// U-04: kiểm tra số tiền ghi thu — KHÔNG tự ép giá trị, chỉ trả lỗi để hiện cạnh ô
function getPaymentAmountError(amount: number | null | undefined, remaining: number): string | null {
  if (amount == null) return null
  if (!(amount > 0)) return 'Số tiền phải lớn hơn 0'
  if (amount > remaining) return `Vượt số còn nợ ${formatMoney(Math.max(0, remaining))}`
  return null
}

interface Props {
  open: boolean
  onClose: () => void
  bookingId: string
  groupId: string
}

type FolioPaymentRow = {
  id: string
  amount: number
  method: string
  date: string
  note: string | null
  isVoid: boolean
  voidedPaymentId: string | null
  updatedAt: string
}

export default function BookingFolioEditModal({ open, onClose, bookingId, groupId }: Props) {
  const { data: folio, isLoading } = useBookingFolio(bookingId)
  const { addDeposit } = useDepositActions()
  const { addService, deleteService } = useServiceActions()
  const { addDiscount, deleteDiscount } = useDiscountActions()
  const voidPaymentMutation = useVoidPayment()

  const [depositForm] = Form.useForm()
  const [serviceForm] = Form.useForm()
  const [discountForm] = Form.useForm()
  const [pendingVoidPaymentId, setPendingVoidPaymentId] = useState<string | null>(null)

  // U-04: theo dõi giá trị nhập để hiện lỗi ngay + khoá nút lưu khi chưa hợp lệ
  const watchedAmount = Form.useWatch<number | null | undefined>('amount', depositForm)
  const watchedMethod = Form.useWatch<string | undefined>('method', depositForm)
  // Số còn nợ lấy từ groups.grand_total - groups.paid (folio.remaining) — không tự cộng từ bookings
  const remaining = folio?.remaining ?? 0
  const amountError = getPaymentAmountError(watchedAmount, remaining)
  const canSubmitPayment = watchedAmount != null && !amountError && Boolean(watchedMethod)

  // B-06: đang chọn dịch vụ từ catalog thì khoá ô tên (tên lấy theo catalog)
  const watchedServiceId = Form.useWatch<string | undefined>('serviceId', serviceForm)

  // Fetch catalog động từ DB — share cache với AddServiceModal
  const { data: serviceCatalog = [], isLoading: catalogLoading } = useQuery<ServiceCatalogItem[]>({
    queryKey: SERVICE_CATALOG_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('id, name, price')
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000, // 5 phút — catalog ít thay đổi
  })

  // Reset cả 3 form khi modal đóng
  useEffect(() => {
    if (!open) {
      depositForm.resetFields()
      serviceForm.resetFields()
      discountForm.resetFields()
    }
  }, [open, depositForm, serviceForm, discountForm])

  const handleVoidPayment = async (paymentId: string) => {
    setPendingVoidPaymentId(paymentId)
    try {
      await voidPaymentMutation.mutateAsync({ paymentId })
    } finally {
      setPendingVoidPaymentId(null)
    }
  }

  // Khi chọn service từ catalog → tự điền name + price
  const handleServiceSelect = (serviceId: string) => {
    const svc = serviceCatalog.find((s) => s.id === serviceId)
    if (svc) serviceForm.setFieldsValue({ name: svc.name, price: svc.price })
  }

  // Submit thanh toán — try/catch để không nuốt lỗi validate
  const handleDepositSubmit = async () => {
    try {
      const values = await depositForm.validateFields()
      await addDeposit.mutateAsync({
        groupId,
        amount: values.amount,
        method: values.method,
        note: values.note,
        firstBookingId: bookingId,
      })
      depositForm.resetFields()
    } catch {
      // validateFields throw khi form invalid — lỗi mutation đã được hook xử lý
    }
  }

  // Submit dịch vụ
  const handleServiceSubmit = async () => {
    try {
      const values = await serviceForm.validateFields()
      await addService.mutateAsync({
        bookingId,
        serviceId: values.serviceId ?? undefined,
        name: values.name,
        price: values.price,
        qty: values.qty ?? 1,
      })
      serviceForm.resetFields()
    } catch {
      // validateFields throw khi form invalid — lỗi mutation đã được hook xử lý
    }
  }

  // Submit giảm giá
  const handleDiscountSubmit = async () => {
    try {
      const values = await discountForm.validateFields()
      await addDiscount.mutateAsync({
        bookingId,
        amount: values.amount,
        description: values.description,
      })
      discountForm.resetFields()
    } catch {
      // validateFields throw khi form invalid — lỗi mutation đã được hook xử lý
    }
  }

  // ── Tab Thanh toán ───────────────────────────────────────
  const DepositTab = (
    <div>
      <Form form={depositForm} layout="inline" style={{ marginBottom: 16 }}>
        {/* U-04: bỏ min (InputNumber tự ép giá trị khi blur) — hiện lỗi cạnh ô thay vào đó */}
        <Form.Item
          name="amount"
          rules={[{ required: true, message: 'Nhập số tiền' }]}
          validateStatus={amountError ? 'error' : undefined}
          help={amountError ?? undefined}
        >
          <InputNumber<number>
            placeholder="Số tiền"
            step={50000}
            formatter={(v): string => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={v => Number(v!.replace(/,/g, ''))}
            style={{ width: 150 }}
            addonAfter="₫"
          />
        </Form.Item>
        <Form.Item name="method" rules={[{ required: true, message: 'Chọn phương thức' }]}>
          <Select placeholder="Phương thức" options={METHOD_OPTIONS} style={{ width: 150 }} />
        </Form.Item>
        <Form.Item name="note">
          <Input placeholder="Ghi chú (tuỳ chọn)" style={{ width: 180 }} />
        </Form.Item>
        <Form.Item>
          <Space size={8}>
            <Button
              disabled={remaining <= 0}
              onClick={() => depositForm.setFieldsValue({ amount: remaining })}
            >
              Thu đủ số còn lại
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              loading={addDeposit.isPending}
              disabled={!canSubmitPayment}
              onClick={handleDepositSubmit}
            >
              Ghi thanh toán
            </Button>
          </Space>
        </Form.Item>
      </Form>

      <Table<FolioPaymentRow>
        dataSource={folio?.payments ?? []}
        rowKey="id"
        size="small"
        pagination={false}
        columns={[
          { title: 'Ngày', dataIndex: 'date', width: 100,
            render: (d: string) => formatDate(d) },
          {
            title: 'Số tiền',
            dataIndex: 'amount',
            width: 140,
            align: 'right',
            render: (amount: number, row) => {
              const isReverseEntry = row.isVoid && Boolean(row.voidedPaymentId)
              const isVoidedOrigin = row.isVoid && !row.voidedPaymentId

              if (isVoidedOrigin) {
                return <Text style={{ color: '#cf1322', textDecoration: 'line-through' }}>{fmt(amount)}</Text>
              }
              if (isReverseEntry) {
                return <Text type="secondary">{fmt(amount)}</Text>
              }
              return fmt(amount)
            },
          },
          { title: 'Phương thức', dataIndex: 'method', width: 120,
            render: (m: string) => formatPaymentMethod(m) },
          {
            title: 'Ghi chú',
            dataIndex: 'note',
            ellipsis: true,
            render: (note: string | null, row) => {
              const isReverseEntry = row.isVoid && Boolean(row.voidedPaymentId)
              if (isReverseEntry) return <Tag color="default">Dòng đảo (void)</Tag>
              return note || <Text type="secondary">—</Text>
            },
          },
          {
            title: '',
            width: 210,
            align: 'right',
            render: (_: unknown, row) => {
              const isReverseEntry = row.isVoid && Boolean(row.voidedPaymentId)
              const isVoidedOrigin = row.isVoid && !row.voidedPaymentId
              const isRowPending = pendingVoidPaymentId === row.id

              if (isReverseEntry) return <Tag color="default">Dòng đảo (void)</Tag>

              if (isVoidedOrigin) {
                return (
                  <Space size={8}>
                    <Tag color="red">Đã void</Tag>
                    <Button size="small" type="text" danger disabled>Void</Button>
                  </Space>
                )
              }

              return (
                <Popconfirm
                  title={`Void thanh toán ${formatMoney(row.amount)} — không thể hoàn tác`}
                  onConfirm={() => handleVoidPayment(row.id)}
                  okText="Xác nhận Void"
                  cancelText="Huỷ"
                  okButtonProps={{ danger: true, loading: isRowPending }}
                >
                  <Button size="small" danger type="text" loading={isRowPending}>Void</Button>
                </Popconfirm>
              )
            },
          },
        ]}
        summary={() => {
          const total = (folio?.payments ?? []).reduce((s, p) => s + p.amount, 0)
          return (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={2} align="right">
                <Text strong>Tổng đã thu: {fmt(total)}</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} colSpan={3} />
            </Table.Summary.Row>
          )
        }}
      />
    </div>
  )

  // ── Tab Dịch vụ ──────────────────────────────────────────
  const ServiceTab = (
    <div>
      <Form form={serviceForm} layout="inline" style={{ marginBottom: 16 }}>
        {/* Dropdown catalog động từ DB */}
        <Form.Item name="serviceId">
          <Select
            placeholder="Chọn dịch vụ..."
            allowClear
            loading={catalogLoading}
            style={{ width: 220 }}
            onChange={handleServiceSelect}
            onClear={() => serviceForm.setFieldsValue({ name: undefined, price: undefined })}
            options={serviceCatalog.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Form.Item>
        {/* B-06: chọn từ catalog → khoá ô tên (hiện tên catalog). Muốn tên riêng: bỏ chọn catalog
            → chế độ dịch vụ tuỳ chỉnh, tên gửi qua p_custom_name. */}
        <Form.Item
          name="name"
          rules={[{ required: true, message: 'Nhập tên' }]}
          tooltip={watchedServiceId ? 'Tên theo danh mục. Muốn tên riêng: bỏ chọn danh mục (dịch vụ tuỳ chỉnh).' : undefined}
        >
          <Input
            placeholder="Tên dịch vụ tuỳ chỉnh"
            style={{ width: 180 }}
            disabled={Boolean(watchedServiceId)}
          />
        </Form.Item>
        <Form.Item name="price" rules={[{ required: true, message: 'Nhập giá' }]}>
          <InputNumber<number>
            placeholder="Đơn giá"
            min={0}
            step={10000}
            formatter={(v): string => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={v => Number(v!.replace(/,/g, ''))}
            style={{ width: 130 }}
            addonAfter="₫"
          />
        </Form.Item>
        <Form.Item name="qty" initialValue={1}>
          <InputNumber placeholder="SL" min={0.5} step={0.5} style={{ width: 70 }} addonBefore="×" />
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={addService.isPending}
            onClick={handleServiceSubmit}
          >
            Thêm
          </Button>
        </Form.Item>
      </Form>

      <Table<{ id: string; price: number; qty: number; name: string }>
        dataSource={folio?.services ?? []}
        rowKey="id"
        size="small"
        pagination={false}
        columns={[
          { title: 'Dịch vụ', dataIndex: 'name' },
          { title: 'Đơn giá', dataIndex: 'price', width: 120, align: 'right', render: fmt },
          { title: 'SL', dataIndex: 'qty', width: 60, align: 'center' },
          { title: 'Thành tiền', width: 130, align: 'right',
            render: (_: unknown, row: { price: number; qty: number }) => (
              <Text strong>{fmt(row.price * row.qty)}</Text>
            )},
          {
            title: '', width: 50, align: 'center',
            render: (_: unknown, row: { id: string; price: number; qty: number }) => (
              <Popconfirm
                title="Xóa dịch vụ này?"
                onConfirm={() => deleteService.mutate(row.id)}
                okText="Xóa" cancelText="Huỷ" okType="danger"
              >
                <Button type="text" danger icon={<DeleteOutlined />} size="small" />
              </Popconfirm>
            ),
          },
        ]}
        summary={() => {
          const total = (folio?.services ?? []).reduce((s, sv) => s + sv.price * sv.qty, 0)
          return (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={3} align="right">
                <Text strong>Tổng dịch vụ: {fmt(total)}</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} colSpan={2} />
            </Table.Summary.Row>
          )
        }}
      />
    </div>
  )

  // ── Tab Giảm giá ─────────────────────────────────────────
  const DiscountTab = (
    <div>
      <Form form={discountForm} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="amount" rules={[{ required: true, message: 'Nhập số tiền' }]}>
          <InputNumber<number>
            placeholder="Số tiền giảm"
            min={1000}
            step={10000}
            formatter={(v): string => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={v => Number(v!.replace(/,/g, ''))}
            style={{ width: 150 }}
            addonAfter="₫"
          />
        </Form.Item>
        <Form.Item name="description">
          <Input placeholder="Lý do giảm giá (tuỳ chọn)" style={{ width: 250 }} />
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={addDiscount.isPending}
            onClick={handleDiscountSubmit}
          >
            Thêm giảm giá
          </Button>
        </Form.Item>
      </Form>

      <Table
        dataSource={folio?.discounts ?? []}
        rowKey="id"
        size="small"
        pagination={false}
        columns={[
          { title: 'Lý do', dataIndex: 'description',
            render: (d: string) => d || <Text type="secondary">—</Text> },
          { title: 'Số tiền giảm', dataIndex: 'amount', width: 130, align: 'right',
            render: (a: number) => <Tag color="red">−{fmt(a)}</Tag> },
          {
            title: '', width: 50, align: 'center',
            render: (_: unknown, row: { id: string }) => (
              <Popconfirm
                title="Xóa giảm giá này?"
                onConfirm={() => deleteDiscount.mutate(row.id)}
                okText="Xóa" cancelText="Huỷ" okType="danger"
              >
                <Button type="text" danger icon={<DeleteOutlined />} size="small" />
              </Popconfirm>
            ),
          },
        ]}
        summary={() => {
          const total = (folio?.discounts ?? []).reduce((s, d) => s + d.amount, 0)
          return (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} align="right">
                <Text strong type="danger">Tổng giảm: −{fmt(total)}</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} colSpan={2} />
            </Table.Summary.Row>
          )
        }}
      />
    </div>
  )

  // ── Grand total summary ───────────────────────────────────
  const GrandTotalBar = folio ? (
    <div style={{ background: 'var(--surface-sunken)', padding: '8px 12px', borderRadius: 6,
      display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <Space split={<Divider type="vertical" />}>
        <Text>Tiền phòng: <Text strong>{fmt(folio.booking.roomSubtotal)}</Text></Text>
        <Text>Dịch vụ: <Text strong>
          +{fmt((folio.services ?? []).reduce((s, sv) => s + sv.price * Number(sv.qty), 0))}
        </Text></Text>
        <Text type="danger">Giảm: <Text strong type="danger">
          −{fmt((folio.discounts ?? []).reduce((s, d) => s + d.amount, 0))}
        </Text></Text>
      </Space>
      <Space split={<Divider type="vertical" />}>
        <Text>
          Tổng cộng phòng:{' '}
          <Text strong style={{ fontSize: 16 }}>{fmt(folio.booking.grandTotal)}</Text>
        </Text>
        <Text>
          Tổng nhóm:{' '}
          <Text strong>{fmt(folio.group.grandTotal)}</Text>
        </Text>
        <Text>
          Đã thanh toán:{' '}
          <Text strong style={{ color: '#52c41a' }}>
            {fmt(folio.group.paid)}
          </Text>
        </Text>
        <Text>
          Còn lại:{' '}
          <Text
            strong
            style={{ color: folio.remaining <= 0 ? '#52c41a' : '#ff4d4f' }}
          >
            {/* Còn lại theo nhóm: groups.grand_total - groups.paid (DB), không trộn số booking */}
            {fmt(Math.max(0, folio.remaining))}
          </Text>
        </Text>
      </Space>
    </div>
  ) : null

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Chỉnh sửa Folio"
      width={780}
      footer={null}
      destroyOnClose
    >
      {isLoading ? (
        <Spin style={{ display: 'block', margin: '32px auto' }} />
      ) : (
        <>
          {GrandTotalBar}
          <Divider style={{ margin: '12px 0' }} />
          <Tabs
            items={[
              { key: 'deposit',  label: '💰 Thanh toán', children: DepositTab  },
              { key: 'services', label: '🛎 Dịch vụ',  children: ServiceTab  },
              { key: 'discount', label: '🏷 Giảm giá', children: DiscountTab },
            ]}
          />
        </>
      )}
    </Modal>
  )
}
