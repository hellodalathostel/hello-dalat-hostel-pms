/**
 * BookingImportPDF.tsx — v2
 * Parse Booking.com reservation PDF → pre-fill booking form
 * Hỗ trợ: single booking + group booking (nhiều phòng cùng 1 reservation)
 *
 * Dependencies: npm install pdfjs-dist
 *
 * Tested:
 *   - Single: #5855405368 (phòng 102, Valentin LAURENT, 1 adult)
 *   - Group:  #6795256275 (phòng 102+103+301, Thach, 5 adults 1 child)
 */

import { useState, useCallback } from 'react'
import {
  Upload, Button, Card, Descriptions, Alert,
  Space, Tag, Typography, Divider, Table, Badge,
} from 'antd'
import {
  InboxOutlined, CheckCircleOutlined,
  FileTextOutlined, ImportOutlined, TeamOutlined,
} from '@ant-design/icons'
import type { UploadProps } from 'antd'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)

const { Dragger } = Upload
const { Text } = Typography

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BookingRoom {
  roomNumber: string
  mealPlan: string | null
  ratePlan: string | null
  pricePerNight: number   // VND/đêm
  totalRoomPrice: number  // VND tổng phòng này
}

export interface BookingParsedData {
  bookingNumber: string
  guestName: string
  nationality: string | null
  language: string | null
  adults: number
  children: number
  childrenAges: string[]
  roomCount: number
  isGroup: boolean
  checkIn: string         // YYYY-MM-DD
  checkOut: string        // YYYY-MM-DD
  nights: number
  arrivalTime: string | null
  rooms: BookingRoom[]    // per-room breakdown
  totalPrice: number      // VND
  commission: number | null
  netRevenue: number | null
  rawText: string
}

export interface BookingImportPDFProps {
  onParsed?: (data: BookingParsedData) => void
  onImport?: (data: BookingParsedData) => void
}

// ─── Parser ──────────────────────────────────────────────────────────────────

function parseBookingText(text: string): BookingParsedData | null {
  const get = (pattern: RegExp): string | null =>
    text.match(pattern)?.[1]?.trim() ?? null

  const parseVND = (raw: string): number =>
    parseInt(raw.replace(/[^\d]/g, ''), 10) || 0

  // Required
  const bookingNumber  = get(/Booking number:\s*(\d+)/)
  const checkInRaw     = get(/Check-in:\s*\w+\s+(\d+\s+\w+\s+\d{4})/)
  const checkOutRaw    = get(/Check-out:\s*\w+\s+(\d+\s+\w+\s+\d{4})/)
  const totalPriceRaw  = get(/Total price:\s*VND\s*([\d,\s]+)/)

  if (!bookingNumber || !checkInRaw || !checkOutRaw || !totalPriceRaw) return null

  const parseDate = (raw: string) => dayjs(raw, 'D MMMM YYYY').format('YYYY-MM-DD')
  const checkIn    = parseDate(checkInRaw)
  const checkOut   = parseDate(checkOutRaw)
  const totalPrice = parseVND(totalPriceRaw)

  // Guest block: "Guest information:\n{name}\n{country}"
  const guestBlock  = text.match(/Guest information:\s*\n([^\n]+)\n([^\n]+)?/)
  const guestName   = guestBlock?.[1]?.trim() ?? ''
  const nationality = guestBlock?.[2]?.trim() ?? null

  // Guest count: "5 adults, 1 child (2 years old)" | "1 adult"
  const guestLine    = get(/Total guests:\s*([^\n]+)/)
  const adults       = parseInt(guestLine?.match(/(\d+)\s*adult/)?.[1] ?? '1', 10)
  const childMatches = [...(guestLine?.matchAll(/(\d+)\s*child(?:ren)?\s*(?:\(([^)]+)\))?/gi) ?? [])]
  const children     = childMatches.reduce((s, m) => s + parseInt(m[1], 10), 0)
  const childrenAges = childMatches.flatMap(m => m[2] ? [m[2].trim()] : [])

  // Metadata
  const language     = get(/Preferred language:\s*([^\n]+)/)
  const roomCount    = parseInt(get(/Total units\/rooms:\s*(\d+)/) ?? '1', 10)
  const nights       = parseInt(get(/Length of stay:\s*(\d+)\s*night/) ?? '0', 10)
  const arrivalRaw   = get(/Approximate arrival time:\s*([^\n]+)/)
  const arrivalTime  = arrivalRaw && !arrivalRaw.toLowerCase().includes('no time')
    ? arrivalRaw : null

  // Financial
  const commissionRaw = get(/Commission:\s*VND\s*([\d,\s]+)/)
  const commission    = commissionRaw ? parseVND(commissionRaw) : null
  const netRevenue    = commission != null ? totalPrice - commission : null

  // Per-room blocks
  // Pattern: room number (standalone 3-digit line) ... "Total unit/room price VND xxx"
  const roomBlockRx =
    /^([1-3]\d{2})\n([\s\S]*?)Total unit\/room price VND\s*([\d,]+)/gm

  const rooms: BookingRoom[] = []
  let m: RegExpExecArray | null

  while ((m = roomBlockRx.exec(text)) !== null) {
    const block          = m[2]
    const totalRoomPrice = parseVND(m[3])

    const mealPlan = block.includes('Breakfast included') ? 'Breakfast included'
      : block.includes('Room only') ? 'Room only' : null

    const perNightM    = block.match(/\d+\s*x\s*VND\s*([\d,]+)/)
    const pricePerNight = perNightM ? parseVND(perNightM[1]) : 0

    const ratePlan = block.match(/Standard Rate[^\n]+/)?.[0]?.trim() ?? null

    rooms.push({ roomNumber: m[1], mealPlan, ratePlan, pricePerNight, totalRoomPrice })
  }

  // Fallback nếu regex không match (PDF text layout khác)
  if (rooms.length === 0) {
    const roomNum      = text.match(/\b([1-3]\d{2})\b/)?.[1] ?? '???'
    const perNightM    = text.match(/\d+\s*x\s*VND\s*([\d,]+)/)
    const mealPlan     = text.includes('Breakfast included') ? 'Breakfast included'
      : text.includes('Room only') ? 'Room only' : null
    const ratePlan     = get(/Standard Rate[^\n]+/)

    rooms.push({
      roomNumber: roomNum, mealPlan, ratePlan,
      pricePerNight: perNightM ? parseVND(perNightM[1]) : 0,
      totalRoomPrice: totalPrice,
    })
  }

  return {
    bookingNumber, guestName, nationality, language,
    adults, children, childrenAges,
    roomCount, isGroup: roomCount > 1,
    checkIn, checkOut, nights, arrivalTime,
    rooms, totalPrice, commission, netRevenue,
    rawText: text,
  }
}

