// src/features/documents/templates/groupTemplates.ts
// 3 template render cho document gắn với cả group (nhiều booking):
// group_invoice, group_confirmation, group_deposit_request (Zalo).
// Tách từ documentTemplates.ts (M4 — file splitting, không đổi logic).
//
// Lưu ý: renderGroupInvoice và generateGroupZaloDeposit tự chứa formatter/label
// riêng (code legacy, không dùng shared helpers) — KHÔNG refactor lại trong lần
// tách file này để giữ nguyên hành vi hiện tại. renderGroupConfirmation dùng
// shared helpers.

import dayjs from 'dayjs';
import type { GroupBookingRow, GroupDocumentData, BookingServiceItem, BookingDiscountItem } from './shared';
import {
  VQR_ACCOUNT_DISPLAY,
  VQR_OWNER,
  fmtVND,
  fmtVND_EN,
  fmtDate_VI,
  fmtDate_EN,
  fmtDateTime_VI,
  fmtDateTime_EN,
  removeDiacritics,
  vietQrUrl,
  BASE_STYLE,
  htmlHeader,
  htmlFooter,
  houseRulesHtml,
} from './shared';
import type { DocKind } from '../documentGeneratorTypes';

// grandTotal = SUM(booking.grand_total) da tinh san trong GroupDocumentData
export function renderGroupInvoice(data: GroupDocumentData, lang: 'vi' | 'en' = 'vi'): string {
  const isEn = lang === 'en';

  const t = {
    title:         isEn ? 'GROUP INVOICE' : 'HOA DON TONG HOP',
    hostelName:    'Hello Dalat Hostel',
    hostelAddr:    '33/18/2 Phan Dinh Phung, P.1, Da Lat',
    hostelPhone:   '0969 975 935',
    hostelEmail:   'hellodalathostel@gmail.com',
    groupLabel:    isEn ? 'Group' : 'Ten doan',
    invoiceDate:   isEn ? 'Issue Date' : 'Ngay xuat',
    checkIn:       isEn ? 'Check-in' : 'Nhan phong',
    checkOut:      isEn ? 'Check-out' : 'Tra phong',
    room:          isEn ? 'Room' : 'Phong',
    guest:         isEn ? 'Guest' : 'Khach',
    nights:        isEn ? 'Nights' : 'Dem',
    pricePerNight: isEn ? 'Rate/Night' : 'Gia/dem',
    roomSubtotal:  isEn ? 'Room Total' : 'Tien phong',
    surcharge:     isEn ? 'Surcharge' : 'Phu thu',
    services:      isEn ? 'Services' : 'Dich vu',
    discount:      isEn ? 'Discount' : 'Giam gia',
    bookingTotal:  isEn ? 'Booking Total' : 'Tong booking',
    grandTotal:    isEn ? 'GRAND TOTAL' : 'TONG CONG',
    paid:          isEn ? 'Paid' : 'Da thanh toan',
    debt:          isEn ? 'REMAINING' : 'CON LAI',
    no:            isEn ? 'No.' : 'STT',
    note:          isEn ? 'Note' : 'Ghi chu',
    thankYou:      isEn ? 'Thank you for your stay!' : 'Cam on quy khach da luu tru!',
  };

  const payload = data as GroupDocumentData & {
    issueDate?: string;
    groupName?: string;
    note?: string;
    totalDebt?: number;
    bookings: Array<GroupBookingRow & {
      guestName?: string;
      services: Array<{
        serviceName?: string;
        quantity?: number;
        totalPrice?: number;
      }>;
      discounts: Array<{
        discountName?: string;
        amount: number;
      }>;
    }>;
  };

  // Formatter
  const fmt = (n: number) => n.toLocaleString('vi-VN') + ' ₫';
  const fmtDate = (d: string) => {
    const [y, m, day] = d.split('-');
    return isEn ? `${day}/${m}/${y}` : `${day}/${m}/${y}`;
  };

  // Render tung booking row (co the expand services/discounts)
  const bookingRows = payload.bookings.map((b, i) => {
    // Sub-rows cho services (neu co)
    const svcRows = b.services.map(s => `
    <tr class="sub-row">
      <td colspan="5" class="sub-label">+ ${s.name ?? ''} x ${s.qty ?? 0}</td>
      <td class="amount">${fmt(s.price ?? 0)}</td>
    </tr>`).join('');

    // Sub-rows cho discounts (neu co)
    const discRows = b.discounts.map(d => `
    <tr class="sub-row">
      <td colspan="5" class="sub-label disc">- ${d.description ?? '—'}</td>
      <td class="amount disc">-${fmt(d.amount)}</td>
    </tr>`).join('');

    return `
    <tr class="booking-row">
      <td class="center">${i + 1}</td>
      <td>${b.roomName}</td>
      <td>${b.roomType || '—'}</td>
      <td>${fmtDate(b.checkIn)} → ${fmtDate(b.checkOut)}<br/><small>${b.nights}n</small></td>
      <td class="amount">${fmt(b.pricePerNight)}<br/><small>x ${b.nights}</small></td>
      <td class="amount"><strong>${fmt(b.grandTotal)}</strong></td>
    </tr>
    ${b.surcharge > 0 ? `
    <tr class="sub-row">
      <td colspan="5" class="sub-label">+ ${t.surcharge}</td>
      <td class="amount">${fmt(b.surcharge)}</td>
    </tr>` : ''}
    ${svcRows}
    ${discRows}`;
  }).join('');

  const totalDebt = payload.totalDebt ?? (payload.totalGrandTotal - payload.totalPaid);

  // Dong debt — highlight do neu con no
  const debtStyle = totalDebt > 0
    ? 'color:#c0392b; font-weight:700;'
    : 'color:#27ae60; font-weight:700;';

  return `
<html>
  <head>
    <meta charset="UTF-8" />
    <title>${t.title}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 13px;
        color: #1a1a1a;
        padding: 32px 40px;
        max-width: 860px;
        margin: auto;
      }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
      .hostel-info h1 { font-size: 18px; font-weight: 700; color: #1a5276; }
      .hostel-info p { font-size: 12px; color: #555; line-height: 1.6; }
      .doc-title { text-align: right; }
      .doc-title h2 { font-size: 22px; font-weight: 800; color: #1a5276; letter-spacing: 1px; }
      .doc-title p { font-size: 12px; color: #777; margin-top: 4px; }
      .meta-strip {
        background: #eaf0fb;
        border-radius: 6px;
        padding: 10px 16px;
        display: flex;
        gap: 32px;
        margin-bottom: 20px;
        flex-wrap: wrap;
      }
      .meta-strip .item { font-size: 12px; }
      .meta-strip .item strong { display: block; color: #1a5276; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
      thead th {
        background: #1a5276;
        color: #fff;
        padding: 8px 10px;
        text-align: left;
        font-size: 12px;
        font-weight: 600;
      }
      thead th.center, td.center { text-align: center; }
      thead th.amount, td.amount { text-align: right; }
      tbody tr.booking-row { background: #fff; }
      tbody tr.booking-row:nth-child(odd) { background: #f7f9fd; }
      tbody td {
        padding: 8px 10px;
        border-bottom: 1px solid #e8ecf4;
        vertical-align: top;
        font-size: 12.5px;
      }
      tbody td small { color: #888; font-size: 11px; }
      tr.sub-row td {
        padding: 3px 10px 3px 24px;
        border-bottom: none;
        font-size: 11.5px;
      }
      .sub-label { color: #555; font-style: italic; }
      .sub-label.disc { color: #c0392b; }
      .amount.disc { color: #c0392b; }
      .totals {
        margin-top: 16px;
        display: flex;
        justify-content: flex-end;
      }
      .totals table { width: 320px; }
      .totals td {
        padding: 5px 10px;
        font-size: 13px;
        border: none;
      }
      .totals .label { color: #555; }
      .totals .val { text-align: right; font-weight: 600; }
      .totals .grand td { font-size: 15px; border-top: 2px solid #1a5276; padding-top: 10px; }
      .totals .grand .label { color: #1a5276; font-weight: 700; }
      .totals .grand .val { color: #1a5276; font-weight: 800; }
      .totals .debt td { padding-top: 4px; }
      .note-box {
        margin-top: 20px;
        background: #fffbea;
        border-left: 3px solid #f1c40f;
        padding: 8px 12px;
        font-size: 12px;
        color: #555;
        border-radius: 0 4px 4px 0;
      }
      .footer {
        margin-top: 32px;
        text-align: center;
        font-size: 11.5px;
        color: #888;
        border-top: 1px solid #e0e0e0;
        padding-top: 12px;
      }
      .qr-section {
        margin-top: 20px;
        background: #f7f4ef;
        border: 0.5px solid #e0d8c8;
        border-radius: 6px;
        padding: 16px;
        display: flex;
        gap: 18px;
        align-items: flex-start;
      }
      .qr-section img {
        width: 220px;
        height: 220px;
        border: 0.5px solid #d0c8b8;
        border-radius: 4px;
        background: #fff;
        flex-shrink: 0;
      }
      .qr-details { flex: 1; }
      .qr-details .qr-amount {
        font-size: 22px;
        font-weight: 700;
        color: #0a3d1a;
        margin-bottom: 10px;
        line-height: 1;
      }
      .qr-details .qr-row {
        display: flex;
        gap: 8px;
        margin-bottom: 4px;
        font-size: 12px;
      }
      .qr-details .qr-key { color: #6a5a40; width: 110px; flex-shrink: 0; }
      .qr-details .qr-val { font-weight: 500; color: #1a1a1a; }
      .qr-details .qr-ref { font-weight: 700; color: #0a3d1a; }
      .qr-details .qr-note {
        font-size: 10.5px;
        color: #5a4a30;
        margin-top: 8px;
        border-top: 0.5px solid #e0d8c8;
        padding-top: 7px;
        line-height: 1.5;
      }
      .qr-section-label {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 2px;
        color: #2d6a4f;
        margin-bottom: 10px;
      }
      @media print {
        body { padding: 16px 20px; }
        .no-print { display: none; }
        .qr-section { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="hostel-info">
        <h1>${t.hostelName}</h1>
        <p>${t.hostelAddr}</p>
        <p>${t.hostelPhone} · ${t.hostelEmail}</p>
      </div>
      <div class="doc-title">
        <h2>${t.title}</h2>
        <p>${t.invoiceDate}: ${fmtDate(payload.generatedAt.split('T')[0])}</p>
      </div>
    </div>

    <div class="meta-strip">
      <div class="item"><strong>${t.groupLabel}</strong>${payload.guestName || '—'}</div>
      <div class="item"><strong>${t.checkIn}</strong>${fmtDate(payload.checkIn)}</div>
      <div class="item"><strong>${t.checkOut}</strong>${fmtDate(payload.checkOut)}</div>
      <div class="item"><strong>${isEn ? 'Rooms' : 'So phong'}</strong>${payload.bookings.length}</div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="center">${t.no}</th>
          <th>${t.room}</th>
          <th>${t.guest}</th>
          <th>${t.checkIn} / ${t.checkOut}</th>
          <th class="amount">${t.pricePerNight}</th>
          <th class="amount">${t.bookingTotal}</th>
        </tr>
      </thead>
      <tbody>
        ${bookingRows}
      </tbody>
    </table>

    <div class="totals">
      <table>
        <tr class="grand">
          <td class="label">${t.grandTotal}</td>
          <td class="val">${fmt(payload.totalGrandTotal)}</td>
        </tr>
        <tr>
          <td class="label">✓ ${t.paid}</td>
          <td class="val">${fmt(payload.totalPaid)}</td>
        </tr>
        <tr class="debt">
          <td class="label" style="${debtStyle}">${t.debt}</td>
          <td class="val" style="${debtStyle}">${fmt(totalDebt)}</td>
        </tr>
      </table>
    </div>


    ${totalDebt > 0 ? (() => {
      const lastName = removeDiacritics(payload.guestName).trim().split(/\s+/).pop() ?? '';
      const qrAddInfo = `TT DOAN ${dayjs(payload.checkIn).format('DDMM')} ${lastName}`;
      const qrUrl = `https://img.vietqr.io/image/VCB-9969975935-print.png?amount=${totalDebt}&addInfo=${encodeURIComponent(removeDiacritics(qrAddInfo))}&accountName=${encodeURIComponent('NGUYEN THANH HIEU')}`;
      return `
      <div>
        <div class="qr-section-label" style="margin-top:20px">${isEn ? 'Payment' : 'Thanh toán số còn lại'}</div>
        <div class="qr-section">
          <img src="${qrUrl}" alt="QR thanh toán" />
          <div class="qr-details">
            <div class="qr-amount">${fmt(totalDebt)}</div>
            <div class="qr-row">
              <span class="qr-key">${isEn ? 'Bank' : 'Ngân hàng'}</span>
              <span class="qr-val">Vietcombank (VCB)</span>
            </div>
            <div class="qr-row">
              <span class="qr-key">${isEn ? 'Account No.' : 'Số tài khoản'}</span>
              <span class="qr-val" style="font-weight:700;letter-spacing:1px">9969 975 935</span>
            </div>
            <div class="qr-row">
              <span class="qr-key">${isEn ? 'Account Name' : 'Chủ TK'}</span>
              <span class="qr-val">NGUYEN THANH HIEU</span>
            </div>
            <div class="qr-row">
              <span class="qr-key">${isEn ? 'Reference' : 'Nội dung CK'}</span>
              <span class="qr-val qr-ref">${qrAddInfo}</span>
            </div>
            <p class="qr-note">${isEn
              ? `Scan QR with any Vietnamese banking app. After transferring, please send a screenshot to WhatsApp/Zalo +84 969 975 935.`
              : `Scan QR bằng app ngân hàng để chuyển khoản. Sau khi chuyển, gửi ảnh xác nhận qua Zalo 0969 975 935.`
            }</p>
          </div>
        </div>
      </div>`;
    })() : ''}

    <div class="footer">
      <p>${t.thankYou}</p>
      <p>${t.hostelName} · ${t.hostelAddr}</p>
    </div>
  </body>
