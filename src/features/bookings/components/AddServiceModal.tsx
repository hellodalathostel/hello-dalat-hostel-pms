import { useState } from 'react'
import {
  Modal,
  Radio,
  Select,
  InputNumber,
  Input,
  Button,
  Space,
  Typography,
  Divider,
  Spin,
  Tag,
  Alert,
} from 'antd'
import { useAddService, useServiceCatalog } from '../hooks/useAddService'
import type { ServiceCatalogItem } from '../hooks/useAddService'

const { Text } = Typography

interface Props {
  open: boolean
  bookingId: string
  onClose: () => void
  onSuccess?: () => void
}

type Mode = 'catalog' | 'custom'

// Label hiển thị loại dịch vụ
function ServiceTypeTag({ type }: { type: ServiceCatalogItem['service_type'] }) {
  return type === 'own'
    ? <Tag color="blue" style={{ marginLeft: 4 }}>HKD</Tag>
    : <Tag color="orange" style={{ marginLeft: 4 }}>Đối tác</Tag>
}

export function AddServiceModal({ open, bookingId, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>('catalog')

  // --- catalog mode state ---
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [catalogQty, setCatalogQty] = useState<number>(1)
  const [catalogPrice, setCatalogPrice] = useState<number | null>(null)

  // --- custom mode state ---
  const [customName, setCustomName] = useState('')
  const [customPrice, setCustomPrice] = useState<number | null>(null)
  const [customQty, setCustomQty] = useState<number>(1)

  // Fetch catalog (include service_type)
  const { data: catalog = [], isLoading: catalogLoading } = useServiceCatalog()

  const { mutate: addService, isPending } = useAddService(bookingId)

  const selectedItem = catalog.find((item) => item.id === selectedId)
  const effectiveCatalogPrice = catalogPrice ?? selectedItem?.price ?? 0
  const catalogTotal = selectedItem ? effectiveCatalogPrice * catalogQty : null
  const customTotal =
    customPrice !== null && customPrice > 0 && customQty > 0
      ? customPrice * customQty
      : null

  // Reset form khi đóng
  const handleClose = () => {
    setMode('catalog')
    setSelectedId(undefined)
    setCatalogQty(1)
    setCatalogPrice(null)
    setCustomName('')
    setCustomPrice(null)
    setCustomQty(1)
    onClose()
  }

  const handleSubmit = () => {
    if (mode === 'catalog') {
      if (!selectedId || catalogQty <= 0) return
      addService(
        {
          serviceId: selectedId,
          qty: catalogQty,
          // Luôn gửi customPrice = giá hiện tại trên UI (có thể đã sửa khác catalog)
          customPrice: effectiveCatalogPrice,
        },
        { onSuccess: () => { onSuccess?.(); handleClose() } },
      )
      return
    }

    if (!customName.trim() || customPrice === null || customPrice <= 0 || customQty <= 0) return
    addService(
      { customName: customName.trim(), customPrice, qty: customQty },
      { onSuccess: () => { onSuccess?.(); handleClose() } },
    )
  }

  const isValid =
    mode === 'catalog'
      ? Boolean(selectedId) && catalogQty > 0
      : Boolean(customName.trim()) && customPrice !== null && customPrice > 0 && customQty > 0

  // Cảnh báo khi chọn dịch vụ đối tác
  const isPartner = selectedItem?.service_type === 'partner'

  return (
    <Modal
      title="Thêm dịch vụ"
      open={open}
      onCancel={handleClose}
      footer={(
        <Space>
          <Button onClick={handleClose} disabled={isPending}>Huỷ</Button>
          <Button
            type="primary"
            onClick={handleSubmit}
            loading={isPending}
            disabled={!isValid}
          >
            Thêm
          </Button>
        </Space>
      )}
      destroyOnClose
      width={480}
    >
      {/* Chọn mode */}
      <Radio.Group
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        style={{ marginBottom: 20 }}
        optionType="button"
        buttonStyle="solid"
      >
        <Radio.Button value="catalog">Dịch vụ có sẵn</Radio.Button>
        <Radio.Button value="custom">Tuỳ chỉnh</Radio.Button>
      </Radio.Group>

      {/* Mode: catalog */}
      {mode === 'catalog' && (
        <Spin spinning={catalogLoading}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
                Dịch vụ
              </Text>
              <Select
                placeholder="Chọn dịch vụ..."
                style={{ width: '100%' }}
                value={selectedId}
                onChange={(value) => {
                  setSelectedId(value)
                  const found = catalog.find((item) => item.id === value)
                  setCatalogPrice(found?.price ?? null)
                }}
                optionLabelProp="label"
                options={catalog.map((item) => ({
                  value: item.id,
                  // label dùng cho hiển thị khi đã chọn (gọn hơn)
                  label: item.name,
                  // render trong dropdown: tên + giá + badge
                  item,
                }))}
                optionRender={(option) => {
                  const item = option.data.item as ServiceCatalogItem
                  return (
                    <Space>
                      <span>{item.name}</span>
                      <Text type="secondary">{item.price.toLocaleString('vi-VN')}đ</Text>
                      <ServiceTypeTag type={item.service_type} />
                    </Space>
                  )
                }}
              />
            </div>

            {/* Cảnh báo dịch vụ đối tác */}
            {isPartner && (
              <Alert
                type="warning"
                showIcon
                message="Dịch vụ đối tác — không tính vào doanh thu HKD (Sổ S1a)"
                style={{ padding: '6px 12px' }}
              />
            )}

            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
                Đơn giá (có thể sửa)
              </Text>
              <InputNumber<number>
                min={0}
                step={5000}
                value={effectiveCatalogPrice}
                style={{ width: '100%' }}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(v) => Number(v?.replace(/,/g, '') ?? 0)}
                addonAfter="₫"
                disabled={!selectedId}
                onChange={(value) => setCatalogPrice(value ?? 0)}
              />
            </div>

            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
                Số lượng
              </Text>
              <InputNumber
                min={0.5}
                step={0.5}
                value={catalogQty}
                onChange={(value) => setCatalogQty(value ?? 1)}
                style={{ width: '100%' }}
              />
            </div>

            {catalogTotal !== null && (
              <>
                <Divider style={{ margin: '4px 0' }} />
                <div style={{ textAlign: 'right' }}>
                  <Text strong>
                    Thành tiền:{' '}
                    <Text strong style={{ fontSize: 16 }}>
                      {catalogTotal.toLocaleString('vi-VN')}đ
                    </Text>
                  </Text>
                </div>
              </>
            )}
          </Space>
        </Spin>
      )}

      {/* Mode: custom — mặc định own, không cần field */}
      {mode === 'custom' && (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Alert
            type="info"
            showIcon
            message="Dịch vụ tuỳ chỉnh được tính là doanh thu HKD (Sổ S1a)"
            style={{ padding: '6px 12px' }}
          />
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
              Tên dịch vụ
            </Text>
            <Input
              placeholder="VD: Thuê chăn thêm"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              maxLength={100}
            />
          </div>

          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
              Đơn giá (VNĐ)
            </Text>
            <InputNumber<number>
              min={1000}
              step={5000}
              value={customPrice}
              onChange={(value) => setCustomPrice(value)}
              style={{ width: '100%' }}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => Number(value?.replace(/,/g, '') ?? 0)}
            />
          </div>

          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
              Số lượng
            </Text>
            <InputNumber
              min={0.5}
              step={0.5}
              value={customQty}
              onChange={(value) => setCustomQty(value ?? 1)}
              style={{ width: '100%' }}
            />
          </div>

          {customTotal !== null && (
            <>
              <Divider style={{ margin: '4px 0' }} />
              <div style={{ textAlign: 'right' }}>
                <Text strong>
                  Thành tiền:{' '}
                  <Text strong style={{ fontSize: 16 }}>
                    {customTotal.toLocaleString('vi-VN')}đ
                  </Text>
                </Text>
              </div>
            </>
          )}
        </Space>
      )}
    </Modal>
  )
}
