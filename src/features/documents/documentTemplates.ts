// src/features/documents/documentTemplates.ts
// Template HTML và Zalo text cho 5 loại tài liệu hostel
// Dùng trong useDocumentGenerator.ts

import dayjs from 'dayjs'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BookingLine {
  id: string
  room_name: string
  room_number: string
  check_in: string   // ISO date
  check_out: string  // ISO date
  nights: number
  rate_per_night: number
  room_total: number
}

export interface ServiceLine {
  name: string
  quantity: number
  unit_price: number
  total: number
}

export interface DiscountLine {
  description: string
  amount: number
}

export interface PaymentLine {
  paid_at: string  // ISO datetime
  method: string   // cash | transfer | card
  amount: number
  note?: string
}

export interface DocumentData {
  // Group-level
  group_id: string
  group_code?: string        // hiển thị ngắn: 6 ký tự cuối group_id
  created_at: string         // ISO datetime

  // Guest chính (first booking's primary guest)
  guest_name: string
  guest_phone?: string
  guest_email?: string

  // Bookings
  bookings: BookingLine[]
  services: ServiceLine[]
  discounts: DiscountLine[]

  // Tài chính (từ DB triggers)
  grand_total: number
  total_paid: number
  remaining: number          // grand_total - total_paid

  // Payments (cho invoice)
  payments?: PaymentLine[]

  // Deposit
  deposit_amount?: number    // số tiền đặt cọc yêu cầu
  deposit_deadline?: string  // ISO date

  // Hostel
  hostel_name: string
  hostel_phone: string
  hostel_address: string
  hostel_bank?: string       // tên ngân hàng
  hostel_account?: string    // số tài khoản
  hostel_account_name?: string
}

export type DocKind =
  | 'booking_confirmation'
  | 'deposit_request'
  | 'deposit_confirmation'
  | 'invoice'
  | 'arrival_notice'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format tiền VND: 1500000 → "1.500.000 đ" */
function fmtVND(amount: number): string {
  return amount.toLocaleString('vi-VN') + ' đ'
}

/** Format ngày: "2025-12-20" → "20/12/2025" */
function fmtDate(iso: string): string {
  return dayjs(iso).format('DD/MM/YYYY')
}

/** Format datetime: ISO → "20/12/2025 14:00" */
function fmtDatetime(iso: string): string {
  return dayjs(iso).format('DD/MM/YYYY HH:mm')
}

/** Lấy 6 ký tự cuối của UUID làm booking code */
function shortCode(id: string): string {
  return id.slice(-6).toUpperCase()
}

/** Tên method thanh toán tiếng Việt */
function fmtMethod(method: string): string {
  const map: Record<string, string> = {
    cash: 'Tiền mặt',
    transfer: 'Chuyển khoản',
    card: 'Thẻ ngân hàng',
  }
  return map[method] ?? method
}

// ─── Shared CSS (inject vào mỗi HTML template) ────────────────────────────────

