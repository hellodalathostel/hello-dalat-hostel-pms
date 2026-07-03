// src/features/documents/templates/groupTemplates.ts
// 3 template render cho document gắn với cả group (nhiều booking):
// group_invoice, group_confirmation, group_deposit_request (Zalo).
// Tách từ documentTemplates.ts (M4 — file splitting, không đổi logic).
//
// renderGroupInvoice: migrated sang shared.ts theme (xanh lá, Playfair Display)
// + UX v2 (badge Còn nợ, tách nhóm phòng/dịch vụ, "Số lượng", QR divider) — đồng
// bộ với renderInvoice (singleBookingTemplates.ts). Ngày migrate: xem git log.
// generateGroupZaloDeposit vẫn tự chứa formatter/label riêng (chưa migrate).
// renderGroupConfirmation dùng shared helpers (không đổi).

import dayjs from 'dayjs';
import type { GroupDocumentData, BookingServiceItem, BookingDiscountItem } from './shared';
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
  cancelPolicyHtml,
  qrBlockHtml,
  surchargeRow4Col,
} from './shared';
import type { DocKind } from '../documentGeneratorTypes';

// grandTotal = SUM(booking.grand_total) da tinh san trong GroupDocumentData
export function renderGroupInvoice(data: GroupDocumentData, lang: 'vi' | 'en' = 'vi'): string {
  const isEN = lang === 'en';
  const fmt = isEN ? fmtVND_EN : fmtVND;
  const fmtDate = isEN ? fmtDate_EN : fmtDate_VI;
  const fmtDateTime = isEN ? fmtDateTime_EN : fmtDateTime_VI;

  const invoiceNo = `HD-${data.groupId.slice(0, 8).toUpperCase()}`;
  const totalDebt = Math.max(0, data.totalGrandTotal - data.totalPaid);

  // addInfo ngắn gọn cho QR — lấy last name khách đại diện group
  const lastName = removeDiacritics(data.guestName).trim().split(/\s+/).pop() ?? '';
  const addInfo = `TT DOAN ${dayjs(data.checkIn).format('DDMM')} ${lastName}`;

  // Render từng phòng thành 1 block: dòng label "Phòng N: {roomName}" + dòng chi tiết + sub-rows
  const roomBlocks = data.bookings.map((b, i) => {
    const svcRows = b.services.map(s => `
          <tr>
            <td>${s.name}</td>
            <td class="tr">${fmt(s.price)}</td>
            <td class="tc">${s.qty}</td>
            <td class="tr">${fmt(s.price * s.qty)}</td>
          </tr>`).join('');

    const discRows = b.discounts.map(disc => `
          <tr>
            <td style="color:#0a4d1a;font-weight:500">${isEN ? 'Discount' : 'Giảm giá'}: ${disc.description ?? '—'}</td>
            <td class="tr">—</td><td class="tc">—</td>
            <td class="tr" style="color:#0a4d1a">−${fmt(disc.amount)}</td>
          </tr>`).join('');

    return `
          <tr class="group-label-row"><td colspan="4">${isEN ? `Room ${i + 1}` : `Phòng ${i + 1}`}: ${b.roomName}</td></tr>
          <tr>
            <td>${b.roomName} <span style="color:#6a5a40">(${b.roomType})</span>
              <br><small style="color:#8a7a60">${b.nights} ${isEN ? 'nights' : 'đêm'} (${fmtDate(b.checkIn)} → ${fmtDate(b.checkOut)})</small>
            </td>
            <td class="tr">${fmt(b.pricePerNight)}</td>
            <td class="tc">${b.nights}</td>
            <td class="tr">${fmt(b.roomSubtotal)}</td>
          </tr>
          ${surchargeRow4Col(b.surcharge, lang)}
          ${b.services.length > 0 ? `<tr class="group-label-row"><td colspan="4">${isEN ? 'Additional Services' : 'Dịch vụ phát sinh'}</td></tr>` : ''}
          ${svcRows}
          ${discRows}
          <tr class="paid-row">
            <td colspan="3" class="tr">${isEN ? 'Room total' : 'Tổng booking này'}</td>
            <td class="tr"><strong>${fmt(b.grandTotal)}</strong></td>
          </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8">
  <title>${isEN ? 'Group Invoice' : 'Hóa đơn tổng hợp'}</title>${BASE_STYLE}</head><body>
  ${htmlHeader(lang)}

  <div class="inv-docbar">
    <div class="inv-doc-title">${isEN ? 'Group Invoice' : 'Hóa đơn thanh toán (đoàn)'}</div>
    <div class="inv-doc-meta">
      <div>${isEN ? 'No.' : 'Số HĐ:'} ${invoiceNo}</div>
      <div>${fmtDateTime(data.generatedAt)}</div>
    </div>
  </div>

  <div class="inv-body">
    <div class="section">
      <div class="section-label">${isEN ? 'Billed To' : 'Thông tin khách'}</div>
      <div class="info-grid">
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Group / Guest Name' : 'Tên đoàn / khách'}</div>
          <div class="info-val">${data.guestName || '—'}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Phone' : 'Số điện thoại'}</div>
          <div class="info-val">${data.guestPhone || '—'}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Rooms' : 'Số phòng'}</div>
          <div class="info-val">${data.bookings.length}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Status' : 'Trạng thái'}</div>
          <div class="info-val">${totalDebt <= 0
            ? `<span class="inv-tag tag-paid">${isEN ? 'Fully paid' : 'Đã thanh toán đủ'}</span>`
            : `<span class="inv-tag tag-pending">${isEN ? 'Balance due' : 'Còn nợ'}</span>`
          }</div>
        </div>
        <div class="info-cell">
          <div class="info-key">Check-in</div>
          <div class="info-val">${fmtDate(data.checkIn)}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">Check-out</div>
          <div class="info-val">${fmtDate(data.checkOut)}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-label">${isEN ? 'Itemised Charges' : 'Chi tiết sử dụng'}</div>
      <table class="line-table">
        <thead><tr>
          <th>${isEN ? 'Description' : 'Mô tả'}</th>
          <th class="tr">${isEN ? 'Unit price' : 'Đơn giá'}</th>
          <th class="tc">${isEN ? 'Quantity' : 'Số lượng'}</th>
          <th class="tr">${isEN ? 'Amount' : 'Thành tiền'}</th>
        </tr></thead>
        <tbody>
          ${roomBlocks}
          <tr class="total-row">
            <td colspan="3"><strong>${isEN ? 'GRAND TOTAL' : 'TỔNG CỘNG'}</strong></td>
            <td class="tr"><strong>${fmt(data.totalGrandTotal)}</strong></td>
          </tr>
          ${data.totalPaid > 0 ? `
          <tr class="paid-row">
            <td colspan="3" class="tr">${isEN ? 'Paid' : 'Đã thanh toán'}</td>
            <td class="tr">−${fmt(data.totalPaid)}</td>
          </tr>` : ''}
          <tr class="${totalDebt <= 0 ? 'paid-row' : 'due-row'}">
            <td colspan="3" class="tr"><strong>${isEN ? 'Balance due' : 'CÒN LẠI'}</strong></td>
            <td class="tr"><strong>${fmt(totalDebt)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    ${totalDebt > 0 ? `
    <div class="section">
      <div class="section-label">${isEN ? 'Pay Balance' : 'Thanh toán số tiền còn lại'}</div>
      ${qrBlockHtml(totalDebt, addInfo, undefined, lang, data.totalGrandTotal)}
      ${isEN ? `<p style="font-size:10.5px;color:#5a4a30;margin-top:8px">Cash is also accepted at the front desk. Please keep this invoice as your receipt.</p>` : ''}
    </div>` : `
    <div class="callout callout-green">
      <div class="callout-icon">🎉</div>
      <span class="callout-text">${isEN ? 'Fully paid. Thank you!' : 'Đã thanh toán đủ. Cảm ơn quý khách!'}</span>
    </div>`}

    <p style="text-align:center;margin-top:16px;font-size:12px;color:#5a4a30;font-style:italic">
      ${isEN
        ? `Thank you for staying with us — hope to see you again in Da Lat!`
        : `Cảm ơn quý khách đã lưu trú tại Hello Dalat Hostel. Hẹn gặp lại!`}
    </p>
  </div>

  ${htmlFooter(`${invoiceNo}`, lang)}
</body></html>`;

  return html;
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

  // Chính sách huỷ — dùng chung shared.ts, khớp quyết định Brain 2026-06-14 (2-tier, không dùng 3-tier cũ)
  const cancelSection = cancelPolicyHtml(hasDepositGroup, lang);

  // addInfo ngắn gọn — đồng bộ pattern renderDepositRequest, tránh app ngân hàng cắt nội dung
  const lastNameGroup = removeDiacritics(data.guestName).trim().split(/\s+/).pop() ?? '';
  const addInfoGroup = `HD DOAN ${dayjs(data.checkIn).format('DDMM')} ${lastNameGroup}`;

  const qrSection = balGroup > 0 ? `
    <div class="section">
      <div class="section-label">${t.bankTitle}</div>
      <div class="qr-block">
        <div class="qr-img">
          <img src="${vietQrUrl(balGroup, addInfoGroup)}" alt="VietQR" />
        </div>
        <div class="qr-info">
          <div class="qr-row"><span class="qr-key">${isEn ? 'Amount' : 'Số tiền'}</span><span class="qr-val" style="font-weight:700">${fmtMoney(balGroup)}</span></div>
          <div class="qr-row"><span class="qr-key">${isEn ? 'Bank' : 'Ngân hàng'}</span><span class="qr-val">Vietcombank (VCB)</span></div>
          <div class="qr-row"><span class="qr-key">${isEn ? 'Account' : 'Số tài khoản'}</span><span class="qr-val">${VQR_ACCOUNT_DISPLAY}</span></div>
          <div class="qr-row"><span class="qr-key">${isEn ? 'Account Name' : 'Chủ TK'}</span><span class="qr-val">${VQR_OWNER}</span></div>
          <div class="qr-row"><span class="qr-key">${isEn ? 'Reference' : 'Nội dung CK'}</span><span class="qr-val" style="color:#0a3d1a;font-weight:600">${addInfoGroup}</span></div>
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