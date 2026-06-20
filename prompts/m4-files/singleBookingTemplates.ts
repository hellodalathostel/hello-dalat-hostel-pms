// src/features/documents/templates/singleBookingTemplates.ts
// 5 template render cho document gắn với 1 booking cụ thể:
// booking_confirmation, deposit_request, deposit_confirmation, invoice, arrival_notice.
// Tách từ documentTemplates.ts (M4 — file splitting, không đổi logic).

import type { DocumentData } from './shared';
import {
  HOSTEL_PHONE,
  HOSTEL_PHONE_INTL,
  fmtVND,
  fmtVND_EN,
  fmtDate_VI,
  fmtDate_EN,
  fmtDateTime_VI,
  fmtDateTime_EN,
  nightsLabel_VI,
  nightsLabel_EN,
  servicesTotal,
  remaining,
  BASE_STYLE,
  htmlHeader,
  htmlFooter,
  houseRulesHtml,
  cancelPolicyHtml,
  surchargeRow,
  surchargeRow4Col,
  qrBlockHtml,
} from './shared';

export function renderBookingConfirmation(d: DocumentData): { html: string; zaloText: string } {
  const lang = d.lang ?? 'vi';
  const isEN = lang === 'en';
  const hasDeposit = d.paid > 0;
  const bal = Math.max(0, remaining(d));
  const fmt = isEN ? fmtVND_EN : fmtVND;
  const fmtDate = isEN ? fmtDate_EN : fmtDate_VI;
  const fmtDateTime = isEN ? fmtDateTime_EN : fmtDateTime_VI;

  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8">
  <title>${isEN ? 'Booking Confirmation' : 'Xác nhận đặt phòng'}</title>${BASE_STYLE}</head><body>
  ${htmlHeader(lang)}

  <div class="inv-docbar">
    <div class="inv-doc-title">${isEN ? 'Booking Confirmation' : 'Xác nhận đặt phòng'}</div>
    <div class="inv-doc-meta">
      <div>${fmtDateTime(d.generatedAt)}</div>
      ${d.otaBookingNumber ? `<div>${isEN ? 'OTA Ref' : 'Mã OTA'}: ${d.otaBookingNumber}</div>` : ''}
    </div>
  </div>

  <div class="inv-body">
    <div class="section">
      <div class="section-label">${isEN ? 'Guest Information' : 'Thông tin khách'}</div>
      <div class="info-grid">
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Guest Name' : 'Họ tên'}</div>
          <div class="info-val">${d.guestName}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Phone / WhatsApp' : 'Số điện thoại'}</div>
          <div class="info-val">${d.guestPhone || '—'}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-label">${isEN ? 'Reservation Details' : 'Chi tiết đặt phòng'}</div>
      <div class="info-grid">
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Room' : 'Phòng'}</div>
          <div class="info-val">${d.roomName} <span class="info-val muted">(${d.roomType})</span></div>
        </div>
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Guests' : 'Số khách'}</div>
          <div class="info-val">${d.guestsCount} ${isEN ? 'adults' : 'người'}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">Check-in</div>
          <div class="info-val">${fmtDate(d.checkIn)} · ${isEN ? 'from' : 'từ'} 14:00${d.hasEarlyCheckIn ? ` <span class="badge badge-amber">${isEN ? 'Early CI' : 'Early'}</span>` : ''}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">Check-out</div>
          <div class="info-val">${fmtDate(d.checkOut)} · ${isEN ? 'by' : 'trước'} 12:00${d.hasLateCheckOut ? ` <span class="badge badge-amber">${isEN ? 'Late CO' : 'Late'}</span>` : ''}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Nights' : 'Số đêm'}</div>
          <div class="info-val">${d.nights} ${isEN ? 'nights' : 'đêm'}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Rate / night' : 'Giá / đêm'}</div>
          <div class="info-val">${fmt(d.pricePerNight)}</div>
        </div>
        <div class="info-cell full">
          <div class="info-key">${isEN ? 'Booking source' : 'Nguồn đặt phòng'}</div>
          <div class="info-val muted">${d.source}${d.otaBookingNumber ? ` · ${d.otaBookingNumber}` : ''}</div>
        </div>
      </div>
    </div>

    ${d.services.length > 0 ? `
    <div class="section">
      <div class="section-label">${isEN ? 'Additional Services' : 'Dịch vụ kèm theo'}</div>
      <table class="line-table">
        <thead><tr>
          <th>${isEN ? 'Service' : 'Dịch vụ'}</th>
          <th class="tr">${isEN ? 'Unit price' : 'Đơn giá'}</th>
          <th class="tc">${isEN ? 'Qty' : 'SL'}</th>
          <th class="tr">${isEN ? 'Amount' : 'Thành tiền'}</th>
        </tr></thead>
        <tbody>
          ${d.services.map(s => `
          <tr><td>${s.name}</td>
          <td class="tr">${fmt(s.price)}</td>
          <td class="tc">${s.qty}</td>
          <td class="tr">${fmt(s.price * s.qty)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <div class="section">
      <div class="section-label">${isEN ? 'Payment Summary' : 'Tổng thanh toán'}</div>
      <table class="line-table">
        <thead><tr>
          <th>${isEN ? 'Description' : 'Mô tả'}</th>
          <th class="tr">${isEN ? 'Amount' : 'Thành tiền'}</th>
        </tr></thead>
        <tbody>
          <tr><td>${isEN ? `Room charge (${d.nights} nights × ${fmt(d.pricePerNight)})` : `Tiền phòng (${d.nights} đêm × ${fmt(d.pricePerNight)})`}</td>
              <td class="tr">${fmt(d.roomSubtotal)}</td></tr>
          ${d.services.length > 0 ? `<tr><td>${isEN ? 'Additional services' : 'Dịch vụ'}</td><td class="tr">${fmt(servicesTotal(d.services))}</td></tr>` : ''}
          ${surchargeRow(d.surcharge, lang)}
          ${d.discounts.map(disc => `
          <tr><td style="color:#0a4d1a;font-weight:500">${isEN ? 'Discount' : 'Giảm giá'}${disc.description ? `: ${disc.description}` : ''}</td>
              <td class="tr" style="color:#0a4d1a">−${fmt(disc.amount)}</td></tr>`).join('')}
          <tr class="total-row">
            <td><strong>${isEN ? 'Total' : 'TỔNG CỘNG'}</strong></td>
            <td class="tr"><strong>${fmt(d.grandTotal)}</strong></td>
          </tr>
          ${hasDeposit ? `
          <tr class="paid-row">
            <td>${isEN ? 'Deposit paid' : 'Đã đặt cọc'}</td>
            <td class="tr">−${fmt(d.paid)}</td>
          </tr>
          <tr class="due-row">
            <td><strong>${isEN ? 'Balance due at check-in' : 'Còn lại khi check-in'}</strong></td>
            <td class="tr"><strong>${fmt(bal)}</strong></td>
          </tr>` : ''}
        </tbody>
      </table>
    </div>

    ${hasDeposit
      ? `<div class="callout callout-green"><div class="callout-icon">✓</div>
         <span class="callout-text">${isEN
           ? `Your room is confirmed and reserved. We look forward to welcoming you on <strong>${fmtDate(d.checkIn)}</strong>!`
           : `Chỗ của bạn đã được giữ chắc chắn. Hẹn gặp bạn ngày <strong>${fmtDate(d.checkIn)}</strong> tại Hello Dalat!`
         }</span></div>`
      : `<div class="callout callout-amber"><div class="callout-icon">!</div>
         <span class="callout-text">${isEN
           ? `<strong>Room not yet confirmed.</strong> Please send a deposit to secure your booking. Contact us at ${HOSTEL_PHONE_INTL}.`
           : `<strong>Chỗ chưa được giữ.</strong> Vui lòng đặt cọc để xác nhận booking. Liên hệ <strong>${HOSTEL_PHONE}</strong>.`
         }</span></div>`
    }

    <hr class="divider">
    ${houseRulesHtml(lang)}
    ${cancelPolicyHtml(hasDeposit, lang)}
  </div>

  ${htmlFooter(undefined, lang)}
</body></html>`;

  const zaloText = isEN
    ? `🏡 *BOOKING CONFIRMATION — ${HOSTEL_NAME}*

Hi ${d.guestName},

Here's your booking summary:

🛏 Room: ${d.roomName}
📅 Check-in: ${fmtDate_EN(d.checkIn)} (from 14:00)${d.hasEarlyCheckIn ? ' — Early check-in' : ''}
📅 Check-out: ${fmtDate_EN(d.checkOut)} (by 12:00)${d.hasLateCheckOut ? ' — Late check-out' : ''}
🌙 Nights: ${d.nights}
👥 Guests: ${d.guestsCount}
💰 Total: ${fmtVND_EN(d.grandTotal)}
${d.surcharge > 0 ? `💳 Card surcharge (4%): ${fmtVND_EN(d.surcharge)} included` : ''}
${hasDeposit ? `✅ Deposit paid: ${fmtVND_EN(d.paid)} — Balance due: ${fmtVND_EN(bal)}` : ''}
${d.otaBookingNumber ? `📋 Booking ref: ${d.otaBookingNumber}` : ''}

${hasDeposit
  ? `✅ Your room is confirmed! See you on ${fmtDate_EN(d.checkIn)}.

📋 House rules:
• Check-in 14:00 | Check-out by 12:00
• Quiet after 22:00 | No smoking indoors

🔄 Cancellation: 50% refund if cancelled 3+ days before check-in. Non-refundable within 3 days.`
  : `⚠️ Room not yet confirmed — please send a deposit to secure your stay.

🔄 Cancellation: 50% refund if cancelled 3+ days before check-in. Non-refundable within 3 days.`
}

Any questions: ${HOSTEL_PHONE_INTL} 🌿`
    : `🏡 *XÁC NHẬN ĐẶT PHÒNG — ${HOSTEL_NAME}*

Xin chào ${d.guestName},

🛏 Phòng: ${d.roomName}
📅 Check-in: ${fmtDate_VI(d.checkIn)} (từ 14:00)${d.hasEarlyCheckIn ? ' — Early check-in' : ''}
📅 Check-out: ${fmtDate_VI(d.checkOut)} (trước 12:00)${d.hasLateCheckOut ? ' — Late check-out' : ''}
🌙 Số đêm: ${d.nights}
👥 Số khách: ${d.guestsCount}
💰 Tổng tiền: ${fmtVND(d.grandTotal)}
${d.surcharge > 0 ? `💳 Phụ thu thẻ (4%): ${fmtVND(d.surcharge)} đã tính vào tổng` : ''}
${hasDeposit ? `✅ Đã cọc: ${fmtVND(d.paid)} — Còn lại: ${fmtVND(bal)}` : ''}
${d.otaBookingNumber ? `📋 Mã booking: ${d.otaBookingNumber}` : ''}

${hasDeposit
  ? `✅ Chỗ đã được giữ. Hẹn gặp bạn ngày ${fmtDate_VI(d.checkIn)}!

📋 Nội quy: Check-in 14:00 | Check-out trước 12:00 | Yên tĩnh sau 22:00

🔄 Huỷ phòng: Hoàn 50% nếu huỷ từ 3 ngày trở lên trước check-in. Không hoàn trong vòng 3 ngày.`
  : `⚠️ Chỗ chưa được giữ — vui lòng đặt cọc để xác nhận.

🔄 Huỷ phòng: Hoàn 50% nếu huỷ từ 3 ngày trở lên trước check-in. Không hoàn trong vòng 3 ngày.`
}

Mọi thắc mắc: ${HOSTEL_PHONE} 🌿`;

  return { html, zaloText };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE 2 — Deposit Request / Yêu cầu đặt cọc
// ═══════════════════════════════════════════════════════════════════════════════

export interface DepositRequestOptions {
  depositAmount: number;
  deadline: string;
  bankName?: string;
  bankAccount?: string;
  bankOwner?: string;
}

export function renderDepositRequest(
  d: DocumentData,
  opts: DepositRequestOptions
): { html: string; zaloText: string } {
  const lang = d.lang ?? 'vi';
  const isEN = lang === 'en';
  const fmt = isEN ? fmtVND_EN : fmtVND;
  const fmtDate = isEN ? fmtDate_EN : fmtDate_VI;
  const fmtDateTime = isEN ? fmtDateTime_EN : fmtDateTime_VI;
  const nightsLabel = isEN ? nightsLabel_EN(d) : nightsLabel_VI(d);
  // addInfo ngắn gọn để không bị ngân hàng cắt (max ~25 ký tự)
  const lastName = removeDiacritics(d.guestName).trim().split(/\s+/).pop() ?? '';
  const addInfo = `COC ${d.roomName} ${dayjs(d.checkIn).format('DDMM')} ${lastName}`;

  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8">
  <title>${isEN ? 'Deposit Request' : 'Yêu cầu đặt cọc'}</title>${BASE_STYLE}</head><body>
  ${htmlHeader(lang)}

  <div class="inv-docbar">
    <div class="inv-doc-title">${isEN ? 'Deposit Request' : 'Yêu cầu đặt cọc'}</div>
    <div class="inv-doc-meta"><div>${fmtDateTime(d.generatedAt)}</div></div>
  </div>

  <div class="inv-body">
    <div class="section">
      <div class="section-label">${isEN ? 'Reservation Summary' : 'Thông tin đặt phòng'}</div>
      <div class="info-grid">
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Guest' : 'Khách'}</div>
          <div class="info-val">${d.guestName}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Room' : 'Phòng'}</div>
          <div class="info-val">${d.roomName} <span class="info-val muted">(${d.roomType})</span></div>
        </div>
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Stay' : 'Thời gian'}</div>
          <div class="info-val">${nightsLabel}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Total charge' : 'Tổng tiền'}</div>
          <div class="info-val">${fmt(d.grandTotal)}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-label">${isEN ? 'How to Pay Your Deposit' : 'Thanh toán đặt cọc'}</div>
      ${qrBlockHtml(opts.depositAmount, addInfo, opts.deadline, lang, d.grandTotal)}
    </div>

    ${isEN ? `
    <div class="callout callout-blue">
      <div class="callout-icon">i</div>
      <span class="callout-text">If you're unable to do a bank transfer, please contact us directly — we'll find a solution together.</span>
    </div>` : ''}

    <div class="callout callout-amber">
      <div class="callout-icon">!</div>
      <span class="callout-text">${isEN
        ? `Your room is <strong>held but not yet confirmed</strong>. Deposit must be received by <strong>${fmtDate(opts.deadline)}</strong>.`
        : `Chỗ chỉ được giữ sau khi nhận cọc. Hạn chót: <strong>${fmtDate(opts.deadline)}</strong>.`
      }</span>
    </div>

    ${cancelPolicyHtml(false, lang)}
  </div>

  ${htmlFooter(undefined, lang)}
</body></html>`;

  const zaloText = isEN
    ? `💰 *DEPOSIT REQUEST — ${HOSTEL_NAME}*

Hi ${d.guestName},

To confirm your booking, please send a deposit:

🛏 Room: ${d.roomName}
📅 ${nightsLabel_EN(d)}
💵 Total: ${fmtVND_EN(d.grandTotal)}

Transfer details:
💰 *${fmtVND_EN(opts.depositAmount)}*
⏰ Deadline: *${fmtDate_EN(opts.deadline)}*

🏦 Vietcombank (VCB)
🔢 Account: *${VQR_ACCOUNT_DISPLAY}*
👤 ${VQR_OWNER}
📝 Reference: ${addInfo}

After transferring, please send a screenshot to confirm!

🔄 Cancellation: 50% refund if cancelled 3+ days before check-in. Non-refundable within 3 days.

Questions? ${HOSTEL_PHONE_INTL} 🌿`
    : `💰 *YÊU CẦU ĐẶT CỌC — ${HOSTEL_NAME}*

Xin chào ${d.guestName},

Để giữ chỗ, vui lòng chuyển khoản:
🛏 Phòng: ${d.roomName}
📅 ${nightsLabel_VI(d)}
💵 Tổng: ${fmtVND(d.grandTotal)}

💰 *${fmtVND(opts.depositAmount)}*
⏰ Hạn: *${fmtDate_VI(opts.deadline)}*

🏦 Vietcombank (VCB)
🔢 STK: *${VQR_ACCOUNT_DISPLAY}*
👤 ${VQR_OWNER}
📝 Nội dung: ${addInfo}

Sau khi chuyển, gửi ảnh xác nhận nhé!

🔄 Huỷ phòng: Hoàn 50% nếu huỷ từ 3 ngày trở lên trước check-in. Không hoàn trong vòng 3 ngày.

Mọi thắc mắc: ${HOSTEL_PHONE} 🌿`;

  return { html, zaloText };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE 3 — Deposit Receipt / Xác nhận nhận cọc
// ═══════════════════════════════════════════════════════════════════════════════

export function renderDepositConfirmation(d: DocumentData): { html: string; zaloText: string } {
  const lang = d.lang ?? 'vi';
  const isEN = lang === 'en';
  const fmt = isEN ? fmtVND_EN : fmtVND;
  const fmtDate = isEN ? fmtDate_EN : fmtDate_VI;
  const fmtDateTime = isEN ? fmtDateTime_EN : fmtDateTime_VI;
  const nightsLabel = isEN ? nightsLabel_EN(d) : nightsLabel_VI(d);
  const methodLabel = (m: string) =>
    (isEN ? PAYMENT_METHOD_LABEL_EN : PAYMENT_METHOD_LABEL)[m] ?? m;
  const bal = Math.max(0, remaining(d));

  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8">
  <title>${isEN ? 'Deposit Receipt' : 'Xác nhận nhận cọc'}</title>${BASE_STYLE}</head><body>
  ${htmlHeader(lang)}

  <div class="inv-docbar">
    <div class="inv-doc-title">${isEN ? 'Deposit Receipt' : 'Xác nhận nhận cọc'}</div>
    <div class="inv-doc-meta"><div>${isEN ? 'Confirmed' : 'Ngày xác nhận'}: ${fmtDateTime(d.generatedAt)}</div></div>
  </div>

  <div class="inv-body">
    <div class="section">
      <div class="section-label">${isEN ? 'Reservation' : 'Thông tin đặt phòng'}</div>
      <div class="info-grid">
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Guest' : 'Khách'}</div>
          <div class="info-val">${d.guestName}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Room' : 'Phòng'}</div>
          <div class="info-val">${d.roomName} <span class="info-val muted">(${d.roomType})</span></div>
        </div>
        <div class="info-cell full">
          <div class="info-key">${isEN ? 'Stay' : 'Thời gian'}</div>
          <div class="info-val">${nightsLabel}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-label">${isEN ? 'Payment History' : 'Lịch sử thanh toán'}</div>
      <table class="line-table">
        <thead><tr>
          <th>${isEN ? 'Date' : 'Ngày'}</th>
          <th>${isEN ? 'Method' : 'Phương thức'}</th>
          <th class="tr">${isEN ? 'Amount' : 'Số tiền'}</th>
          <th>${isEN ? 'Note' : 'Ghi chú'}</th>
        </tr></thead>
        <tbody>
          ${d.payments.length > 0
            ? d.payments.map(p => `
              <tr>
                <td>${fmtDate(p.date)}</td>
                <td>${methodLabel(p.method)}</td>
                <td class="tr">${fmt(p.amount)}</td>
                <td>${p.note ?? '—'}</td>
              </tr>`).join('')
            : `<tr><td colspan="4" style="text-align:center;color:#888;padding:12px">${isEN ? 'No payments recorded.' : 'Chưa có khoản cọc nào.'}</td></tr>`
          }
          <tr class="paid-row">
            <td colspan="2"><strong>${isEN ? 'Total paid' : 'Tổng đã thanh toán'}</strong></td>
            <td class="tr"><strong>${fmt(d.paid)}</strong></td>
            <td></td>
          </tr>
          <tr>
            <td colspan="2" style="color:#5a4a30">${isEN ? 'Total charge' : 'Tổng hóa đơn'}</td>
            <td class="tr" style="color:#1a1a1a">${fmt(d.grandTotal)}</td>
            <td></td>
          </tr>
          <tr class="due-row">
            <td colspan="2"><strong>${isEN ? 'Balance due at check-in' : 'Còn lại khi check-in'}</strong></td>
            <td class="tr"><strong>${fmt(bal)}</strong></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="callout callout-green">
      <div class="callout-icon">✓</div>
      <span class="callout-text">${isEN
        ? `Deposit received — your room is <strong>confirmed</strong>. We can't wait to welcome you on <strong>${fmtDate(d.checkIn)}</strong>!`
        : `Chúng tôi đã nhận cọc và xác nhận giữ phòng cho bạn. Hẹn gặp bạn ngày <strong>${fmtDate(d.checkIn)}</strong>!`
      }</span>
    </div>

    <hr class="divider">
    ${cancelPolicyHtml(true, lang)}
    ${houseRulesHtml(lang)}
  </div>

  ${htmlFooter(undefined, lang)}
</body></html>`;

  const zaloText = isEN
    ? `✅ *DEPOSIT RECEIVED — ${HOSTEL_NAME}*

Hi ${d.guestName},

We've received your deposit:
💰 *${fmtVND_EN(d.paid)}*

🛏 Room: ${d.roomName}
📅 ${nightsLabel_EN(d)}
💵 Total: ${fmtVND_EN(d.grandTotal)}
${bal > 0 ? `⏳ Balance due at check-in: ${fmtVND_EN(bal)}` : '🎉 Fully paid!'}

✅ Your room is confirmed!

📋 House rules: Check-in 14:00 | Check-out by 12:00 | Quiet after 22:00 | No smoking

🔄 Cancellation: 50% refund if cancelled 3+ days before check-in. Non-refundable within 3 days.

See you on ${fmtDate_EN(d.checkIn)} in Da Lat! 🌿
📞 ${HOSTEL_PHONE_INTL}`
    : `✅ *XÁC NHẬN ĐÃ NHẬN CỌC — ${HOSTEL_NAME}*

Xin chào ${d.guestName},

Chúng tôi đã nhận khoản đặt cọc:
💰 *${fmtVND(d.paid)}*

🛏 Phòng: ${d.roomName}
📅 ${nightsLabel_VI(d)}
💵 Tổng tiền: ${fmtVND(d.grandTotal)}
${bal > 0 ? `⏳ Còn lại khi check-in: ${fmtVND(bal)}` : '🎉 Đã thanh toán đủ!'}

✅ Phòng của bạn đã được giữ chắc chắn!

📋 Nội quy: Check-in 14:00 | Check-out trước 12:00 | Yên tĩnh sau 22:00 | Không hút thuốc

🔄 Huỷ phòng: Hoàn 50% nếu huỷ từ 3 ngày trở lên trước check-in. Không hoàn trong vòng 3 ngày.

Hẹn gặp bạn ngày ${fmtDate_VI(d.checkIn)} tại Đà Lạt! 🌿
📞 ${HOSTEL_PHONE}`;

  return { html, zaloText };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE 4 — Invoice / Hóa đơn
// ═══════════════════════════════════════════════════════════════════════════════

export function renderInvoice(d: DocumentData): { html: string; zaloText: string } {
  const lang = d.lang ?? 'vi';
  const isEN = lang === 'en';
  const fmt = isEN ? fmtVND_EN : fmtVND;
  const fmtDateTime = isEN ? fmtDateTime_EN : fmtDateTime_VI;
  const nightsLabel = isEN ? nightsLabel_EN(d) : nightsLabel_VI(d);
  // invoiceNo stable theo bookingId — không đổi khi generate lại cùng booking
  const invoiceNo = `HD-${d.bookingId.slice(0, 8).toUpperCase()}`;
  const bal = remaining(d);
  // addInfo ngắn gọn cho QR
  const lastName = removeDiacritics(d.guestName).trim().split(/\s+/).pop() ?? '';
  const addInfo = `TT ${d.roomName} ${lastName}`;

  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8">
  <title>${isEN ? 'Invoice' : 'Hóa đơn'}</title>${BASE_STYLE}</head><body>
  ${htmlHeader(lang)}

  <div class="inv-docbar">
    <div class="inv-doc-title">${isEN ? 'Invoice' : 'Hóa đơn thanh toán'}</div>
    <div class="inv-doc-meta">
      <div>${isEN ? 'No.' : 'Số HĐ:'} ${invoiceNo}</div>
      <div>${fmtDateTime(d.generatedAt)}</div>
    </div>
  </div>

  <div class="inv-body">
    <div class="section">
      <div class="section-label">${isEN ? 'Billed To' : 'Thông tin khách'}</div>
      <div class="info-grid">
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Guest Name' : 'Họ tên'}</div>
          <div class="info-val">${d.guestName}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Phone' : 'Số điện thoại'}</div>
          <div class="info-val">${d.guestPhone || '—'}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Room' : 'Phòng'}</div>
          <div class="info-val">${d.roomName}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Status' : 'Trạng thái'}</div>
          <div class="info-val">${bal <= 0
            ? `<span class="inv-tag tag-paid">${isEN ? 'Fully paid' : 'Đã thanh toán đủ'}</span>`
            : `<span class="inv-tag tag-pending">${isEN ? 'Balance due' : 'Còn nợ'}</span>`
          }</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-label">${isEN ? 'Itemised Charges' : 'Chi tiết sử dụng'}</div>
      <table class="line-table">
        <thead><tr>
          <th>${isEN ? 'Description' : 'Mô tả'}</th>
          <th class="tr">${isEN ? 'Unit price' : 'Đơn giá'}</th>
          <th class="tc">${isEN ? 'Qty' : 'SL'}</th>
          <th class="tr">${isEN ? 'Amount' : 'Thành tiền'}</th>
        </tr></thead>
        <tbody>
          <tr>
            <td>${d.roomName} <span style="color:#6a5a40">(${d.roomType})</span>
              <br><small style="color:#8a7a60">${nightsLabel}</small>
            </td>
            <td class="tr">${fmt(d.pricePerNight)}</td>
            <td class="tc">${d.nights}</td>
            <td class="tr">${fmt(d.roomSubtotal)}</td>
          </tr>
          ${d.services.map(s => `
          <tr>
            <td>${s.name}</td>
            <td class="tr">${fmt(s.price)}</td>
            <td class="tc">${s.qty}</td>
            <td class="tr">${fmt(s.price * s.qty)}</td>
          </tr>`).join('')}
          ${surchargeRow4Col(d.surcharge, lang)}
          ${d.discounts.map(disc => `
          <tr>
            <td style="color:#0a4d1a;font-weight:500">${isEN ? 'Discount' : 'Giảm giá'}: ${disc.description ?? '—'}</td>
            <td class="tr">—</td><td class="tc">—</td>
            <td class="tr" style="color:#0a4d1a">−${fmt(disc.amount)}</td>
          </tr>`).join('')}
          <tr class="total-row">
            <td colspan="3"><strong>${isEN ? 'Total' : 'TỔNG CỘNG'}</strong></td>
            <td class="tr"><strong>${fmt(d.grandTotal)}</strong></td>
          </tr>
          ${d.paid > 0 ? (
            d.payments.length > 1
              // Nhiều lần thanh toán → break down từng dòng
              ? d.payments.map((p, i) => `
          <tr class="paid-row">
            <td colspan="2" class="tr" style="font-size:11px;color:#4a6a8a">
              ${isEN ? 'Payment' : 'Đã TT'} ${i + 1}/${d.payments.length}
              · ${isEN ? PAYMENT_METHOD_LABEL_EN[p.method] ?? p.method : PAYMENT_METHOD_LABEL[p.method] ?? p.method}
              ${p.note ? `· ${p.note}` : ''}
            </td>
            <td class="tc" style="font-size:11px;color:#4a6a8a">${isEN ? fmtDate_EN(p.date) : fmtDate_VI(p.date)}</td>
            <td class="tr">−${fmt(p.amount)}</td>
          </tr>`).join('')
              // 1 lần → 1 dòng gọn
              : `
          <tr class="paid-row">
            <td colspan="3" class="tr">${isEN ? 'Paid' : 'Đã thanh toán'}</td>
            <td class="tr">−${fmt(d.paid)}</td>
          </tr>`
          ) : ''}
          <tr class="${bal <= 0 ? 'paid-row' : 'due-row'}">
            <td colspan="3" class="tr"><strong>${isEN ? 'Balance due' : 'CÒN LẠI'}</strong></td>
            <td class="tr"><strong>${fmt(Math.max(0, bal))}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    ${bal > 0 ? `
    <div class="section">
      <div class="section-label">${isEN ? 'Pay Balance' : 'Thanh toán số tiền còn lại'}</div>
      ${qrBlockHtml(bal, addInfo, undefined, lang)}
      ${isEN ? `<p style="font-size:10.5px;color:#5a4a30;margin-top:8px">Cash is also accepted at the front desk. Please keep this invoice as your receipt.</p>` : ''}
    </div>` : `
    <div class="callout callout-green">
      <div class="callout-icon">🎉</div>
      <span class="callout-text">${isEN ? 'Fully paid. Thank you!' : 'Đã thanh toán đủ. Cảm ơn quý khách!'}</span>
    </div>`}

    <p style="text-align:center;margin-top:16px;font-size:12px;color:#5a4a30;font-style:italic">
      ${isEN
        ? `Thank you for staying with us — hope to see you again in Da Lat!`
        : `Cảm ơn quý khách đã lưu trú tại ${HOSTEL_NAME}. Hẹn gặp lại!`}
    </p>
  </div>

  ${htmlFooter(`${invoiceNo} · ${isEN ? '33/18/2 Phan Dinh Phung, Ward 1, Da Lat' : HOSTEL_ADDR_VI}`, lang)}
</body></html>`;

  const zaloText = isEN
    ? `🧾 *INVOICE — ${HOSTEL_NAME}*
No. ${invoiceNo}

Guest: ${d.guestName}
🛏 ${d.roomName} | ${nightsLabel_EN(d)}

CHARGES:
• Room: ${fmtVND_EN(d.roomSubtotal)}
${d.services.map(s => `• ${s.name} (×${s.qty}): ${fmtVND_EN(s.price * s.qty)}`).join('\n')}
${d.surcharge > 0 ? `• Card surcharge (4%): ${fmtVND_EN(d.surcharge)}` : ''}
${d.discounts.map(disc => `• Discount (${disc.description ?? '—'}): −${fmtVND_EN(disc.amount)}`).join('\n')}

💰 TOTAL: ${fmtVND_EN(d.grandTotal)}
${d.paid > 0 ? `✅ Paid: ${fmtVND_EN(d.paid)}` : ''}
${bal > 0 ? `⏳ Balance due: *${fmtVND_EN(bal)}*` : '🎉 Fully settled'}

Thank you for staying at Hello Dalat! 🌿`
    : `🧾 *HÓA ĐƠN THANH TOÁN — ${HOSTEL_NAME}*
Số HĐ: ${invoiceNo}

Khách: ${d.guestName}
🛏 ${d.roomName} | ${nightsLabel_VI(d)}

CHI TIẾT:
• Tiền phòng: ${fmtVND(d.roomSubtotal)}
${d.services.map(s => `• ${s.name} (×${s.qty}): ${fmtVND(s.price * s.qty)}`).join('\n')}
${d.surcharge > 0 ? `• Phụ thu thẻ (4%): ${fmtVND(d.surcharge)}` : ''}
${d.discounts.map(disc => `• Giảm (${disc.description ?? '—'}): −${fmtVND(disc.amount)}`).join('\n')}

💰 TỔNG: ${fmtVND(d.grandTotal)}
${d.paid > 0 ? `✅ Đã trả: ${fmtVND(d.paid)}` : ''}
${bal > 0 ? `⏳ Còn lại: *${fmtVND(bal)}*` : '🎉 Đã thanh toán đủ'}

Cảm ơn bạn đã ở lại Hello Dalat! 🌿`;

  return { html, zaloText };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE 5 — Pre-arrival / Thông báo trước ngày đến
// ═══════════════════════════════════════════════════════════════════════════════

export function renderArrivalNotice(d: DocumentData): { html: string; zaloText: string } {
  const lang = d.lang ?? 'vi';
  const isEN = lang === 'en';
  const fmt = isEN ? fmtVND_EN : fmtVND;
  const fmtDate = isEN ? fmtDate_EN : fmtDate_VI;
  const fmtDateTime = isEN ? fmtDateTime_EN : fmtDateTime_VI;
  const bal = remaining(d);

  const gettingHereEN = `
<div class="section">
  <div class="section-label">Getting Here</div>
  <div class="directions-grid">
    <div class="direction-card">
      <div class="dir-mode">From Da Lat Airport</div>
      <div class="dir-detail">Take a taxi or Grab — ask for <strong>33/18/2 Phan Dinh Phung, Phuong 1</strong>.</div>
      <div class="dir-time">~15–20 min · ~80,000–120,000 VND</div>
    </div>
    <div class="direction-card">
      <div class="dir-mode">From Da Lat Bus Station</div>
      <div class="dir-detail">Short Grab ride or 15-min walk through the market area.</div>
      <div class="dir-time">~10 min · ~40,000 VND by Grab</div>
    </div>
    <div class="direction-card">
      <div class="dir-mode">Google Maps</div>
      <div class="dir-detail">Search <strong>"Hello Dalat Hostel"</strong> — we're pinned on Google Maps.</div>
      <div class="dir-time">Near Xuan Huong Lake</div>
    </div>
    <div class="direction-card">
      <div class="dir-mode">Need a pickup?</div>
      <div class="dir-detail">We can arrange an airport transfer. Message us at least <strong>3 hours before</strong> your flight lands.</div>
      <div class="dir-time">150,000 VND · WhatsApp/Zalo</div>
    </div>
  </div>
</div>`;

  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8">
  <title>${isEN ? 'Pre-arrival Notice' : 'Thông báo trước ngày đến'}</title>${BASE_STYLE}</head><body>
  ${htmlHeader(lang)}

  <div class="inv-docbar">
    <div class="inv-doc-title">${isEN ? "We're Looking Forward to Your Stay" : 'Thông báo trước ngày đến'}</div>
    <div class="inv-doc-meta"><div>${isEN ? 'Sent' : 'Ngày gửi'}: ${fmtDateTime(d.generatedAt)}</div></div>
  </div>

  <div class="inv-body">
    <div class="section">
      <div class="section-label">${isEN ? 'Your Reservation' : 'Lịch check-in của bạn'}</div>
      <div class="info-grid">
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Guest' : 'Khách'}</div>
          <div class="info-val">${d.guestName}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">${isEN ? 'Room' : 'Phòng'}</div>
          <div class="info-val">${d.roomName}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">Check-in</div>
          <div class="info-val">${fmtDate(d.checkIn)} · ${isEN ? 'from' : 'từ'} 14:00${d.hasEarlyCheckIn ? ` <span class="badge badge-green">${isEN ? 'Early CI ✓' : 'Early ✓'}</span>` : ''}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">Check-out</div>
          <div class="info-val">${fmtDate(d.checkOut)} · ${isEN ? 'by' : 'trước'} 12:00${d.hasLateCheckOut ? ` <span class="badge badge-green">${isEN ? 'Late CO ✓' : 'Late ✓'}</span>` : ''}</div>
        </div>
        ${bal > 0 ? `
        <div class="info-cell full">
          <div class="info-key">${isEN ? 'Balance due at check-in' : 'Còn lại khi check-in'}</div>
          <div class="info-val" style="color:#6d2800;font-weight:600">${fmt(bal)} (${isEN ? 'cash or bank transfer accepted' : 'tiền mặt hoặc chuyển khoản'})</div>
        </div>` : `
        <div class="info-cell full">
          <div class="info-key">${isEN ? 'Payment' : 'Thanh toán'}</div>
          <div class="info-val" style="color:#0a4d1a;font-weight:600">${isEN ? 'Fully paid — nothing due at check-in' : 'Đã thanh toán đủ — không cần trả thêm'}</div>
        </div>`}
      </div>
    </div>

    ${isEN ? gettingHereEN : `
    <div class="section">
      <div class="section-label">Hướng dẫn nhận phòng</div>
      <div class="info-grid">
        <div class="info-cell">
          <div class="info-key">Địa chỉ</div>
          <div class="info-val">${HOSTEL_ADDR_VI}</div>
        </div>
        <div class="info-cell">
          <div class="info-key">Giờ check-in</div>
          <div class="info-val">14:00 – 22:00 <span class="info-val muted">(muộn: báo trước qua Zalo)</span></div>
        </div>
        <div class="info-cell">
          <div class="info-key">Liên hệ</div>
          <div class="info-val">${HOSTEL_PHONE} (Zalo / Call)</div>
        </div>
        <div class="info-cell">
          <div class="info-key">Thanh toán</div>
          <div class="info-val">Tiền mặt hoặc chuyển khoản VCB</div>
        </div>
      </div>
    </div>`}

    ${isEN ? `
    <div class="section">
      <div class="section-label">Check-in Info</div>
      <div class="info-grid">
        <div class="info-cell">
          <div class="info-key">Check-in hours</div>
          <div class="info-val">14:00 – 22:00</div>
        </div>
        <div class="info-cell">
          <div class="info-key">Arriving late?</div>
          <div class="info-val">Message us in advance — we'll arrange it</div>
        </div>
        <div class="info-cell">
          <div class="info-key">Contact</div>
          <div class="info-val">${HOSTEL_PHONE_INTL} (WhatsApp / Zalo)</div>
        </div>
        <div class="info-cell">
          <div class="info-key">Payment</div>
          <div class="info-val">Cash or VCB bank transfer</div>
        </div>
      </div>
    </div>` : ''}

    ${d.services.length > 0 ? `
    <div class="section">
      <div class="section-label">${isEN ? 'Booked Services' : 'Dịch vụ đã đăng ký'}</div>
      <table class="line-table">
        <thead><tr>
          <th>${isEN ? 'Service' : 'Dịch vụ'}</th>
          <th class="tc">${isEN ? 'Qty' : 'SL'}</th>
          <th class="tr">${isEN ? 'Unit price' : 'Đơn giá'}</th>
        </tr></thead>
        <tbody>
          ${d.services.map(s => `
          <tr>
            <td>${s.name}</td>
            <td class="tc">${s.qty}</td>
            <td class="tr">${fmt(s.price)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <div class="callout callout-green">
      <div class="callout-icon">✓</div>
      <span class="callout-text">${isEN
        ? 'Everything is set for your arrival. If you have any questions before you get here, just send us a message — we\'re happy to help!'
        : `Chúng tôi đã chuẩn bị sẵn sàng đón bạn. Mọi thắc mắc, liên hệ <strong>${HOSTEL_PHONE}</strong> qua Zalo nhé!`
      }</span>
    </div>

    <hr class="divider">
    ${houseRulesHtml(lang)}
  </div>

  ${htmlFooter(undefined, lang)}
</body></html>`;

  const zaloText = isEN
    ? `🌿 *SEE YOU SOON — ${HOSTEL_NAME}*

Hi ${d.guestName}!

A quick reminder about your upcoming check-in:

🛏 Room: ${d.roomName}
📅 Check-in: *${fmtDate_EN(d.checkIn)}* from 14:00${d.hasEarlyCheckIn ? ' (Early check-in)' : ''}
📅 Check-out: ${fmtDate_EN(d.checkOut)} by 12:00${d.hasLateCheckOut ? ' (Late check-out)' : ''}

📍 Address: 33/18/2 Phan Dinh Phung, Ward 1, Da Lat
📞 Contact: ${HOSTEL_PHONE_INTL} (WhatsApp / Zalo)

📋 House rules:
• Check-in 14:00 | Check-out by 12:00
• Quiet after 22:00 | No smoking indoors

${bal > 0
  ? `💵 Balance due at check-in: *${fmtVND_EN(bal)}* (cash or bank transfer)`
  : '✅ Fully paid — just show up and enjoy!'
}

If you're arriving after 22:00, please let us know in advance.
See you in Da Lat! 🌿`
    : `🌿 *NHẮC NHỞ CHECK-IN — ${HOSTEL_NAME}*

Xin chào ${d.guestName}!

🛏 Phòng: ${d.roomName}
📅 Check-in: *${fmtDate_VI(d.checkIn)}* từ 14:00${d.hasEarlyCheckIn ? ' (Early check-in)' : ''}
📅 Check-out: ${fmtDate_VI(d.checkOut)} trước 12:00${d.hasLateCheckOut ? ' (Late check-out)' : ''}

📍 Địa chỉ: ${HOSTEL_ADDR_VI}
📞 Liên hệ: ${HOSTEL_PHONE}

📋 Nội quy: Check-in 14:00 | Check-out trước 12:00 | Yên tĩnh sau 22:00 | Không hút thuốc

${bal > 0
  ? `💵 Còn lại khi check-in: *${fmtVND(bal)}* (tiền mặt hoặc CK)`
  : '✅ Bạn đã thanh toán đủ rồi!'
}

Nếu đến muộn sau 22:00, vui lòng báo trước qua Zalo nhé!
Hẹn gặp bạn tại Đà Lạt! 🌿`;

  return { html, zaloText };
}

