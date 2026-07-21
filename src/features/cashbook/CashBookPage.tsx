import { useState } from 'react'
import {
  Card, Statistic, Row, Col, Button, List, Tag, Empty, Spin,
  Typography, Space, Result, DatePicker, Dropdown,
} from 'antd'
import {
  PlusOutlined, LockOutlined, UnlockOutlined, ArrowUpOutlined, ArrowDownOutlined,
  RobotOutlined, EditOutlined, MoreOutlined, DeleteOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useCashBookDaily, useCashBookDetail } from './hooks/useCashBook'
import { CashEntryModal } from './components/CashEntryModal'
import { VoidEntryModal } from './components/VoidEntryModal'
import { CloseShiftModal } from './components/CloseShiftModal'
import { ReopenShiftModal } from './components/ReopenShiftModal'
import { getCashEntryLabel, isAutoEntry, formatVnd } from '@/constants/cashBook'
import type { CashBookDetailRow } from '@/types/cashBook'

const { Text, Title } = Typography

export default function CashBookPage() {
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs())
  const [entryModalOpen, setEntryModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<CashBookDetailRow | null>(null)
  const [voidingEntry, setVoidingEntry] = useState<CashBookDetailRow | null>(null)
  const [closeOpen, setCloseOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)

  const dateStr = selectedDate.format('YYYY-MM-DD')
  const { data: dailyRows, isLoading: loadingDaily } = useCashBookDaily(30)
  const { data: details, isLoading: loadingDetail } = useCashBookDetail(dateStr)

  const today = dailyRows?.find((r) => r.entry_date === dateStr)
  const hasOpening = dailyRows?.some((r) => r.is_opening_entry) ?? false
  // QUAN TRONG: dung closed_at, KHONG dung discrepancy
  const isClosed = Boolean(today?.closed_at)

  const openAddModal = () => {
    setEditingEntry(null)
    setEntryModalOpen(true)
  }

  const openEditModal = (entry: CashBookDetailRow) => {
    setEditingEntry(entry)
    setEntryModalOpen(true)
  }

  if (loadingDaily) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    )
  }

  // Chua khai so quy
  if (!hasOpening) {
    return (
      <Result
        status="info"
        title="Chưa khai sổ quỹ"
        subTitle="Cần khai số tồn két ban đầu trước khi dùng sổ quỹ. Liên hệ chủ để khai sổ."
      />
    )
  }

  return (
    <div style={{ padding: '16px 12px', maxWidth: 720, margin: '0 auto' }}>
      <Space
        style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
        wrap
      >
        <Title level={4} style={{ margin: 0 }}>Sổ quỹ tiền mặt</Title>
        <DatePicker
          value={selectedDate}
          onChange={(d) => d && setSelectedDate(d)}
          allowClear={false}
          format="DD/MM/YYYY"
          inputReadOnly
        />
      </Space>

      {/* The tong quan */}
      <Card style={{ marginBottom: 16 }}>
        <Statistic
          title="Tồn quỹ"
          value={today?.ton_luy_ke ?? 0}
          formatter={(v) => formatVnd(Number(v))}
          suffix="₫"
          valueStyle={{ fontSize: 32, fontWeight: 600 }}
        />

        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={12}>
            <Statistic
              title="Thu"
              value={today?.thu_trong_ngay ?? 0}
              formatter={(v) => formatVnd(Number(v))}
              suffix="₫"
              prefix={<ArrowUpOutlined />}
              valueStyle={{ color: '#3f8600', fontSize: 18 }}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="Chi"
              value={today?.chi_trong_ngay ?? 0}
              formatter={(v) => formatVnd(Number(v))}
              suffix="₫"
              prefix={<ArrowDownOutlined />}
              valueStyle={{ color: '#cf1322', fontSize: 18 }}
            />
          </Col>
        </Row>

        {isClosed && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
            <Space wrap>
              <Tag color="default" icon={<LockOutlined />}>Đã chốt ca</Tag>
              <Text type="secondary">
                Đếm được {formatVnd(today?.counted_balance ?? 0)}₫
              </Text>
              {(today?.discrepancy ?? 0) !== 0 && (
                <Tag color="error">
                  {(today?.discrepancy ?? 0) > 0 ? 'Thừa ' : 'Thiếu '}
                  {formatVnd(Math.abs(today?.discrepancy ?? 0))}₫
                </Tag>
              )}
            </Space>
          </div>
        )}
      </Card>

      {/* Nut thao tac */}
      <Space style={{ width: '100%', marginBottom: 16 }} size="middle">
        {isClosed ? (
          <Button
            icon={<UnlockOutlined />}
            size="large"
            onClick={() => setReopenOpen(true)}
            block
          >
            Mở lại ca
          </Button>
        ) : (
          <>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="large"
              onClick={openAddModal}
              block
            >
              Thêm giao dịch
            </Button>
            <Button
              icon={<LockOutlined />}
              size="large"
              onClick={() => setCloseOpen(true)}
              block
            >
              Chốt ca
            </Button>
          </>
        )}
      </Space>

      {/* Danh sach giao dich */}
      <Card
        title={`Giao dịch ngày ${selectedDate.format('DD/MM/YYYY')}`}
        styles={{ body: { padding: details?.length ? 0 : 24 } }}
      >
        {loadingDetail ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : !details?.length ? (
          <Empty description="Chưa có giao dịch" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            dataSource={details}
            renderItem={(item) => {
              const isIn = item.direction === 'in'
              const auto = isAutoEntry(item.ref_table)
              // Chi sua/huy duoc giao dich nhap tay va ngay chua chot ca
              const canModify = !auto && !isClosed

              return (
                <List.Item
                  style={{ padding: '12px 16px' }}
                  actions={
                    canModify
                      ? [
                          <Dropdown
                            key="menu"
                            trigger={['click']}
                            menu={{
                              items: [
                                {
                                  key: 'edit',
                                  icon: <EditOutlined />,
                                  label: 'Sửa',
                                  onClick: () => openEditModal(item),
                                },
                                {
                                  key: 'void',
                                  icon: <DeleteOutlined />,
                                  label: 'Huỷ giao dịch',
                                  danger: true,
                                  onClick: () => setVoidingEntry(item),
                                },
                              ],
                            }}
                          >
                            <Button type="text" icon={<MoreOutlined />} />
                          </Dropdown>,
                        ]
                      : undefined
                  }
                >
                  <List.Item.Meta
                    title={
                      <Space size={4} wrap>
                        <Text strong style={{ fontSize: 14 }}>
                          {item.description || getCashEntryLabel(item.entry_type)}
                        </Text>
                        {auto ? (
                          <Tag icon={<RobotOutlined />} color="blue" style={{ fontSize: 11 }}>
                            Tự động
                          </Tag>
                        ) : (
                          <Tag icon={<EditOutlined />} style={{ fontSize: 11 }}>
                            Nhập tay
                          </Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {getCashEntryLabel(item.entry_type)} ·{' '}
                        {dayjs(item.created_at).format('HH:mm')}
                      </Text>
                    }
                  />
                  <Text
                    strong
                    style={{
                      color: isIn ? '#3f8600' : '#cf1322',
                      fontSize: 15,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isIn ? '+' : '−'}{formatVnd(item.amount)}₫
                  </Text>
                </List.Item>
              )
            }}
          />
        )}
      </Card>

      <CashEntryModal
        open={entryModalOpen}
        onClose={() => {
          setEntryModalOpen(false)
          setEditingEntry(null)
        }}
        entryDate={dateStr}
        editingEntry={editingEntry}
      />
      <VoidEntryModal
        open={Boolean(voidingEntry)}
        onClose={() => setVoidingEntry(null)}
        entry={voidingEntry}
      />
      <CloseShiftModal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        shiftDate={dateStr}
        expectedBalance={today?.ton_luy_ke ?? 0}
      />
      <ReopenShiftModal
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        shiftDate={dateStr}
      />
    </div>
  )
}