const BASE_CSS = `
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 13px;
      color: #222;
      background: #fff;
      padding: 32px;
      max-width: 720px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #1a7f5a;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .hostel-name {
      font-size: 18px;
      font-weight: 700;
      color: #1a7f5a;
    }
    .hostel-meta { font-size: 11px; color: #666; margin-top: 4px; }
    .doc-title {
      font-size: 16px;
      font-weight: 700;
      text-align: right;
      color: #333;
    }
    .doc-code { font-size: 11px; color: #888; text-align: right; margin-top: 4px; }
    .section { margin-bottom: 18px; }
    .section-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      color: #1a7f5a;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      border-bottom: 1px solid #e8f5f0;
      padding-bottom: 4px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 4px 8px;
    }
    .info-label { color: #888; font-size: 12px; }
    .info-value { font-weight: 500; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th {
      background: #f0faf5;
      color: #1a7f5a;
      font-weight: 600;
      padding: 7px 8px;
      text-align: left;
      border-bottom: 1px solid #c9e8d8;
    }
    td {
      padding: 6px 8px;
      border-bottom: 1px solid #f0f0f0;
      vertical-align: top;
    }
    tr:last-child td { border-bottom: none; }
    .text-right { text-align: right; }
    .total-row td {
      font-weight: 700;
      background: #f0faf5;
      border-top: 1px solid #c9e8d8;
    }
    .summary-box {
      background: #f0faf5;
      border: 1px solid #c9e8d8;
      border-radius: 6px;
      padding: 12px 16px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      font-size: 13px;
    }
    .summary-row.grand {
      font-weight: 700;
      font-size: 15px;
      border-top: 1px solid #c9e8d8;
      margin-top: 6px;
      padding-top: 8px;
      color: #1a7f5a;
    }
    .summary-row.remaining {
      color: #d4380d;
      font-weight: 700;
    }
    .summary-row.paid {
      color: #389e0d;
    }
    .highlight-box {
      border: 2px solid #1a7f5a;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    .highlight-amount {
      font-size: 24px;
      font-weight: 700;
      color: #1a7f5a;
      margin: 8px 0;
    }
    .tag-paid {
      display: inline-block;
      background: #389e0d;
      color: #fff;
      border-radius: 4px;
      padding: 2px 10px;
      font-size: 12px;
      font-weight: 700;
    }
    .footer {
      margin-top: 32px;
      padding-top: 12px;
      border-top: 1px solid #eee;
      font-size: 11px;
      color: #aaa;
      text-align: center;
    }
    .bank-box {
      background: #fffbe6;
      border: 1px solid #ffe58f;
      border-radius: 6px;
      padding: 12px 16px;
      margin-top: 12px;
    }
    @media print {
      body { padding: 0; }
      @page { margin: 20mm; }
    }
  </style>
`

// ─── HTML Templates ────────────────────────────────────────────────────────────