// ─── PDF Extractor ────────────────────────────────────────────────────────────

async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  let out = ''

  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    // '\n' giữ structure dòng — quan trọng cho per-room regex
    out += content.items.map((x: any) => ('str' in x ? x.str : '')).join('\n') + '\n'
  }

  return out
}

// ─── Room breakdown table ─────────────────────────────────────────────────────

function RoomTable({ rooms, nights }: { rooms: BookingRoom[]; nights: number }) {
  const fmtVND = (n: number) => `${n.toLocaleString('vi-VN')} ₫`

  return (
    <Table
      dataSource={rooms.map((r, i) => ({ ...r, key: i }))}
      pagination={false}
      size="small"
      style={{ marginTop: 4 }}
      columns={[
        {
          title: 'Phòng', dataIndex: 'roomNumber', width: 70,
          render: (v: string) =>
            <Tag color="purple" style={{ fontSize: 13, fontWeight: 600 }}>{v}</Tag>,
        },
        {
          title: 'Bữa ăn', dataIndex: 'mealPlan',
          render: (v: string | null) =>
            v ? <Tag color="green">{v}</Tag> : <Text type="secondary">—</Text>,
        },
        {
          title: 'Giá/đêm', dataIndex: 'pricePerNight', align: 'right' as const,
          render: (v: number) => fmtVND(v),
        },
        {
          title: `Tổng (${nights}đ)`, dataIndex: 'totalRoomPrice', align: 'right' as const,
          render: (v: number) => <Text strong>{fmtVND(v)}</Text>,
        },
      ]}
    />
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BookingImportPDF({ onParsed, onImport }: BookingImportPDFProps) {
  const [status, setStatus]   = useState<'idle' | 'parsing' | 'success' | 'error'>('idle')
  const [parsed, setParsed]   = useState<BookingParsedData | null>(null)
  const [errorMsg, setError]  = useState('')

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Chỉ chấp nhận file PDF'); setStatus('error'); return false
    }
    setStatus('parsing'); setError(''); setParsed(null)

    try {
      const text = await extractTextFromPDF(file)
      const data = parseBookingText(text)

      if (!data) {
        setError('Không parse được — không phải reservation PDF Booking.com, hoặc format đã thay đổi.')
        setStatus('error')
        return false
      }

      setParsed(data); setStatus('success'); onParsed?.(data)
    } catch (err) {
      setError(`Lỗi đọc PDF: ${err instanceof Error ? err.message : String(err)}`)
      setStatus('error')
    }
    return false
  }, [onParsed])

  const reset = () => { setStatus('idle'); setParsed(null); setError('') }

  const fmtVND  = (n: number | null) => n != null ? `${n.toLocaleString('vi-VN')} ₫` : '—'
  const fmtDate = (s: string) => dayjs(s).format('DD/MM/YYYY')

  const uploadProps: UploadProps = {
    accept: '.pdf', multiple: false, showUploadList: false, beforeUpload: handleFile,
  }

  return (
    <Card
      title={
        <Space>
          <FileTextOutlined />
          <span>Import từ Booking.com PDF</span>
          {parsed?.isGroup && (
            <Badge count="Group" style={{ backgroundColor: '#722ed1' }} />
          )}
        </Space>
      }
      style={{ maxWidth: 680 }}
      styles={{ body: { padding: 20 } }}
    >
      {/* Upload */}
      {status !== 'success' && (
        <Dragger {...uploadProps} style={{ marginBottom: 16 }}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">Kéo thả hoặc click để chọn PDF reservation</p>
          <p className="ant-upload-hint" style={{ fontSize: 12 }}>
            Extranet → Reservations → chọn booking → Print/Download PDF
          </p>
        </Dragger>
      )}

      {status === 'parsing' && <Alert message="Đang đọc PDF..." type="info" showIcon />}

      {status === 'error' && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert message={errorMsg} type="error" showIcon />
          <Button size="small" onClick={reset}>Thử lại</Button>
        </Space>
      )}

      {status === 'success' && parsed && (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>

          <Alert
            type="success"
            message={
              <Space>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                <Text strong>#{parsed.bookingNumber}</Text>
                {parsed.isGroup && (
                  <Tag color="purple">
                    <TeamOutlined /> Group · {parsed.roomCount} phòng
                  </Tag>
                )}
              </Space>
            }
          />

          {/* Guest + stay */}
          <Descriptions
            bordered size="small" column={2}
            styles={{ label: { width: 130, fontWeight: 500 } }}
          >
            <Descriptions.Item label="Khách" span={2}>
              <Space wrap>
                <Text strong>{parsed.guestName}</Text>
                {parsed.nationality && <Tag color="blue">{parsed.nationality}</Tag>}
                {parsed.language && <Tag>{parsed.language}</Tag>}
              </Space>
            </Descriptions.Item>

            <Descriptions.Item label="Số khách">
              <Space>
                <span>{parsed.adults} người lớn</span>
                {parsed.children > 0 && (
                  <Tag color="orange">
                    {parsed.children} trẻ em
                    {parsed.childrenAges.length > 0 && ` (${parsed.childrenAges.join(', ')})`}
                  </Tag>
                )}
              </Space>
            </Descriptions.Item>

            <Descriptions.Item label="Số phòng">
              {parsed.roomCount} phòng
            </Descriptions.Item>

            <Descriptions.Item label="Check-in">
              {fmtDate(parsed.checkIn)}
            </Descriptions.Item>

            <Descriptions.Item label="Check-out">
              {fmtDate(parsed.checkOut)}
            </Descriptions.Item>

            <Descriptions.Item label="Số đêm">
              {parsed.nights} đêm
            </Descriptions.Item>

            <Descriptions.Item label="Giờ đến">
              {parsed.arrivalTime ?? <Text type="secondary">Không có</Text>}
            </Descriptions.Item>
          </Descriptions>

          {/* Per-room breakdown */}
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Chi tiết phòng
            </Text>
            <RoomTable rooms={parsed.rooms} nights={parsed.nights} />
          </div>

          <Divider style={{ margin: '4px 0' }} />

          {/* Tài chính */}
          <Descriptions
            bordered size="small" column={1}
            styles={{ label: { width: 130, fontWeight: 500 } }}
          >
            <Descriptions.Item label="Tổng Booking">
              <Text strong>{fmtVND(parsed.totalPrice)}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Hoa hồng">
              <Text type="danger">{fmtVND(parsed.commission)}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Net (sau HH)">
              <Text strong style={{ color: '#52c41a' }}>{fmtVND(parsed.netRevenue)}</Text>
            </Descriptions.Item>
          </Descriptions>

          <Space style={{ marginTop: 8 }}>
            <Button
              type="primary"
              icon={<ImportOutlined />}
              onClick={() => onImport?.(parsed)}
            >
              {parsed.isGroup ? 'Tạo Group Booking' : 'Dùng dữ liệu này'}
            </Button>
            <Button onClick={reset}>Upload file khác</Button>
          </Space>

        </Space>
      )}
    </Card>
  )
}