</html>
`;
}

// ─── renderGroupConfirmation ─────────────────────────────────────────────────
// Popup preview → Print/PDF cho xác nhận đặt phòng đoàn
export function renderGroupConfirmation(data: GroupDocumentData, lang: 'vi' | 'en' = 'vi'): string {
  const isEn = lang === 'en';
  const fmtDate = isEn ? fmtDate_EN : fmtDate_VI;
  const fmtMoney = isEn ? fmtVND_EN : fmtVND;

  const t = {
    title:        isEn ? 'Booking Confirmation'    : 'Xác Nhận Đặt Phòng',
    refLabel:     isEn ? 'Reference'               : 'Mã tham chiếu',
    guestLabel:   isEn ? 'Guest'                   : 'Khách đặt',
    phoneLabel:   isEn ? 'Phone'                   : 'Điện thoại',
    sourceLabel:  isEn ? 'Source'                  : 'Kênh đặt',
    stayLabel:    isEn ? 'Stay Period'             : 'Thời gian lưu trú',
    issuedLabel:  isEn ? 'Issued'                  : 'Ngày lập',
    roomsTitle:   isEn ? 'Room Details'            : 'Chi tiết phòng',
    roomCol:      isEn ? 'Room'                    : 'Phòng',
    checkinCol:   isEn ? 'Check-in'                : 'Check-in',
    checkoutCol:  isEn ? 'Check-out'               : 'Check-out',
    nightsCol:    isEn ? 'Nights'                  : 'Đêm',
    priceCol:     isEn ? 'Rate/night'              : 'Giá/đêm',
    subtotalCol:  isEn ? 'Subtotal'                : 'Tiền phòng',
    svcTitle:     isEn ? 'Additional Services'     : 'Dịch vụ thêm',
    svcName:      isEn ? 'Service'                 : 'Dịch vụ',
    svcQty:       isEn ? 'Qty'                     : 'SL',
    svcPrice:     isEn ? 'Unit price'              : 'Đơn giá',
    svcTotal:     isEn ? 'Total'                   : 'Thành tiền',
    discTitle:    isEn ? 'Discounts'               : 'Giảm giá',
    totalLabel:   isEn ? 'Total Amount'            : 'Tổng cộng',
    cancelTitle:  isEn ? 'Cancellation Policy'     : 'Chính sách huỷ phòng',
    cancelPeriod: isEn ? 'Notice period'           : 'Thời gian báo huỷ',
    cancelRefund: isEn ? 'Refund'                  : 'Hoàn tiền',
    calloutMsg:   isEn
      ? 'Please reply to confirm your booking. This confirmation is valid for 24 hours.'
      : 'Vui lòng xác nhận lại để giữ phòng. Thông tin đặt phòng có hiệu lực trong 24 giờ.',
    bankTitle:    isEn ? 'Deposit Payment'         : 'Thanh toán cọc',
    bankNote:     isEn
      ? `Transfer reference: Your name or phone number`
      : `Nội dung CK: Tên hoặc SĐT của bạn`,
  };

  // Services gộp từ tất cả bookings (dedup theo tên)
  const allServices: BookingServiceItem[] = [];
  data.bookings.forEach(b => {
    b.services.forEach(s => {
      const existing = allServices.find(x => x.name === s.name);
      if (existing) {
        existing.qty += s.qty;
      } else {
        allServices.push({ ...s });
      }
    });
  });
  const hasServices = allServices.length > 0;

  const allDiscounts: BookingDiscountItem[] = data.bookings.flatMap(b => b.discounts);
  const hasDiscounts = allDiscounts.length > 0;

  const refId = `HD-${data.groupId.slice(0, 8).toUpperCase()}`;

  const bookingRows = data.bookings.map(b => `
    <tr>
      <td><strong>${b.roomName}</strong></td>
      <td class="tc">${fmtDate(b.checkIn)}</td>
      <td class="tc">${fmtDate(b.checkOut)}</td>
      <td class="tc">${b.nights}</td>
      <td class="tr">${fmtMoney(b.pricePerNight)}</td>
      <td class="tr">${fmtMoney(b.roomSubtotal)}</td>
    </tr>
    ${b.surcharge > 0 ? `
    <tr class="surcharge-row">
      <td colspan="5" style="padding-left:24px;font-size:11.5px;color:#7a4500;">
        ${isEn ? 'Card fee' : 'Phụ thu thẻ'} — ${b.roomName}
      </td>
      <td class="tr">${fmtMoney(b.surcharge)}</td>
    </tr>` : ''}
  `).join('');

  const servicesSection = hasServices ? `
    <div class="section">
      <div class="section-label">${t.svcTitle}</div>
      <table class="line-table">
        <thead>
          <tr>
            <th>${t.svcName}</th>
            <th class="tc">${t.svcQty}</th>
            <th class="tr">${t.svcPrice}</th>
            <th class="tr">${t.svcTotal}</th>
          </tr>
        </thead>
        <tbody>
          ${allServices.map(s => `
          <tr>
            <td>${s.name}</td>
            <td class="tc">${s.qty}</td>
            <td class="tr">${fmtMoney(s.price)}</td>
            <td class="tr">${fmtMoney(s.price * s.qty)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const discountsSection = hasDiscounts ? `
    <div class="section">
      <div class="section-label">${t.discTitle}</div>
      <table class="line-table">
        <tbody>
          ${allDiscounts.map(d => `
          <tr>
            <td>${d.description ?? (isEn ? 'Discount' : 'Giảm giá')}</td>
            <td class="tr" style="color:#8b0000;">− ${fmtMoney(d.amount)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const balGroup = Math.max(0, data.totalGrandTotal - data.totalPaid);
  const hasDepositGroup = data.totalPaid > 0;
  const totalSection = `
    <table class="line-table" style="margin-bottom:20px;">
      <tbody>
        <tr class="total-row">
          <td>${t.totalLabel}</td>
          <td class="tr">${fmtMoney(data.totalGrandTotal)}</td>
        </tr>
        ${hasDepositGroup ? `
        <tr class="paid-row">
          <td>${isEn ? 'Deposit paid' : 'Đã đặt cọc'}</td>
          <td class="tr">−${fmtMoney(data.totalPaid)}</td>
        </tr>
        <tr class="due-row">
          <td><strong>${isEn ? 'Balance due at check-in' : 'Còn lại khi check-in'}</strong></td>
          <td class="tr"><strong>${fmtMoney(balGroup)}</strong></td>
        </tr>` : ''}
      </tbody>
    </table>`;

  const cancelSection = `
    <div class="section">
      <div class="section-label">${t.cancelTitle}</div>
      <table class="cancel-table">
        <thead>
          <tr>
            <th>${t.cancelPeriod}</th>
            <th>${t.cancelRefund}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${isEn ? 'More than 7 days before check-in' : 'Trước check-in > 7 ngày'}</td>
            <td class="refund-ok">${isEn ? '100% refund' : 'Hoàn 100%'}</td>
          </tr>
          <tr>
            <td>${isEn ? '3 – 7 days before check-in' : 'Trước check-in 3 – 7 ngày'}</td>
            <td style="color:#c07800;font-weight:700;">${isEn ? '50% refund' : 'Hoàn 50%'}</td>
          </tr>
          <tr>
            <td>${isEn ? 'Less than 3 days before check-in' : 'Trước check-in < 3 ngày'}</td>
            <td class="refund-none">${isEn ? 'Non-refundable' : 'Không hoàn tiền'}</td>
          </tr>
        </tbody>
      </table>
    </div>`;

  const qrSection = balGroup > 0 ? `
    <div class="section">
      <div class="section-label">${t.bankTitle}</div>
      <div class="qr-block">
        <div class="qr-img">
          <img src="${vietQrUrl(balGroup, `HD ${removeDiacritics(data.guestName)}`)}" alt="VietQR" />
        </div>
        <div class="qr-info">
          <div class="qr-row"><span class="qr-key">${isEn ? 'Amount' : 'Số tiền'}</span><span class="qr-val" style="font-weight:700">${fmtMoney(balGroup)}</span></div>
          <div class="qr-row"><span class="qr-key">${isEn ? 'Bank' : 'Ngân hàng'}</span><span class="qr-val">Vietcombank (VCB)</span></div>
          <div class="qr-row"><span class="qr-key">${isEn ? 'Account' : 'Số tài khoản'}</span><span class="qr-val">${VQR_ACCOUNT_DISPLAY}</span></div>
          <div class="qr-row"><span class="qr-key">${isEn ? 'Account Name' : 'Chủ TK'}</span><span class="qr-val">${VQR_OWNER}</span></div>
          <div class="qr-row"><span class="qr-key">${isEn ? 'Reference' : 'Nội dung CK'}</span><span class="qr-val" style="color:#0a3d1a;font-weight:600">HD ${removeDiacritics(data.guestName)}</span></div>
          <div class="qr-note">${t.bankNote}</div>
        </div>
      </div>
    </div>` : '';

  const calloutSection = `
    <div class="callout callout-amber">
      <div class="callout-icon">!</div>
      <div class="callout-text">${t.calloutMsg}</div>
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${t.title} — ${data.guestName}</title>
  ${BASE_STYLE}
</head>
<body>
  ${htmlHeader(lang)}
  <div class="inv-docbar">
    <span class="inv-doc-title">${t.title}</span>
    <div class="inv-doc-meta">
      <div>${t.refLabel}: <strong>${refId}</strong></div>
      <div>${t.issuedLabel}: ${isEn ? fmtDateTime_EN(data.generatedAt) : fmtDateTime_VI(data.generatedAt)}</div>
    </div>
  </div>
  <div class="inv-body">

    ${calloutSection}

    <div class="section" style="margin-top:16px;">
      <div class="info-grid">
        <div class="info-cell">
          <div class="info-key">${t.guestLabel}</div>
          <div class="info-val">${data.guestName}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">${t.phoneLabel}</div>
          <div class="info-val">${data.guestPhone || '—'}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">${t.stayLabel}</div>
          <div class="info-val">${fmtDate(data.checkIn)} → ${fmtDate(data.checkOut)}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">${t.sourceLabel}</div>
          <div class="info-val muted">${data.source}${data.otaBookingNumber ? ` · ${data.otaBookingNumber}` : ''}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-label">${t.roomsTitle}</div>
      <table class="line-table">
        <thead>
          <tr>
            <th>${t.roomCol}</th>
            <th class="tc">${t.checkinCol}</th>
            <th class="tc">${t.checkoutCol}</th>
            <th class="tc">${t.nightsCol}</th>
            <th class="tr">${t.priceCol}</th>
            <th class="tr">${t.subtotalCol}</th>
          </tr>
        </thead>
        <tbody>${bookingRows}</tbody>
      </table>
    </div>

    ${servicesSection}
    ${discountsSection}
    ${totalSection}
    ${qrSection}
    ${cancelSection}
    ${houseRulesHtml(lang)}

  </div>
  ${htmlFooter(undefined, lang)}
</body>
</html>`;

  return html;
}

// ─── generateGroupZaloDeposit ────────────────────────────────────────────────
// Tạo text Zalo yêu cầu đặt cọc đoàn — staff copy-paste
// depositAmount: số tiền cọc staff nhập thủ công
export function generateGroupZaloDeposit(
  data: GroupDocumentData,
  depositAmount: number
): string {
  const fmtNum = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

  const roomLines = data.bookings.map(b =>
    `🛏 ${b.roomName}: ${b.checkIn} → ${b.checkOut} (${b.nights} đêm) — ${fmtNum(b.roomSubtotal)}đ`
  ).join('\n');

  const allServices: BookingServiceItem[] = [];
  data.bookings.forEach(b => {
    b.services.forEach(s => {
      const existing = allServices.find(x => x.name === s.name);
      if (existing) {
        existing.qty += s.qty;
      } else {
        allServices.push({ ...s });
      }
    });
  });
  const serviceLines = allServices.length > 0
    ? '\n🔹 Dịch vụ thêm:\n' + allServices.map(s =>
        `   • ${s.name} × ${s.qty}: ${fmtNum(s.price * s.qty)}đ`
      ).join('\n')
    : '';

  const allDiscounts = data.bookings.flatMap(b => b.discounts);
  const discountLines = allDiscounts.length > 0
    ? '\n🏷 Giảm giá:\n' + allDiscounts.map(d =>
        `   • ${d.description ?? 'Giảm giá'}: −${fmtNum(d.amount)}đ`
      ).join('\n')
    : '';

  return `Xin chào ${data.guestName} 👋

Cảm ơn anh/chị đã đặt phòng tại Hello Dalat Hostel!

📋 Thông tin đặt phòng:
${roomLines}${serviceLines}${discountLines}

💰 Tổng tiền: ${fmtNum(data.totalGrandTotal)}đ
💳 Đặt cọc: ${fmtNum(depositAmount)}đ

Vui lòng chuyển khoản về:
🏦 Vietcombank — 9969 975 935
👤 NGUYEN THANH HIEU
📎 Nội dung: HD ${data.guestName}

Hostel sẽ xác nhận trong vòng 30 phút sau khi nhận cọc.
Mọi thắc mắc: 0969 975 935 (Zalo / Call)

Hello Dalat Hostel 🏡`;
}

export type { DocKind };