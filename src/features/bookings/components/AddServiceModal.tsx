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
} from 'antd'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAddService, SERVICE_CATALOG_KEY, type ServiceCatalogItem } from '../hooks/useAddService'

const { Text } = Typography

interface Props {
  open: boolean
  bookingId: string
  onClose: () => void
  onSuccess?: () => void
}

type Mode = 'catalog' | 'custom'

export function AddServiceModal({ open, bookingId, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>('catalog')

  // --- catalog mode state ---
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [catalogQty, setCatalogQty] = useState<number>(1)

  // --- custom mode state ---
  const [customName, setCustomName] = useState('')
  const [customPrice, setCustomPrice] = useState<number | null>(null)
  const [customQty, setCustomQty] = useState<number>(1)

  // Fetch catalog
  const { data: catalog = [], isLoading: catalogLoading } = useQuery<ServiceCatalogItem[]>({
    queryKey: SERVICE_CATALOG_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('id, name, price')
        .eq('is_deleted', false)
        .order('name')

      if (error) {
        throw error
      }

      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const { mutate: addService, isPending } = useAddService(bookingId)

  // Giá hiển thị preview catalog
  const selectedItem = catalog.find((serviceItem) => serviceItem.id === selectedId)
  const catalogTotal = selectedItem ? selectedItem.price * catalogQty : null
  const customTotal = customPrice !== null && customPrice > 0 && customQty > 0
    ? customPrice * customQty
    : null

  // Reset form khi đóng
  const handleClose = () => {
    setMode('catalog')
    setSelectedId(undefined)
    setCatalogQty(1)
    setCustomName('')
    setCustomPrice(null)
    setCustomQty(1)
    onClose()
  }

  const handleSubmit = () => {
    if (mode === 'catalog') {
      if (!selectedId || catalogQty <= 0) {
        return
      }

      addService(
        { serviceId: selectedId, qty: catalogQty },
        {
          onSuccess: () => {
            onSuccess?.()
            handleClose()
          },
        },
      )

      return
    }

    if (!customName.trim() || customPrice === null || customPrice <= 0 || customQty <= 0) {
      return
    }

    addService(
      { customName: customName.trim(), customPrice, qty: customQty },
      {
        onSuccess: () => {
          onSuccess?.()
          handleClose()
        },
      },
    )
  }

  // Validate để disable nút OK
  const isValid = mode === 'catalog'
    ? Boolean(selectedId) && catalogQty > 0
    : Boolean(customName.trim()) && customPrice !== null && customPrice > 0 && customQty > 0

  return (
    <Modal
      title="Thêm dịch vụ"
      open={open}
      onCancel={handleClose}
      footer={(
        <Space>
          <Button onClick={handleClose} disabled={isPending}>
            Huỷ
          </Button>
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
        onChange={(event) => setMode(event.target.value)}
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
                onChange={(value) => setSelectedId(value)}
                options={catalog.map((serviceItem) => ({
                  value: serviceItem.id,
                  label: `${serviceItem.name} — ${serviceItem.price.toLocaleString('vi-VN')}đ`,
                }))}
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

      {/* Mode: custom */}
      {mode === 'custom' && (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
              Tên dịch vụ
            </Text>
            <Input
              placeholder="VD: Thuê chăn thêm"
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
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