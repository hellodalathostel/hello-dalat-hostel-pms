// Modal chỉnh sửa folio: Cọc | Dịch vụ | Giảm giá
// Mở từ BookingModal hoặc bất kỳ nơi nào có bookingId + groupId
import { useState } from 'react'
import {
  Modal, Tabs, Form, InputNumber, Select, Input, Button,
  Table, Popconfirm, Tag, Divider, Space, Typography, Spin,
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useBookingFolio } from '@/hooks/useBookingFolio'
import { useDepositActions } from '@/hooks/useDepositActions'
import { useServiceActions } from '@/hooks/useServiceActions'
import { useDiscountActions } from '@/hooks/useDiscountActions'

const { Text } = Typography

const METHOD_OPTIONS = [
  { value: 'cash',     label: 'Tiền mặt' },
  { value: 'transfer', label: 'Chuyển khoản' },
  { value: 'card',     label: 'Thẻ' },
  { value: 'momo',     label: 'MoMo' },
  { value: 'zalopay',  label: 'ZaloPay' },
  { value: 'other',    label: 'Khác' },
]

const SERVICE_CATALOG = [
  { id: 'svc_breakfast',  name: 'Bữa sáng',                price: 50000  },
  { id: 'svc_transfer',   name: 'Đưa đón sân bay / ga tàu', price: 150000 },
  { id: 'svc_laundry',    name: 'Giặt sấy (kg)',            price: 25000  },
  { id: 'svc_water',      name: 'Nước khoáng minibar',      price: 15000  },
  { id: 'svc_motorbike',  name: 'Thuê xe máy (ngày)',       price: 120000 },
  { id: 'svc_tour',       name: 'Tour Đà Lạt (người)',      price: 250000 },
]

const fmt = (n: number) => n.toLocaleString('vi-VN') + ' ₫'

interface Props {
  open: boolean
  onClose: () => void
  bookingId: string
  groupId: string
}

