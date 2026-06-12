import React, { useState } from 'react';
import { Button, Upload, Typography, Space, message, Descriptions, Tag } from 'antd';
import type { UploadProps } from 'antd';
import { UploadOutlined, ReloadOutlined } from '@ant-design/icons';
import * as pdfjsLib from 'pdfjs-dist';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedBookingData {
  bookingNumber?: string;
  guestName?: string;
  nationality?: string;
  language?: string;
  numGuests?: number;
  numRooms?: number;
  checkIn?: string;        // ISO: "2026-05-10"
  checkOut?: string;       // ISO: "2026-05-13"
  numNights?: number;
  roomNumber?: string;
  mealPlan?: string;
  grandTotal?: number;     // VND
  commission?: number;     // VND
  netRevenue?: number;     // VND (grandTotal - commission)
  arrivalTime?: string;
  rawText?: string;        // debug
}

export interface BookingImportPDFProps {
  onParsed?: (data: ParsedBookingData) => void;
  onImport: (data: ParsedBookingData) => void;
}

// ─── Date Parser ─────────────────────────────────────────────────────────────

/**
 * Parse Booking.com date format: "Sun 10 May 2026" hoặc "10 May 2026"
 * → ISO string "2026-05-10"
 */
const parseBookingDate = (raw: string): string => {
  if (!raw) return '';
  // Bỏ tên thứ (Mon/Tue/.../Sun) nếu có, rồi parse theo nhiều format tháng.
  const cleaned = raw.trim().replace(/^[A-Za-z]{3}\s+/, '');
  const d = dayjs(cleaned, ['D MMMM YYYY', 'D MMM YYYY'], 'en', true);
  if (d.isValid()) return d.format('YYYY-MM-DD');
  // Fallback: native Date (less strict)
  const native = new Date(cleaned);
  if (!isNaN(native.getTime())) return dayjs(native).format('YYYY-MM-DD');
  return '';
};

// ─── PDF Text Extractor ───────────────────────────────────────────────────────

const extractTextFromPDF = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n';
  }
  return text;
};

// ─── Parser ───────────────────────────────────────────────────────────────────

