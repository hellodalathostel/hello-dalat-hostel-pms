import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Button, Flex, Select, Spin, Table, Typography } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useS1aReport, type S1aRow } from '../hooks/useS1aReport'
import { TaxThresholdBanner } from '../components/TaxThresholdBanner'

const { Title, Paragraph, Text } = Typography

function fmtVND(n: number): string {
  return n.toLocaleString('vi-VN') + 'đ'
}

function exportCSV(rows: S1aRow[], nam: number) {
  const header = ['STT', 'Ngày ghi sổ', 'Diễn giải', 'Số tiền (VNĐ)', 'Phòng', 'Ngày nhận', 'Nguồn', 'Booking ID']
  const lines: string[] = [header.join(',')]

  rows.forEach((row, idx) => {
    const line = [
      idx + 1,
      dayjs(row.ngay_ghi_so).format('DD/MM/YYYY'),
      `"${row.dien_giai.replace(/"/g, '""')}"`,
      row.so_tien,
      row.room_id,
      dayjs(row.check_in).format('DD/MM/YYYY'),
      row.source,
      row.booking_id,
    ].join(',')
    lines.push(line)
  })

  const total = rows.reduce((sum, r) => sum + r.so_tien, 0)
  lines.push(['', '', '"TỔNG CỘNG"', total, '', '', '', ''].join(','))

  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `s1a_hkd_${nam}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function getYearOptions() {
  const currentYear = dayjs().year()
  const options = []
  for (let y = currentYear; y >= 2024; y--) {
    options.push({ value: y, label: `Năm ${y}` })
  }
  return options
}

type S1aTableRow = S1aRow & { key: string }

export default function S1aPage() {
  const [selectedYear, setSelectedYear] = useState<number>(dayjs().year())
  const { data, isLoading, isFetching, error } = useS1aReport(selectedYear)

  const rows = data ?? []

  const tongDoanThu = useMemo(() => rows.reduce((sum, r) => sum + r.so_tien, 0), [rows])

  const tableData: S1aTableRow[] = useMemo(
    () => rows.map((r, i) => ({ ...r, key: `${r.booking_id}-${i}` })),
    [rows],
  )

  const columns: ColumnsType<S1aTableRow> = [
    {
      title: 'STT',
      width: 60,
      render: (_v, _r, idx) => idx + 1,
    },
    {
      title: 'Ngày ghi sổ',
      dataIndex: 'ngay_ghi_so',
      width: 130,
      render: (v: string) => dayjs(v).format('DD/MM/YYYY'),
    },
    {
      title: 'Diễn giải',
      dataIndex: 'dien_giai',
      ellipsis: true,
    },
    {
      title: 'Phòng',
      dataIndex: 'room_id',
      width: 80,
      align: 'center',
    },
    {
      title: 'Nguồn',
      dataIndex: 'source',
      width: 130,
      ellipsis: true,
    },
    {
      title: 'Số tiền (VNĐ)',
      dataIndex: 'so_tien',
      width: 150,
      align: 'right',
      render: (v: number) => fmtVND(v),
    },
  ]

  const summary = () => (
    <Table.Summary fixed>
      <Table.Summary.Row>
        <Table.Summary.Cell index={0} colSpan={5}>
          <Text strong>Tổng cộng ({rows.length} dòng)</Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={5} align="right">
          <Text strong style={{ color: '#1677ff' }}>{fmtVND(tongDoanThu)}</Text>
        </Table.Summary.Cell>
      </Table.Summary.Row>
    </Table.Summary>
  )

  return (
    <div className="page-grid">
      <TaxThresholdBanner year={selectedYear} />

      <Flex justify="space-between" align="center" gap={12} wrap>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            Sổ doanh thu S1a — HKD
          </Title>
          <Paragraph className="page-subtitle">
            Doanh thu ghi nhận theo ngày trả phòng. Chỉ tính dịch vụ HKD — đối tác đã loại trừ.
          </Paragraph>
        </div>

        <Flex gap={12} wrap>
          <Select
            value={selectedYear}
            onChange={setSelectedYear}
            options={getYearOptions()}
            style={{ width: 120 }}
          />
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => exportCSV(rows, selectedYear)}
            disabled={isLoading || rows.length === 0}
          >
            Xuất CSV
          </Button>
        </Flex>
      </Flex>

      {error ? (
        <Text type="danger">{(error as Error).message}</Text>
      ) : null}

      <Spin spinning={isLoading || isFetching}>
        <Table
          rowKey="key"
          columns={columns}
          dataSource={tableData}
          pagination={{ pageSize: 50, showSizeChanger: false, showTotal: (t) => `${t} dòng` }}
          scroll={{ x: 700 }}
          summary={rows.length > 0 ? summary : undefined}
          locale={{ emptyText: `Không có dữ liệu doanh thu năm ${selectedYear}` }}
        />
      </Spin>
    </div>
  )
}