export default function BookingFolioEditModal({ open, onClose, bookingId, groupId }: Props) {
  const { data: folio, isLoading } = useBookingFolio(bookingId)
  const { addDeposit, deleteDeposit } = useDepositActions(bookingId)
  const { addService, deleteService } = useServiceActions(bookingId)
  const { addDiscount, deleteDiscount } = useDiscountActions(bookingId)

  const [depositForm] = Form.useForm()
  const [serviceForm] = Form.useForm()
  const [discountForm] = Form.useForm()

  // Khi chọn service từ catalog → tự điền price
  const handleServiceSelect = (serviceId: string) => {
    const svc = SERVICE_CATALOG.find(s => s.id === serviceId)
    if (svc) serviceForm.setFieldsValue({ name: svc.name, price: svc.price })
  }

  // Submit cọc
  const handleDepositSubmit = async () => {
    const values = await depositForm.validateFields()
    await addDeposit.mutateAsync({
      groupId,
      amount: values.amount,
      method: values.method,
      note: values.note,
      firstBookingId: bookingId,
    })
    depositForm.resetFields()
  }

  // Submit dịch vụ
  const handleServiceSubmit = async () => {
    const values = await serviceForm.validateFields()
    await addService.mutateAsync({
      bookingId,
      serviceId: values.serviceId ?? undefined,
      name: values.name,
      price: values.price,
      qty: values.qty ?? 1,
    })
    serviceForm.resetFields()
  }

  // Submit giảm giá
  const handleDiscountSubmit = async () => {
    const values = await discountForm.validateFields()
    await addDiscount.mutateAsync({
      bookingId,
      amount: values.amount,
      description: values.description,
    })
    discountForm.resetFields()
  }

  // ── Tab Cọc ──────────────────────────────────────────────
  const DepositTab = (
    <div>
      {/* Form thêm cọc mới */}
      <Form form={depositForm} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="amount" rules={[{ required: true, message: 'Nhập số tiền' }]}> 
          <InputNumber
            placeholder="Số tiền"
            min={1000}
            step={50000}
            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
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
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={addDeposit.isPending}
            onClick={handleDepositSubmit}
          >
            Ghi cọc
          </Button>
        </Form.Item>
      </Form>

      {/* Danh sách cọc đã ghi */}
      <Table
        dataSource={folio?.payments ?? []}
        rowKey="id"
        size="small"
        pagination={false}
        columns={[
          { title: 'Ngày', dataIndex: 'date', width: 100,
            render: (d: string) => dayjs(d).format('DD/MM/YYYY') },
          { title: 'Số tiền', dataIndex: 'amount', width: 120, align: 'right',
            render: fmt },
          { title: 'Phương thức', dataIndex: 'method', width: 120,
            render: (m: string) => METHOD_OPTIONS.find(o => o.value === m)?.label ?? m },
          { title: 'Ghi chú', dataIndex: 'note', ellipsis: true },
          {
            title: '', width: 50, align: 'center',
            render: (_: unknown, row: { id: string }) => (
              <Popconfirm
                title="Xóa khoản cọc này?"
                onConfirm={() => deleteDeposit.mutate(row.id)}
                okText="Xóa" cancelText="Huỷ" okType="danger"
              >
                <Button type="text" danger icon={<DeleteOutlined />} size="small" />
              </Popconfirm>
            ),
          },
        ]}
        summary={() => {
          const total = (folio?.payments ?? []).reduce((s, p) => s + p.amount, 0)
          return (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={2} align="right">
                <Text strong>Tổng cọc: {fmt(total)}</Text>
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
        {/* Chọn từ catalog hoặc nhập tay */}
        <Form.Item name="serviceId">
          <Select
            placeholder="Chọn dịch vụ..."
            allowClear
            style={{ width: 220 }}
            onChange={handleServiceSelect}
            onClear={() => serviceForm.setFieldsValue({ name: undefined, price: undefined })}
            options={SERVICE_CATALOG.map(s => ({ value: s.id, label: s.name }))}
          />
        </Form.Item>
        <Form.Item name="name" rules={[{ required: true, message: 'Nhập tên' }]}> 
          <Input placeholder="Tên dịch vụ" style={{ width: 180 }} />
        </Form.Item>
        <Form.Item name="price" rules={[{ required: true, message: 'Nhập giá' }]}> 
          <InputNumber
            placeholder="Đơn giá"
            min={0}
            step={10000}
            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
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

      <Table
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
            render: (_: unknown, row: { id: string }) => (
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
          const total = (folio?.services ?? []).reduce(
            (s, sv) => s + sv.price * sv.qty, 0
          )
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
          <InputNumber
            placeholder="Số tiền giảm"
            min={1000}
            step={10000}
            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
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
  const GrandTotalBar = folio && (
    <div style={{ background: '#fafafa', padding: '8px 12px', borderRadius: 6,
      display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <Space split={<Divider type="vertical" />}>
        <Text>Tiền phòng: <Text strong>{fmt(folio.booking.price)}</Text></Text>
        <Text>Dịch vụ: <Text strong>
          +{fmt((folio.services ?? []).reduce((s, sv) => s + sv.price * sv.qty, 0))}
        </Text></Text>
        <Text type="danger">Giảm giá: <Text strong type="danger">
          −{fmt((folio.discounts ?? []).reduce((s, d) => s + d.amount, 0))}
        </Text></Text>
      </Space>
      <Text>
        Grand Total:{' '}
        <Text strong style={{ fontSize: 16 }}>{fmt(folio.booking.grand_total)}</Text>
        {' '}|{' '}
        Đã cọc:{' '}
        <Text strong style={{ color: 'green' }}>
          {fmt((folio.payments ?? []).reduce((s, p) => s + p.amount, 0))}
        </Text>
      </Text>
    </div>
  )

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
              { key: 'deposit',  label: '💰 Cọc',       children: DepositTab  },
              { key: 'services', label: '🛎 Dịch vụ',   children: ServiceTab  },
              { key: 'discount', label: '🏷 Giảm giá',  children: DiscountTab },
            ]}
          />
        </>
      )}
    </Modal>
  )
}