/** 1. Xác nhận đặt phòng */
function renderBookingConfirmationHtml(d: DocumentData): string {
  const roomRows = d.bookings
    .map(
      (b) => `
      <tr>
        <td>${b.room_name} (${b.room_number})</td>
        <td>${fmtDate(b.check_in)} → ${fmtDate(b.check_out)}</td>
        <td class="text-right">${b.nights} đêm</td>
        <td class="text-right">${fmtVND(b.rate_per_night)}</td>
        <td class="text-right">${fmtVND(b.room_total)}</td>
      </tr>`
    )
    .join('')

  const serviceRows = d.services.length
    ? d.services
        .map(
          (s) => `
          <tr>
            <td colspan="2">${s.name}</td>
            <td class="text-right">${s.quantity}</td>
            <td class="text-right">${fmtVND(s.unit_price)}</td>
            <td class="text-right">${fmtVND(s.total)}</td>
          </tr>`
        )
        .join('')
    : ''

  const discountRows = d.discounts
    .map(
      (disc) => `
      <tr>
        <td colspan="4" style="color:#d4380d">${disc.description}</td>
        <td class="text-right" style="color:#d4380d">-${fmtVND(disc.amount)}</td>
      </tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8">${BASE_CSS}</head>
<body>
  <div class="header">
    <div>
      <div class="hostel-name">${d.hostel_name}</div>
      <div class="hostel-meta">${d.hostel_address}</div>
      <div class="hostel-meta">📞 ${d.hostel_phone}</div>
    </div>
    <div>
      <div class="doc-title">XÁC NHẬN ĐẶT PHÒNG</div>
      <div class="doc-code">#${d.group_code ?? shortCode(d.group_id)} · ${fmtDatetime(d.created_at)}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Thông tin khách</div>
    <div class="info-grid">
      <span class="info-label">Họ tên:</span>
      <span class="info-value">${d.guest_name}</span>
      ${d.guest_phone ? `<span class="info-label">Điện thoại:</span><span class="info-value">${d.guest_phone}</span>` : ''}
      ${d.guest_email ? `<span class="info-label">Email:</span><span class="info-value">${d.guest_email}</span>` : ''}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Chi tiết đặt phòng</div>
    <table>
      <thead>
        <tr>
          <th>Phòng</th>
          <th>Thời gian</th>
          <th class="text-right">Số đêm</th>
          <th class="text-right">Giá/đêm</th>
          <th class="text-right">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        ${roomRows}
        ${serviceRows}
        ${discountRows}
        <tr class="total-row">
          <td colspan="4">Tổng cộng</td>
          <td class="text-right">${fmtVND(d.grand_total)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="summary-box">
      <div class="summary-row grand">
        <span>Tổng tiền phải thanh toán</span>
        <span>${fmtVND(d.grand_total)}</span>
      </div>
      ${d.total_paid > 0 ? `<div class="summary-row paid"><span>Đã thanh toán</span><span>${fmtVND(d.total_paid)}</span></div>` : ''}
      ${d.remaining > 0 ? `<div class="summary-row remaining"><span>Còn lại</span><span>${fmtVND(d.remaining)}</span></div>` : ''}
    </div>
  </div>

  <div class="footer">
    Cảm ơn bạn đã chọn ${d.hostel_name}! Mọi thắc mắc liên hệ ${d.hostel_phone}.
  </div>
</body>
</html>`
}

/** 2. Yêu cầu đặt cọc */
function renderDepositRequestHtml(d: DocumentData): string {
  const depositAmt = d.deposit_amount ?? Math.round(d.grand_total * 0.3)
  const deadline = d.deposit_deadline ? fmtDate(d.deposit_deadline) : 'trong vòng 24h'

  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8">${BASE_CSS}</head>
<body>
  <div class="header">
    <div>
      <div class="hostel-name">${d.hostel_name}</div>
      <div class="hostel-meta">${d.hostel_address}</div>
      <div class="hostel-meta">📞 ${d.hostel_phone}</div>
    </div>
    <div>
      <div class="doc-title">YÊU CẦU ĐẶT CỌC</div>
      <div class="doc-code">#${d.group_code ?? shortCode(d.group_id)} · ${fmtDatetime(d.created_at)}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Thông tin đặt phòng</div>
    <div class="info-grid">
      <span class="info-label">Khách:</span>
      <span class="info-value">${d.guest_name}</span>
      ${d.guest_phone ? `<span class="info-label">Điện thoại:</span><span class="info-value">${d.guest_phone}</span>` : ''}
      <span class="info-label">Check-in:</span>
      <span class="info-value">${fmtDate(d.bookings[0]?.check_in ?? d.created_at)}</span>
      <span class="info-label">Check-out:</span>
      <span class="info-value">${fmtDate(d.bookings[d.bookings.length - 1]?.check_out ?? d.created_at)}</span>
      <span class="info-label">Phòng:</span>
      <span class="info-value">${d.bookings.map((b) => b.room_name).join(', ')}</span>
      <span class="info-label">Tổng tiền phòng:</span>
      <span class="info-value">${fmtVND(d.grand_total)}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Số tiền cọc</div>
    <div class="highlight-box">
      <div style="color:#666">Vui lòng chuyển khoản đặt cọc để giữ phòng</div>
      <div class="highlight-amount">${fmtVND(depositAmt)}</div>
      <div style="color:#888;font-size:12px">Hạn cuối: <strong>${deadline}</strong></div>
    </div>

    ${(d.hostel_bank || d.hostel_account) ? `
    <div class="bank-box">
      <strong>Thông tin chuyển khoản:</strong><br/>
      ${d.hostel_bank ? `Ngân hàng: <strong>${d.hostel_bank}</strong><br/>` : ''}
      ${d.hostel_account ? `Số tài khoản: <strong>${d.hostel_account}</strong><br/>` : ''}
      ${d.hostel_account_name ? `Chủ tài khoản: <strong>${d.hostel_account_name}</strong><br/>` : ''}
      Nội dung CK: <strong>#${shortCode(d.group_id)} ${d.guest_name}</strong>
    </div>` : ''}
  </div>

  <div class="footer">
    Phòng chỉ được giữ sau khi nhận được tiền cọc. Liên hệ ${d.hostel_phone} nếu cần hỗ trợ.
  </div>
</body>
</html>`
}

/** 3. Xác nhận đặt cọc thành công */
function renderDepositConfirmationHtml(d: DocumentData): string {
  const depositAmt = d.deposit_amount ?? d.total_paid

  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8">${BASE_CSS}</head>
<body>
  <div class="header">
    <div>
      <div class="hostel-name">${d.hostel_name}</div>
      <div class="hostel-meta">${d.hostel_address}</div>
      <div class="hostel-meta">📞 ${d.hostel_phone}</div>
    </div>
    <div>
      <div class="doc-title">XÁC NHẬN ĐẶT CỌC</div>
      <div class="doc-code">#${d.group_code ?? shortCode(d.group_id)} · ${fmtDatetime(d.created_at)}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Đặt cọc thành công</div>
    <div class="highlight-box">
      <div><span class="tag-paid">✓ ĐÃ NHẬN</span></div>
      <div class="highlight-amount">${fmtVND(depositAmt)}</div>
      <div style="color:#666;font-size:12px">Khách: <strong>${d.guest_name}</strong></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Thông tin đặt phòng</div>
    <div class="info-grid">
      <span class="info-label">Mã đặt phòng:</span>
      <span class="info-value">#${d.group_code ?? shortCode(d.group_id)}</span>
      <span class="info-label">Check-in:</span>
      <span class="info-value">${fmtDate(d.bookings[0]?.check_in ?? d.created_at)}</span>
      <span class="info-label">Check-out:</span>
      <span class="info-value">${fmtDate(d.bookings[d.bookings.length - 1]?.check_out ?? d.created_at)}</span>
      <span class="info-label">Phòng:</span>
      <span class="info-value">${d.bookings.map((b) => `${b.room_name} (${b.room_number})`).join(', ')}</span>
      <span class="info-label">Tổng tiền:</span>
      <span class="info-value">${fmtVND(d.grand_total)}</span>
      <span class="info-label">Đã cọc:</span>
      <span class="info-value" style="color:#389e0d">${fmtVND(depositAmt)}</span>
      ${d.remaining > 0 ? `<span class="info-label">Còn lại (trả khi check-in):</span><span class="info-value" style="color:#d4380d">${fmtVND(d.remaining)}</span>` : ''}
    </div>
  </div>

  <div class="footer">
    Phòng đã được giữ cho bạn. Hẹn gặp lại tại ${d.hostel_name}! 📞 ${d.hostel_phone}
  </div>
</body>
</html>`
}

/** 4. Hoá đơn / Invoice */
function renderInvoiceHtml(d: DocumentData): string {
  const payments = d.payments ?? []

  const paymentRows = payments
    .map(
      (p) => `
      <tr>
        <td>${fmtDatetime(p.paid_at)}</td>
        <td>${fmtMethod(p.method)}</td>
        <td>${p.note ?? ''}</td>
        <td class="text-right">${fmtVND(p.amount)}</td>
      </tr>`
    )
    .join('')

  const roomRows = d.bookings
    .map(
      (b) => `
      <tr>
        <td>${b.room_name} (${b.room_number})</td>
        <td>${fmtDate(b.check_in)} → ${fmtDate(b.check_out)}</td>
        <td class="text-right">${b.nights}</td>
        <td class="text-right">${fmtVND(b.rate_per_night)}</td>
        <td class="text-right">${fmtVND(b.room_total)}</td>
      </tr>`
    )
    .join('')

  const serviceRows = d.services
    .map(
      (s) => `
      <tr>
        <td>${s.name}</td>
        <td>—</td>
        <td class="text-right">${s.quantity}</td>
        <td class="text-right">${fmtVND(s.unit_price)}</td>
        <td class="text-right">${fmtVND(s.total)}</td>
      </tr>`
    )
    .join('')

  const discountRows = d.discounts
    .map(
      (disc) => `
      <tr>
        <td colspan="4" style="color:#d4380d">${disc.description}</td>
        <td class="text-right" style="color:#d4380d">-${fmtVND(disc.amount)}</td>
      </tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8">${BASE_CSS}</head>
<body>
  <div class="header">
    <div>
      <div class="hostel-name">${d.hostel_name}</div>
      <div class="hostel-meta">${d.hostel_address}</div>
      <div class="hostel-meta">📞 ${d.hostel_phone}</div>
    </div>
    <div>
      <div class="doc-title">HOÁ ĐƠN THANH TOÁN</div>
      <div class="doc-code">#${d.group_code ?? shortCode(d.group_id)} · ${fmtDatetime(d.created_at)}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Thông tin khách</div>
    <div class="info-grid">
      <span class="info-label">Họ tên:</span>
      <span class="info-value">${d.guest_name}</span>
      ${d.guest_phone ? `<span class="info-label">Điện thoại:</span><span class="info-value">${d.guest_phone}</span>` : ''}
      ${d.guest_email ? `<span class="info-label">Email:</span><span class="info-value">${d.guest_email}</span>` : ''}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Chi tiết dịch vụ</div>
    <table>
      <thead>
        <tr>
          <th>Mô tả</th>
          <th>Thời gian</th>
          <th class="text-right">SL</th>
          <th class="text-right">Đơn giá</th>
          <th class="text-right">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        ${roomRows}
        ${serviceRows}
        ${discountRows}
        <tr class="total-row">
          <td colspan="4">TỔNG CỘNG</td>
          <td class="text-right">${fmtVND(d.grand_total)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${payments.length > 0 ? `
  <div class="section">
    <div class="section-title">Lịch sử thanh toán</div>
    <table>
      <thead>
        <tr>
          <th>Thời gian</th>
          <th>Phương thức</th>
          <th>Ghi chú</th>
          <th class="text-right">Số tiền</th>
        </tr>
      </thead>
      <tbody>
        ${paymentRows}
      </tbody>
    </table>
  </div>` : ''}

  <div class="section">
    <div class="summary-box">
      <div class="summary-row grand">
        <span>Tổng hoá đơn</span>
        <span>${fmtVND(d.grand_total)}</span>
      </div>
      <div class="summary-row paid">
        <span>Đã thanh toán</span>
        <span>${fmtVND(d.total_paid)}</span>
      </div>
      ${d.remaining > 0
        ? `<div class="summary-row remaining"><span>Còn lại</span><span>${fmtVND(d.remaining)}</span></div>`
        : `<div class="summary-row" style="color:#389e0d;font-weight:700"><span>✓ Đã thanh toán đủ</span><span></span></div>`
      }
    </div>
  </div>

  <div class="footer">
    ${d.hostel_name} · ${d.hostel_address} · ${d.hostel_phone}<br/>
    Cảm ơn quý khách đã lưu trú!
  </div>
</body>
</html>`
}

/** 5. Thông báo đến nơi / Arrival notice */
function renderArrivalNoticeHtml(d: DocumentData): string {
  const checkIn = d.bookings[0]?.check_in
  const checkOut = d.bookings[d.bookings.length - 1]?.check_out

  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8">${BASE_CSS}</head>
<body>
  <div class="header">
    <div>
      <div class="hostel-name">${d.hostel_name}</div>
      <div class="hostel-meta">${d.hostel_address}</div>
      <div class="hostel-meta">📞 ${d.hostel_phone}</div>
    </div>
    <div>
      <div class="doc-title">THÔNG BÁO CHECK-IN</div>
      <div class="doc-code">#${d.group_code ?? shortCode(d.group_id)}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Chào mừng khách</div>
    <div class="info-grid">
      <span class="info-label">Khách:</span>
      <span class="info-value">${d.guest_name}</span>
      <span class="info-label">Check-in:</span>
      <span class="info-value">${checkIn ? fmtDate(checkIn) : '—'} lúc 14:00</span>
      <span class="info-label">Check-out:</span>
      <span class="info-value">${checkOut ? fmtDate(checkOut) : '—'} lúc 12:00</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Phòng đã đặt</div>
    <table>
      <thead>
        <tr>
          <th>Phòng</th>
          <th>Check-in</th>
          <th>Check-out</th>
          <th class="text-right">Số đêm</th>
        </tr>
      </thead>
      <tbody>
        ${d.bookings
          .map(
            (b) => `
          <tr>
            <td><strong>${b.room_name}</strong> — ${b.room_number}</td>
            <td>${fmtDate(b.check_in)}</td>
            <td>${fmtDate(b.check_out)}</td>
            <td class="text-right">${b.nights}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </div>

  ${d.remaining > 0 ? `
  <div class="section">
    <div class="summary-box">
      <div class="summary-row remaining">
        <span>💳 Số tiền cần thanh toán khi check-in</span>
        <span>${fmtVND(d.remaining)}</span>
      </div>
    </div>
  </div>` : `
  <div class="section">
    <div class="summary-box">
      <div class="summary-row" style="color:#389e0d;font-weight:700">
        <span>✓ Đã thanh toán đủ — không cần trả thêm</span>
        <span></span>
      </div>
    </div>
  </div>`}

  <div class="footer">
    Hẹn gặp bạn tại ${d.hostel_name}! Mọi thắc mắc liên hệ ${d.hostel_phone}.
  </div>
</body>
</html>`
}

// ─── Zalo Text Templates ───────────────────────────────────────────────────────

function renderBookingConfirmationZalo(d: DocumentData): string {
  const rooms = d.bookings.map((b) => `• ${b.room_name} (${b.room_number}): ${fmtDate(b.check_in)} → ${fmtDate(b.check_out)}`).join('\n')
  return `✅ *XÁC NHẬN ĐẶT PHÒNG* — #${shortCode(d.group_id)}

Xin chào *${d.guest_name}*,

${d.hostel_name} xác nhận đã nhận đặt phòng của bạn:

${rooms}

💰 Tổng tiền: *${fmtVND(d.grand_total)}*${d.total_paid > 0 ? `\n✓ Đã cọc: *${fmtVND(d.total_paid)}*` : ''}${d.remaining > 0 ? `\n⚠️ Còn lại: *${fmtVND(d.remaining)}* (thanh toán khi check-in)` : ''}

📞 Liên hệ nếu cần hỗ trợ: *${d.hostel_phone}*
Cảm ơn bạn đã chọn ${d.hostel_name}! 🏡`
}

function renderDepositRequestZalo(d: DocumentData): string {
  const depositAmt = d.deposit_amount ?? Math.round(d.grand_total * 0.3)
  const deadline = d.deposit_deadline ? fmtDate(d.deposit_deadline) : 'trong vòng 24h'
  const rooms = d.bookings.map((b) => `• ${b.room_name}: ${fmtDate(b.check_in)} → ${fmtDate(b.check_out)}`).join('\n')

  return `💳 *YÊU CẦU ĐẶT CỌC* — #${shortCode(d.group_id)}

Xin chào *${d.guest_name}*,

Để hoàn tất việc giữ phòng, vui lòng đặt cọc:

${rooms}
💰 Tổng tiền phòng: *${fmtVND(d.grand_total)}*
📌 Số tiền cọc: *${fmtVND(depositAmt)}*
⏰ Hạn cuối: *${deadline}*

${d.hostel_bank || d.hostel_account ? `🏦 *Thông tin chuyển khoản:*\n${d.hostel_bank ? `Ngân hàng: ${d.hostel_bank}\n` : ''}${d.hostel_account ? `STK: ${d.hostel_account}\n` : ''}${d.hostel_account_name ? `Chủ TK: ${d.hostel_account_name}\n` : ''}Nội dung: #${shortCode(d.group_id)} ${d.guest_name}` : ''}

Phòng chỉ được giữ sau khi nhận được tiền cọc.
📞 Liên hệ: *${d.hostel_phone}*`
}

function renderDepositConfirmationZalo(d: DocumentData): string {
  const depositAmt = d.deposit_amount ?? d.total_paid
  const rooms = d.bookings.map((b) => `• ${b.room_name} (${b.room_number}): ${fmtDate(b.check_in)} → ${fmtDate(b.check_out)}`).join('\n')

  return `✅ *XÁC NHẬN ĐÃ NHẬN CỌC* — #${shortCode(d.group_id)}

Xin chào *${d.guest_name}*,

${d.hostel_name} đã nhận được tiền cọc *${fmtVND(depositAmt)}* của bạn. Phòng đã được giữ! 🎉

${rooms}
💰 Tổng tiền: *${fmtVND(d.grand_total)}*
✓ Đã cọc: *${fmtVND(depositAmt)}*${d.remaining > 0 ? `\n⚠️ Còn lại: *${fmtVND(d.remaining)}* (thanh toán khi check-in)` : '\n✓ Đã thanh toán đủ!'}

Hẹn gặp bạn tại ${d.hostel_name}! 🏡
📞 ${d.hostel_phone}`
}

function renderInvoiceZalo(d: DocumentData): string {
  const rooms = d.bookings.map((b) => `• ${b.room_name}: ${b.nights} đêm × ${fmtVND(b.rate_per_night)} = ${fmtVND(b.room_total)}`).join('\n')
  const services = d.services.length
    ? '\n' + d.services.map((s) => `• ${s.name}: ${fmtVND(s.total)}`).join('\n')
    : ''
  const discounts = d.discounts.length
    ? '\n' + d.discounts.map((disc) => `• 🎁 ${disc.description}: -${fmtVND(disc.amount)}`).join('\n')
    : ''

  return `🧾 *HOÁ ĐƠN THANH TOÁN* — #${shortCode(d.group_id)}

Khách: *${d.guest_name}*
Ngày: ${fmtDatetime(d.created_at)}

─────────────────────
${rooms}${services}${discounts}
─────────────────────
💰 Tổng cộng: *${fmtVND(d.grand_total)}*
${d.total_paid > 0 ? `✓ Đã thanh toán: *${fmtVND(d.total_paid)}*` : ''}${d.remaining > 0 ? `\n⚠️ Còn lại: *${fmtVND(d.remaining)}*` : '\n✅ Đã thanh toán đủ'}

Cảm ơn bạn đã lưu trú tại ${d.hostel_name}! 🙏
📞 ${d.hostel_phone}`
}

function renderArrivalNoticeZalo(d: DocumentData): string {
  const checkIn = d.bookings[0]?.check_in
  const checkOut = d.bookings[d.bookings.length - 1]?.check_out
  const rooms = d.bookings.map((b) => `• ${b.room_name} (${b.room_number})`).join('\n')

  return `🏡 *THÔNG BÁO CHECK-IN* — #${shortCode(d.group_id)}

Xin chào *${d.guest_name}*,

${d.hostel_name} rất vui được đón bạn!

📅 Check-in: *${checkIn ? fmtDate(checkIn) : '—'}* lúc 14:00
📅 Check-out: *${checkOut ? fmtDate(checkOut) : '—'}* lúc 12:00

🛏 Phòng của bạn:
${rooms}

${d.remaining > 0
    ? `💳 Vui lòng thanh toán khi check-in: *${fmtVND(d.remaining)}*`
    : '✅ Bạn đã thanh toán đủ — không cần trả thêm!'}

📍 Địa chỉ: ${d.hostel_address}
📞 ${d.hostel_phone}

Hẹn gặp bạn sớm! 🎉`
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Render HTML string từ DocumentData + DocKind */
export function renderDocumentHtml(kind: DocKind, data: DocumentData): string {
  switch (kind) {
    case 'booking_confirmation':
      return renderBookingConfirmationHtml(data)
    case 'deposit_request':
      return renderDepositRequestHtml(data)
    case 'deposit_confirmation':
      return renderDepositConfirmationHtml(data)
    case 'invoice':
      return renderInvoiceHtml(data)
    case 'arrival_notice':
      return renderArrivalNoticeHtml(data)
    default:
      throw new Error(`Unknown doc kind: ${kind}`)
  }
}

/** Render Zalo text từ DocumentData + DocKind */
export function renderDocumentZalo(kind: DocKind, data: DocumentData): string {
  switch (kind) {
    case 'booking_confirmation':
      return renderBookingConfirmationZalo(data)
    case 'deposit_request':
      return renderDepositRequestZalo(data)
    case 'deposit_confirmation':
      return renderDepositConfirmationZalo(data)
    case 'invoice':
      return renderInvoiceZalo(data)
    case 'arrival_notice':
      return renderArrivalNoticeZalo(data)
    default:
      throw new Error(`Unknown doc kind: ${kind}`)
  }
}

/** Label hiển thị cho từng DocKind */
export const DOC_KIND_LABELS: Record<DocKind, string> = {
  booking_confirmation: 'Xác nhận đặt phòng',
  deposit_request: 'Yêu cầu đặt cọc',
  deposit_confirmation: 'Xác nhận đã cọc',
  invoice: 'Hoá đơn thanh toán',
  arrival_notice: 'Thông báo check-in',
    }
