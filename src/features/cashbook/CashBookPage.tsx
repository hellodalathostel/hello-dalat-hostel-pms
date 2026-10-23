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
import { useCashBookDayRow, useCashBookDetail, useCashBookOpening } from './hooks/useCashBook'
import { CashEntryModal } from './components/CashEntryModal'
import { VoidEntryModal } from './components/VoidEntryModal'
import { CloseShiftModal } from './components/CloseShiftModal'
import { ReopenShiftModal } from './components/ReopenShiftModal'
import { QueryErrorState } from '@/components/QueryErrorState'
import { getCashEntryLabel, isAutoEntry, formatVnd } from '@/constants/cashBook'
import type { CashBookDetailRow } from '@/types/cashBook'

const { Text, Title } = Typography

const LOAD_ERROR_TITLE = 'Không tải được dữ liệu sổ quỹ'

export default function CashBookPage() {
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs())
  const [entryModalOpen, setEntryModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<CashBookDetailRow | null>(null)
  const [voidingEntry, setVoidingEntry] = useState<CashBookDetailRow | null>(null)
  const [closeOpen, setCloseOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)

  const dateStr = selectedDate.format('YYYY-MM-DD')
  // F02: trang thai khai so va tong hop ngay lay bang query rieng, khong tim trong 30 dong
  const openingQuery = useCashBookOpening()
  const dayQuery = useCashBookDayRow(dateStr)
  const detailQuery = useCashBookDetail(dateStr)

  const details = detailQuery.data
  const dayResult = dayQuery.data
  const today = dayResult?.row ?? null
  // QUAN TRONG: dung closed_at, KHONG dung discrepancy
  const isClosed = Boolean(today?.closed_at)
  // Ton dau ngay = ton cuoi - thuan trong ngay (view khong co cot ton dau rieng)
  const openingOfDay = today ? today.ton_luy_ke - today.thuan_trong_ngay : null

  // F04: query loi (ke ca refetch loi khi van con du lieu cu) → hien khoi loi co dinh.
  const failedQueries = [openingQuery, dayQuery, detailQuery].filter((q) => q.error)
  const hasStaleData = failedQueries.some((q) => q.data !== undefined)
  const retryFailed = () => {
    failedQueries.forEach((q) => {
      void q.refetch()
    })
  }

  const openAddModal = () => {
    setEditingEntry(null)
    setEntryModalOpen(true)
  }

  const openEditModal = (entry: CashBookDetailRow) => {
    setEditingEntry(entry)
    setEntryModalOpen(true)
  }

  if (openingQuery.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    )
  }

  // Loi va chua tung co du lieu khai so → khong the biet da khai hay chua, KHONG ket luan "chua khai".
  // Loi tai lai nen ma con du lieu cu → van hien trang binh thuong kem Alert "Chua cap nhat".
  if (openingQuery.isError && openingQuery.data === undefined) {
    return (
      <QueryErrorState
        title={LOAD_ERROR_TITLE}
        error={openingQuery.error}
        onRetry={() => void openingQuery.refetch()}
        isRetrying={openingQuery.isFetching}
      />
    )
  }

  // Chua khai so quy — CHI khi truy van thanh cong va khong co dong khai so
  if (openingQuery.isSuccess && !openingQuery.data) {
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

      {failedQueries.length > 0 && (
        <QueryErrorState
          variant="banner"
          title={LOAD_ERROR_TITLE}
          description={hasStaleData ? 'Chưa cập nhật — đang hiển thị dữ liệu cũ.' : null}
          onRetry={retryFailed}
          isRetrying={failedQueries.some((q) => q.isFetching)}
        />
      )}

      {/* The tong quan */}
      <Card style={{ marginBottom: 16 }}>
        {dayQuery.isLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : !dayResult ? (
          <Text type="secondary">Không tải được số liệu ngày này.</Text>
        ) : dayResult.kind === 'before-opening' ? (
          <Text type="secondary">Ngày này trước mốc khai sổ quỹ, chưa có số liệu.</Text>
        ) : (
          <>
            {dayResult.kind === 'carried' && (
              <Tag style={{ marginBottom: 8 }}>Không phát sinh — tồn mang sang</Tag>
            )}
            <Statistic
              title="Tồn quỹ"
              value={today?.ton_luy_ke ?? 0}
              formatter={(v) => formatVnd(Number(v))}
              suffix="₫"
              valueStyle={{ fontSize: 32, fontWeight: 600 }}
            />
            <Text type="secondary" style={{ fontSize: 13 }}>
              Tồn đầu ngày: {formatVnd(openingOfDay ?? 0)}₫
            </Text>

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
          </>
        )}
      </Card>

      {/* Nut thao tac — chi hien khi biet chac trang thai ca cua ngay */}
      {today && (
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
      )}

      {/* Danh sach giao dich */}
      <Card
        title={`Giao dịch ngày ${selectedDate.format('DD/MM/YYYY')}`}
        styles={{ body: { padding: details?.length ? 0 : 24 } }}
      >
        {detailQuery.isLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : detailQuery.isError ? (
          <Text type="secondary">Không tải được danh sách giao dịch.</Text>
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