const parseBookingComPDF = (text: string): ParsedBookingData => {
  const data: ParsedBookingData = { rawText: text };

  // Booking number
  const bookingNumMatch = text.match(/Booking\s+number[:\s]+(\d{6,12})/i);
  if (bookingNumMatch) data.bookingNumber = bookingNumMatch[1];

  // Guest name — xuất hiện sau "Guest information:" trước nationality
  const guestMatch = text.match(/Guest\s+information[:\s]+([A-ZÀ-Ö][a-zA-ZÀ-öÙ-ü\s\-']+?)(?:\s{2,}|\n)/);
  if (guestMatch) data.guestName = guestMatch[1].trim();

  // Nationality (vd: "France")
  const nationalityMatch = text.match(/\b(France|Germany|United Kingdom|USA|Australia|Japan|Korea|Vietnam|Singapore|Thailand|China|Netherlands|Belgium|Switzerland|Canada|Italy|Spain|Poland|Czech|Russia|Israel|India)\b/i);
  if (nationalityMatch) data.nationality = nationalityMatch[1];

  // Preferred language
  const langMatch = text.match(/Preferred\s+language[:\s]+(\w+)/i);
  if (langMatch) data.language = langMatch[1];

  // Total guests
  const guestsMatch = text.match(/Total\s+guests[:\s]+(\d+)\s+adult/i);
  if (guestsMatch) data.numGuests = parseInt(guestsMatch[1]);

  // Total units/rooms
  const roomsMatch = text.match(/Total\s+units\/rooms[:\s]+(\d+)/i);
  if (roomsMatch) data.numRooms = parseInt(roomsMatch[1]);

  // Check-in: "Sun 10 May 2026" hoặc "10 May 2026"
  const checkInMatch = text.match(/Check[- ]?in[:\s]+(?:\w{3}\s+)?(\d{1,2}\s+\w+\s+\d{4})/i);
  if (checkInMatch) data.checkIn = parseBookingDate(checkInMatch[1]);

  // Check-out
  const checkOutMatch = text.match(/Check[- ]?out[:\s]+(?:\w{3}\s+)?(\d{1,2}\s+\w+\s+\d{4})/i);
  if (checkOutMatch) data.checkOut = parseBookingDate(checkOutMatch[1]);

  // Length of stay
  const nightsMatch = text.match(/Length\s+of\s+stay[:\s]+(\d+)\s+night/i);
  if (nightsMatch) data.numNights = parseInt(nightsMatch[1]);
  else if (data.checkIn && data.checkOut) {
    data.numNights = dayjs(data.checkOut).diff(dayjs(data.checkIn), 'day');
  }

  // Arrival time
  const arrivalMatch = text.match(/Approximate\s+arrival\s+time[:\s]+([^\n]+)/i);
  if (arrivalMatch) {
    const t = arrivalMatch[1].trim();
    data.arrivalTime = /no time/i.test(t) ? undefined : t;
  }

  // Room number — 3 chữ số, chỉ trong range 101–303
  const roomMatch = text.match(/\b(1[0-9]{2}|2[0-9]{2}|3[0-2][0-9])\b/);
  if (roomMatch) data.roomNumber = roomMatch[1];

  // Meal plan
  if (/breakfast\s+included/i.test(text)) data.mealPlan = 'Breakfast included';
  else if (/room\s+only/i.test(text)) data.mealPlan = 'Room only';

  // Total price (VND)
  const totalMatch = text.match(/Total\s+price[:\s]+VND\s*([\d,]+)/i);
  if (totalMatch) data.grandTotal = parseInt(totalMatch[1].replace(/,/g, ''));

  // Commission (VND)
  const commMatch = text.match(/Commission[:\s]+VND\s*([\d,]+)/i);
  if (commMatch) data.commission = parseInt(commMatch[1].replace(/,/g, ''));

  // Net revenue
  if (data.grandTotal && data.commission) {
    data.netRevenue = data.grandTotal - data.commission;
  }

  return data;
};

// ─── Format helpers ───────────────────────────────────────────────────────────

const formatVND = (amount?: number) =>
  amount !== undefined
    ? amount.toLocaleString('vi-VN') + ' ₫'
    : '—';

const formatDate = (iso?: string) =>
  iso ? dayjs(iso).format('ddd DD/MM/YYYY') : <Tag color="error">Invalid Date</Tag>;

// ─── Component ────────────────────────────────────────────────────────────────

const BookingImportPDF: React.FC<BookingImportPDFProps> = ({ onParsed, onImport }) => {
  const [parsed, setParsed] = useState<ParsedBookingData | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const text = await extractTextFromPDF(file);
      const data = parseBookingComPDF(text);
      setParsed(data);
      onParsed?.(data);
    } catch (err) {
      console.error(err);
      message.error('Không đọc được file PDF. Kiểm tra lại định dạng.');
    } finally {
      setLoading(false);
    }
  };

  const uploadProps: UploadProps = {
    beforeUpload: (file) => {
      handleFile(file);
      return false; // prevent auto-upload
    },
    showUploadList: false,
    accept: '.pdf',
  };

  const handleReset = () => setParsed(null);

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {/* Upload button */}
      <Space>
        <Upload {...uploadProps}>
          <Button icon={<UploadOutlined />} loading={loading}>
            {parsed ? 'Upload file khác' : 'Chọn file PDF Booking.com'}
          </Button>
        </Upload>
        {parsed && (
          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            Xoá
          </Button>
        )}
      </Space>

      {/* Preview */}
      {parsed && (
        <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, border: '1px solid #e8e8e8' }}>
          <Typography.Title level={5} style={{ marginBottom: 12 }}>
            Xem trước dữ liệu #{parsed.bookingNumber ?? '—'}
          </Typography.Title>

          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="Khách" span={2}>
              {parsed.guestName ?? '—'}{' '}
              {parsed.nationality && <Tag>{parsed.nationality}</Tag>}
              {parsed.language && <Tag>{parsed.language}</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="Số khách">
              {parsed.numGuests ?? '—'} người lớn
            </Descriptions.Item>
            <Descriptions.Item label="Số phòng">
              {parsed.numRooms ?? '—'} phòng
            </Descriptions.Item>
            <Descriptions.Item label="Check-in">
              {formatDate(parsed.checkIn)}
            </Descriptions.Item>
            <Descriptions.Item label="Check-out">
              {formatDate(parsed.checkOut)}
            </Descriptions.Item>
            <Descriptions.Item label="Số đêm">
              {parsed.numNights ?? '—'} đêm
            </Descriptions.Item>
            <Descriptions.Item label="Giờ đến">
              {parsed.arrivalTime ?? 'Không có'}
            </Descriptions.Item>
            <Descriptions.Item label="Phòng">
              {parsed.roomNumber ? <Tag color="blue">{parsed.roomNumber}</Tag> : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Bữa ăn">
              {parsed.mealPlan ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Tổng Booking">
              {formatVND(parsed.grandTotal)}
            </Descriptions.Item>
            <Descriptions.Item label="Hoa hồng">
              <span style={{ color: '#ff4d4f' }}>{formatVND(parsed.commission)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Net (sau HH)" span={2}>
              <strong style={{ color: '#52c41a' }}>{formatVND(parsed.netRevenue)}</strong>
            </Descriptions.Item>
          </Descriptions>

          <div style={{ marginTop: 12 }}>
            <Button
              type="primary"
              onClick={() => onImport(parsed)}
              disabled={!parsed.checkIn || !parsed.checkOut}
            >
              Dùng dữ liệu này
            </Button>
            {(!parsed.checkIn || !parsed.checkOut) && (
              <Typography.Text type="danger" style={{ marginLeft: 8 }}>
                Thiếu ngày check-in / check-out
              </Typography.Text>
            )}
          </div>
        </div>
      )}
    </Space>
  );
};

export default BookingImportPDF;