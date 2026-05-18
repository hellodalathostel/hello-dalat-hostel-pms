import dayjs, { Dayjs } from 'dayjs'
import * as XLSX from 'xlsx'
import { FileExcelOutlined } from '@ant-design/icons'
import { Button, DatePicker, Flex, Spin, Table, Typography } from 'antd'
import { useMemo, useState } from 'react'
import type { ColumnsType } from 'antd/es/table'
import { supabase } from '@/api/supabase'
import { useDK14Report, type DK14Row } from '@/features/compliance/hooks/useDK14'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

type DK14PreviewRow = DK14Row & { key: string }

const WORKSHEET_NAME = 'File Danh sách khách lưu trú'
const TEMPLATE_BUCKET = 'templates'
const TEMPLATE_PATH = 'dk14/khai_bao_luu_tru.xlsx'
const START_ROW_INDEX = 2

function formatDateTime(value: string | null): string {
  if (!value) return ''
  // View đã trả về đúng format DD/MM/YYYY HH:mm:ss — dùng thẳng
  if (value.match(/^\d{2}\/\d{2}\/\d{4}/)) return value
  // Fallback cho ISO string
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('DD/MM/YYYY HH:mm:ss') : ''
}

function formatBirthday(value: string | null): string {
  if (!value) {
    return ''
  }

  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('DD/MM/YYYY') : ''
}

function normalizeGender(value: string | null): string {
  if (value === 'M') {
    return 'Nam'
  }

  if (value === 'F') {
    return 'Nữ'
  }

  return value ?? ''
}

function mapRowToColumns(row: DK14Row, index: number): Array<string | number> {
  return [
    row.stt ?? index + 1,
    row.ho_va_ten ?? '',
    formatBirthday(row.ngay_sinh),
    normalizeGender(row.gioi_tinh),
    row.quoc_gia ?? '',
    row.quoc_tich ?? '',
    row.loai_giay_to ?? '',
    row.ten_giay_to ?? '',
    row.so_giay_to ?? '',
    row.so_dien_thoai ?? '',
    row.quoc_gia === 'VNM' ? 'Tạm trú' : '',
    row.tinh_tp ?? '',
    row.quan_huyen ?? '',
    row.phuong_xa ?? '',
    row.dia_chi_chi_tiet ?? '',
    formatDateTime(row.tu_ngay),
    formatDateTime(row.den_ngay),
    row.ly_do_luu_tru ?? '',
    row.ten_phong ?? '',
  ]
}

export default function DK14Report(): React.JSX.Element {
  const { message, notification } = useAppFeedback()
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs().startOf('day'))

  const { data, isLoading, isFetching, error } = useDK14Report(selectedDate)

  const rows = data ?? []

  const previewData: DK14PreviewRow[] = useMemo(
    () =>
      rows.slice(0, 8).map((row, index) => ({
        ...row,
        key: `${row.stt ?? index}-${row.so_giay_to ?? row.ho_va_ten ?? index}`,
      })),
    [rows],
  )

  const columns: ColumnsType<DK14PreviewRow> = [
    { title: 'STT', dataIndex: 'stt', width: 80 },
    { title: 'Họ và tên', dataIndex: 'ho_va_ten', ellipsis: true },
    { title: 'Giới tính', dataIndex: 'gioi_tinh', width: 120 },
    { title: 'Số giấy tờ', dataIndex: 'so_giay_to', ellipsis: true },
    { title: 'Phòng', dataIndex: 'ten_phong', width: 140 },
    {
      title: 'Từ ngày',
      dataIndex: 'tu_ngay',
      width: 200,
      render: (value: string | null) => formatDateTime(value),
    },
    {
      title: 'Đến ngày',
      dataIndex: 'den_ngay',
      width: 200,
      render: (value: string | null) => formatDateTime(value),
    },
  ]

  const handleExport = async () => {
    try {
      const { data: fileBlob, error: downloadError } = await supabase
        .storage
        .from(TEMPLATE_BUCKET)
        .download(TEMPLATE_PATH)

      if (downloadError) {
        throw downloadError
      }

      if (!fileBlob) {
        throw new Error('Không tải được file template ĐK14')
      }

      const arrayBuffer = await fileBlob.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true })
      const ws = workbook.Sheets[WORKSHEET_NAME]

      if (!ws) {
        throw new Error(`Không tìm thấy sheet ${WORKSHEET_NAME} trong template`)
      }

      const currentRange = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:S10')
      for (let r = START_ROW_INDEX; r <= currentRange.e.r; r++) {
        for (let c = currentRange.s.c; c <= currentRange.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c })
          delete ws[addr]
        }
      }

      rows.forEach((row, index) => {
        const outputValues = mapRowToColumns(row, index)
        const rowIndex = START_ROW_INDEX + index

        outputValues.forEach((value, colIndex) => {
          const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })
          ws[cellAddress] = { t: typeof value === 'number' ? 'n' : 's', v: value }
        })
      })

      const updatedRange = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:S2')
      const lastDataRow = Math.max(START_ROW_INDEX + Math.max(rows.length - 1, 0), updatedRange.e.r)
      const lastDataCol = Math.max(18, updatedRange.e.c)

      ws['!ref'] = XLSX.utils.encode_range({
        s: { r: updatedRange.s.r, c: updatedRange.s.c },
        e: { r: lastDataRow, c: lastDataCol },
      })

      XLSX.writeFile(workbook, `khai_bao_luu_tru_${selectedDate.format('DDMMYYYY')}.xlsx`)
      message.success('Xuất file Excel thành công')
    } catch (exportError) {
      notification.error({
        message: 'Không thể xuất file ĐK14',
        description: exportError instanceof Error ? exportError.message : 'Lỗi không xác định',
      })
    }
  }

  return (
    <div className="page-grid">
      <Flex justify="space-between" align="center" gap={12} wrap>
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>
            Báo cáo ĐK14
          </Typography.Title>
          <Typography.Paragraph className="page-subtitle">
            Chọn ngày lưu trú để xem dữ liệu và xuất mẫu khai báo lưu trú chuẩn.
          </Typography.Paragraph>
        </div>

        <Flex gap={12} wrap>
          <DatePicker
            value={selectedDate}
            allowClear={false}
            format="DD/MM/YYYY"
            onChange={(value) => setSelectedDate((value ?? dayjs()).startOf('day'))}
          />
          <Button type="primary" icon={<FileExcelOutlined />} onClick={handleExport} disabled={isLoading}>
            Xuất Excel
          </Button>
        </Flex>
      </Flex>

      {error ? (
        <Typography.Text type="danger">{error.message}</Typography.Text>
      ) : null}

      <Spin spinning={isLoading || isFetching}>
        <Table
          rowKey="key"
          columns={columns}
          dataSource={previewData}
          pagination={false}
          scroll={{ x: 1080 }}
          locale={{ emptyText: 'Không có dữ liệu lưu trú cho ngày đã chọn' }}
        />
      </Spin>
    </div>
  )
}
