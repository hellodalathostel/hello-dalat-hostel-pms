// src/features/documents/documentTemplates.ts
// Templates tạo nội dung cho 5 loại document của Hello Dalat Hostel.
// Mỗi template nhận DocumentData và trả về { html, zaloText }.
// Template KHÔNG query DB — caller (useDocumentGenerator) cung cấp data đầy đủ.

import dayjs from 'dayjs';
import type { DocKind } from './useDocumentGenerator';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BookingServiceItem {
  name: string;
  price: number;
  qty: number;
}

export interface BookingDiscountItem {
  description: string;
  amount: number;
}

export interface PaymentItem {
  amount: number;
  method: string;
  created_at: string;
}

/** Data object chuẩn hóa — useDocumentGenerator build từ DB rồi truyền vào đây */
export interface DocumentData {
  // Booking
  bookingId: string;
  groupId: string;
  roomName: string;
  roomType: string;
  checkIn: string;       // 'YYYY-MM-DD'
  checkOut: string;      // 'YYYY-MM-DD'
  nights: number;
  guestsCount: number;
  hasEarlyCheckIn: boolean;
  hasLateCheckOut: boolean;

  // Guest / Group
  guestName: string;
  guestPhone: string;
  source: string;           // 'direct' | 'booking_com' | ...
  otaBookingNumber?: string;

  // Tài chính
  pricePerNight: number;    // bookings.price
  surcharge: number;        // bookings.surcharge (card_fee — trigger tính)
  grandTotal: number;       // bookings.grand_total (trigger tính)
  services: BookingServiceItem[];
  discounts: BookingDiscountItem[];
  paid: number;             // groups.paid (tổng đã trả)
  payments: PaymentItem[];  // lịch sử thanh toán

  // Meta
  generatedAt: string;      // ISO string — caller set = new Date().toISOString()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HOSTEL_NAME = 'Hello Dalat Hostel';
const HOSTEL_ADDRESS = '33/18/2 Phan Đình Phùng, P.1, Đà Lạt';
const HOSTEL_PHONE = '0969 975 935';
const HOSTEL_EMAIL = 'hellodalathostel@gmail.com';

/** Format tiền VND */
const fmtVND = (amount: number) =>
  new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';

/** Format ngày hiển thị: DD/MM/YYYY */
const fmtDate = (d: string) => dayjs(d).format('DD/MM/YYYY');

/** Format ngày giờ: DD/MM/YYYY HH:mm */
const fmtDateTime = (d: string) => dayjs(d).format('DD/MM/YYYY HH:mm');

/** Số đêm + khoảng ngày */
const nightsLabel = (d: DocumentData) =>
  `${d.nights} đêm (${fmtDate(d.checkIn)} → ${fmtDate(d.checkOut)})`;

/** Tính tổng services */
const servicesTotal = (services: BookingServiceItem[]) =>
  services.reduce((sum, s) => sum + s.price * s.qty, 0);


/** Số dư còn lại */
const remaining = (d: DocumentData) => d.grandTotal - d.paid;

// CSS chung cho tất cả HTML templates (inline cho print-safe)
const BASE_STYLE = `
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #222; background: #fff; padding: 24px; max-width: 640px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #2d6a4f; padding-bottom: 12px; }
    .header h1 { font-size: 20px; color: #2d6a4f; font-weight: 700; }
    .header .sub { font-size: 12px; color: #555; margin-top: 4px; }
    .doc-title { text-align: center; font-size: 16px; font-weight: 700; margin: 16px 0; text-transform: uppercase; letter-spacing: 1px; color: #1a1a1a; }
    .doc-meta { text-align: right; font-size: 11px; color: #888; margin-bottom: 16px; }
    .section { margin-bottom: 16px; }
    .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #2d6a4f; border-bottom: 1px solid #d4edda; padding-bottom: 4px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 5px 6px; vertical-align: top; }
    td.label { width: 40%; color: #555; font-size: 12px; }
    td.value { font-weight: 500; }
    .line-table th, .line-table td { border: 1px solid #e0e0e0; padding: 6px 8px; }
    .line-table th { background: #f5f5f5; font-size: 12px; font-weight: 600; }
    .line-table tr:last-child td { font-weight: 600; }
    .total-row td { background: #e8f5e9; font-size: 14px; font-weight: 700; color: #2d6a4f; }
    .remaining-row td { background: #fff3cd; font-weight: 700; color: #856404; }
    .paid-row td { background: #d1e7dd; font-weight: 700; color: #0a3622; }
    .highlight { background: #fffde7; border: 1px solid #f9ca24; border-radius: 6px; padding: 10px 14px; margin-top: 12px; font-size: 13px; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #eee; font-size: 11px; color: #888; text-align: center; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .badge-green { background: #d1e7dd; color: #0a3622; }
    .badge-yellow { background: #fff3cd; color: #856404; }
    @media print { body { padding: 12px; } }
  </style>
`;

const htmlHeader = () => `
  <div class="header">
    <h1>${HOSTEL_NAME}</h1>
    <div class="sub">${HOSTEL_ADDRESS} · ${HOSTEL_PHONE} · ${HOSTEL_EMAIL}</div>
  </div>
`;

// ─── Template 1: Booking Confirmation ─────────────────────────────────────────

export function renderBookingConfirmation(d: DocumentData): { html: string; zaloText: string } {
  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Xác nhận đặt phòng</title>${BASE_STYLE}</head><body>
    ${htmlHeader()}
    <div class="doc-title">Phiếu xác nhận đặt phòng</div>
    <div class="doc-meta">Ngày tạo: ${fmtDateTime(d.generatedAt)}</div>

    <div class="section">
      <div class="section-title">Thông tin khách</div>
      <table><tbody>
        <tr><td class="label">Họ tên</td><td class="value">${d.guestName}</td></tr>
        <tr><td class="label">Số điện thoại</td><td class="value">${d.guestPhone || '—'}</td></tr>
        ${d.otaBookingNumber ? `<tr><td class="label">Mã booking OTA</td><td class="value">${d.otaBookingNumber}</td></tr>` : ''}
      </tbody></table>
    </div>

    <div class="section">
      <div class="section-title">Chi tiết đặt phòng</div>
      <table><tbody>
        <tr><td class="label">Phòng</td><td class="value">${d.roomName} (${d.roomType})</td></tr>
        <tr><td class="label">Check-in</td><td class="value">${fmtDate(d.checkIn)} từ 14:00${d.hasEarlyCheckIn ? ' <span class="badge badge-yellow">Early check-in</span>' : ''}</td></tr>
        <tr><td class="label">Check-out</td><td class="value">${fmtDate(d.checkOut)} trước 12:00${d.hasLateCheckOut ? ' <span class="badge badge-yellow">Late check-out</span>' : ''}</td></tr>
        <tr><td class="label">Số đêm</td><td class="value">${d.nights} đêm</td></tr>
        <tr><td class="label">Số khách</td><td class="value">${d.guestsCount} người</td></tr>
        <tr><td class="label">Giá/đêm</td><td class="value">${fmtVND(d.pricePerNight)}</td></tr>
      </tbody></table>
    </div>

    ${d.services.length > 0 ? `
    <div class="section">
      <div class="section-title">Dịch vụ kèm theo</div>
      <table class="line-table"><thead><tr><th>Dịch vụ</th><th style="text-align:right">Đơn giá</th><th style="text-align:center">SL</th><th style="text-align:right">Thành tiền</th></tr></thead>
      <tbody>${d.services.map(s => `<tr><td>${s.name}</td><td style="text-align:right">${fmtVND(s.price)}</td><td style="text-align:center">${s.qty}</td><td style="text-align:right">${fmtVND(s.price * s.qty)}</td></tr>`).join('')}</tbody>
      </table>
    </div>` : ''}

    <div class="section">
      <div class="section-title">Tổng thanh toán</div>
      <table class="line-table"><tbody>
        <tr><td>Tiền phòng (${d.nights} đêm × ${fmtVND(d.pricePerNight)})</td><td style="text-align:right">${fmtVND(d.nights * d.pricePerNight)}</td></tr>
        ${d.services.length > 0 ? `<tr><td>Dịch vụ</td><td style="text-align:right">${fmtVND(servicesTotal(d.services))}</td></tr>` : ''}
        ${d.surcharge > 0 ? `<tr><td>Phụ thu (card fee)</td><td style="text-align:right">${fmtVND(d.surcharge)}</td></tr>` : ''}
        ${d.discounts.map(disc => `<tr><td>Giảm giá: ${disc.description}</td><td style="text-align:right">-${fmtVND(disc.amount)}</td></tr>`).join('')}
        <tr class="total-row"><td>TỔNG CỘNG</td><td style="text-align:right">${fmtVND(d.grandTotal)}</td></tr>
      </tbody></table>
    </div>

    <div class="highlight">
      🏡 Chúng tôi rất vui được đón tiếp quý khách! Nếu cần hỗ trợ, vui lòng liên hệ ${HOSTEL_PHONE} (Zalo/Call).
    </div>
    <div class="footer">${HOSTEL_NAME} · ${HOSTEL_ADDRESS}</div>
  </body></html>`;

  const zaloText = `🏡 *XÁC NHẬN ĐẶT PHÒNG — ${HOSTEL_NAME}*

Xin chào ${d.guestName},

Chúng tôi xác nhận đã nhận đặt phòng của bạn:

🛏 Phòng: ${d.roomName}
📅 Check-in: ${fmtDate(d.checkIn)} (từ 14:00)${d.hasEarlyCheckIn ? ' — Early check-in' : ''}
📅 Check-out: ${fmtDate(d.checkOut)} (trước 12:00)${d.hasLateCheckOut ? ' — Late check-out' : ''}
🌙 Số đêm: ${d.nights}
👥 Số khách: ${d.guestsCount}
💰 Tổng tiền: ${fmtVND(d.grandTotal)}

${d.otaBookingNumber ? `📋 Mã booking: ${d.otaBookingNumber}\n` : ''}
Mọi thắc mắc, liên hệ: ${HOSTEL_PHONE}
Hẹn gặp bạn tại Đà Lạt! 🌿`;

  return { html, zaloText };
}

// ─── Template 2: Deposit Request ──────────────────────────────────────────────

export interface DepositRequestOptions {
  depositAmount: number;    // số tiền yêu cầu cọc
  deadline: string;         // 'YYYY-MM-DD' — hạn chuyển cọc
  bankName?: string;
  bankAccount?: string;
  bankOwner?: string;
}

export function renderDepositRequest(
  d: DocumentData,
  opts: DepositRequestOptions
): { html: string; zaloText: string } {
  const bank = opts.bankName ?? 'MB Bank';
  const acct = opts.bankAccount ?? '0969975935';
  const owner = opts.bankOwner ?? 'NGUYEN THANH HIEU';

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Yêu cầu đặt cọc</title>${BASE_STYLE}</head><body>
    ${htmlHeader()}
    <div class="doc-title">Yêu cầu đặt cọc</div>
    <div class="doc-meta">Ngày tạo: ${fmtDateTime(d.generatedAt)}</div>

    <div class="section">
      <div class="section-title">Thông tin đặt phòng</div>
      <table><tbody>
        <tr><td class="label">Khách</td><td class="value">${d.guestName}</td></tr>
        <tr><td class="label">Phòng</td><td class="value">${d.roomName}</td></tr>
        <tr><td class="label">Thời gian</td><td class="value">${nightsLabel(d)}</td></tr>
        <tr><td class="label">Tổng tiền</td><td class="value">${fmtVND(d.grandTotal)}</td></tr>
      </tbody></table>
    </div>

    <div class="section">
      <div class="section-title">Yêu cầu đặt cọc</div>
      <div class="highlight">
        <p>Để giữ chỗ, vui lòng chuyển khoản số tiền:</p>
        <p style="font-size:20px; font-weight:700; color:#2d6a4f; margin: 8px 0">${fmtVND(opts.depositAmount)}</p>
        <p>Hạn chuyển: <strong>${fmtDate(opts.deadline)}</strong></p>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Thông tin chuyển khoản</div>
      <table><tbody>
        <tr><td class="label">Ngân hàng</td><td class="value">${bank}</td></tr>
        <tr><td class="label">Số tài khoản</td><td class="value" style="font-size:16px;font-weight:700;letter-spacing:2px">${acct}</td></tr>
        <tr><td class="label">Chủ tài khoản</td><td class="value">${owner}</td></tr>
        <tr><td class="label">Nội dung CK</td><td class="value">Coc phong ${d.roomName} ${fmtDate(d.checkIn)} ${d.guestName}</td></tr>
      </tbody></table>
    </div>

    <p style="font-size:12px;color:#888;margin-top:8px">* Nếu không nhận được xác nhận trong vòng 24h sau khi chuyển khoản, vui lòng liên hệ ${HOSTEL_PHONE}.</p>
    <div class="footer">${HOSTEL_NAME} · ${HOSTEL_ADDRESS}</div>
  </body></html>`;

  const zaloText = `💰 *YÊU CẦU ĐẶT CỌC — ${HOSTEL_NAME}*

Xin chào ${d.guestName},

Để giữ chỗ cho đặt phòng của bạn:
🛏 Phòng: ${d.roomName}
📅 ${nightsLabel(d)}

Vui lòng chuyển khoản:
💵 *${fmtVND(opts.depositAmount)}*
⏰ Hạn: ${fmtDate(opts.deadline)}

🏦 ${bank}
🔢 STK: *${acct}*
👤 ${owner}
📝 Nội dung: Coc phong ${d.roomName} ${fmtDate(d.checkIn)} ${d.guestName}

Sau khi chuyển, gửi ảnh chụp màn hình để xác nhận nhé!
Mọi thắc mắc: ${HOSTEL_PHONE}`;

  return { html, zaloText };
}

// ─── Template 3: Deposit Confirmation ─────────────────────────────────────────

export function renderDepositConfirmation(d: DocumentData): { html: string; zaloText: string } {
  const depositPaid = d.paid;
  const balance = remaining(d);

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Xác nhận đặt cọc</title>${BASE_STYLE}</head><body>
    ${htmlHeader()}
    <div class="doc-title">Xác nhận nhận cọc</div>
    <div class="doc-meta">Ngày xác nhận: ${fmtDateTime(d.generatedAt)}</div>

    <div class="section">
      <div class="section-title">Thông tin đặt phòng</div>
      <table><tbody>
        <tr><td class="label">Khách</td><td class="value">${d.guestName}</td></tr>
        <tr><td class="label">Phòng</td><td class="value">${d.roomName}</td></tr>
        <tr><td class="label">Thời gian</td><td class="value">${nightsLabel(d)}</td></tr>
      </tbody></table>
    </div>

    <div class="section">
      <div class="section-title">Thanh toán</div>
      <table class="line-table"><tbody>
        <tr><td>Tổng tiền phòng</td><td style="text-align:right">${fmtVND(d.grandTotal)}</td></tr>
        <tr class="paid-row"><td>✅ Đã đặt cọc</td><td style="text-align:right">${fmtVND(depositPaid)}</td></tr>
        ${balance > 0
          ? `<tr class="remaining-row"><td>⏳ Còn lại (thanh toán khi check-in)</td><td style="text-align:right">${fmtVND(balance)}</td></tr>`
          : `<tr class="paid-row"><td>🎉 Đã thanh toán đủ</td><td style="text-align:right">${fmtVND(0)}</td></tr>`
        }
      </tbody></table>
    </div>

    <div class="highlight">
      ✅ Chúng tôi đã nhận cọc và xác nhận giữ phòng cho bạn. Hẹn gặp bạn ngày ${fmtDate(d.checkIn)}!
    </div>
    <div class="footer">${HOSTEL_NAME} · ${HOSTEL_ADDRESS}</div>
  </body></html>`;

  const zaloText = `✅ *XÁC NHẬN ĐÃ NHẬN CỌC — ${HOSTEL_NAME}*

Xin chào ${d.guestName},

Chúng tôi đã nhận khoản đặt cọc:
💰 *${fmtVND(depositPaid)}*

Thông tin đặt phòng:
🛏 Phòng: ${d.roomName}
📅 ${nightsLabel(d)}
💵 Tổng tiền: ${fmtVND(d.grandTotal)}
${balance > 0 ? `⏳ Còn lại khi check-in: ${fmtVND(balance)}` : '🎉 Đã thanh toán đủ!'}

Phòng của bạn đã được giữ chắc chắn rồi!
Hẹn gặp bạn ngày ${fmtDate(d.checkIn)} tại Đà Lạt 🌿
📞 ${HOSTEL_PHONE}`;

  return { html, zaloText };
}

// ─── Template 4: Invoice (Hóa đơn checkout) ───────────────────────────────────

export function renderInvoice(d: DocumentData): { html: string; zaloText: string } {
  const invoiceNo = `HD-${dayjs(d.generatedAt).format('YYYYMMDD')}-${d.bookingId.slice(0, 6).toUpperCase()}`;
  const balance = remaining(d);

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Hóa đơn</title>${BASE_STYLE}</head><body>
    ${htmlHeader()}
    <div class="doc-title">Hóa đơn thanh toán</div>
    <div class="doc-meta">Số HĐ: ${invoiceNo} · Ngày: ${fmtDateTime(d.generatedAt)}</div>

    <div class="section">
      <div class="section-title">Thông tin khách</div>
      <table><tbody>
        <tr><td class="label">Họ tên</td><td class="value">${d.guestName}</td></tr>
        <tr><td class="label">Số điện thoại</td><td class="value">${d.guestPhone || '—'}</td></tr>
      </tbody></table>
    </div>

    <div class="section">
      <div class="section-title">Chi tiết sử dụng</div>
      <table class="line-table">
        <thead><tr><th>Mô tả</th><th style="text-align:right">Đơn giá</th><th style="text-align:center">SL</th><th style="text-align:right">Thành tiền</th></tr></thead>
        <tbody>
          <tr>
            <td>Phòng ${d.roomName} (${d.roomType})<br><small style="color:#888">${nightsLabel(d)}</small></td>
            <td style="text-align:right">${fmtVND(d.pricePerNight)}</td>
            <td style="text-align:center">${d.nights}</td>
            <td style="text-align:right">${fmtVND(d.pricePerNight * d.nights)}</td>
          </tr>
          ${d.services.map(s => `
          <tr>
            <td>${s.name}</td>
            <td style="text-align:right">${fmtVND(s.price)}</td>
            <td style="text-align:center">${s.qty}</td>
            <td style="text-align:right">${fmtVND(s.price * s.qty)}</td>
          </tr>`).join('')}
          ${d.surcharge > 0 ? `
          <tr>
            <td>Phụ thu thanh toán thẻ</td>
            <td style="text-align:right">—</td>
            <td style="text-align:center">—</td>
            <td style="text-align:right">${fmtVND(d.surcharge)}</td>
          </tr>` : ''}
          ${d.discounts.map(disc => `
          <tr style="color:#0a3622">
            <td>Giảm giá: ${disc.description}</td>
            <td style="text-align:right">—</td>
            <td style="text-align:center">—</td>
            <td style="text-align:right">-${fmtVND(disc.amount)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="section">
      <table class="line-table"><tbody>
        <tr class="total-row"><td colspan="3">TỔNG CỘNG</td><td style="text-align:right">${fmtVND(d.grandTotal)}</td></tr>
        ${d.payments.map(p => `
        <tr class="paid-row">
          <td colspan="3">Đã thanh toán (${p.method}) — ${fmtDate(p.created_at)}</td>
          <td style="text-align:right">-${fmtVND(p.amount)}</td>
        </tr>`).join('')}
        ${balance > 0
          ? `<tr class="remaining-row"><td colspan="3">CÒN LẠI</td><td style="text-align:right">${fmtVND(balance)}</td></tr>`
          : `<tr class="paid-row"><td colspan="3">ĐÃ THANH TOÁN ĐỦ</td><td style="text-align:right">${fmtVND(0)}</td></tr>`
        }
      </tbody></table>
    </div>

    <p style="text-align:center;margin-top:16px;font-size:12px;color:#555">Cảm ơn quý khách đã lưu trú tại ${HOSTEL_NAME}. Hẹn gặp lại! 🌿</p>
    <div class="footer">${invoiceNo} · ${HOSTEL_NAME} · ${HOSTEL_ADDRESS}</div>
  </body></html>`;

  const zaloText = `🧾 *HÓA ĐƠN THANH TOÁN — ${HOSTEL_NAME}*
Số HĐ: ${invoiceNo}

Khách: ${d.guestName}
🛏 Phòng: ${d.roomName} | ${nightsLabel(d)}

CHI TIẾT:
• Tiền phòng: ${fmtVND(d.pricePerNight * d.nights)}
${d.services.map(s => `• ${s.name} (×${s.qty}): ${fmtVND(s.price * s.qty)}`).join('\n')}
${d.surcharge > 0 ? `• Phụ thu thẻ: ${fmtVND(d.surcharge)}` : ''}
${d.discounts.map(disc => `• Giảm (${disc.description}): -${fmtVND(disc.amount)}`).join('\n')}

💰 TỔNG: ${fmtVND(d.grandTotal)}
✅ Đã trả: ${fmtVND(d.paid)}
${balance > 0 ? `⏳ Còn lại: ${fmtVND(balance)}` : '🎉 Đã thanh toán đủ'}

Cảm ơn bạn đã ở lại Hello Dalat! 🌿`;

  return { html, zaloText };
}

// ─── Template 5: Arrival Notice ───────────────────────────────────────────────

export function renderArrivalNotice(d: DocumentData): { html: string; zaloText: string } {
  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Thông báo đến</title>${BASE_STYLE}</head><body>
    ${htmlHeader()}
    <div class="doc-title">Thông báo trước ngày đến</div>
    <div class="doc-meta">Ngày gửi: ${fmtDateTime(d.generatedAt)}</div>

    <div class="section">
      <div class="section-title">Lịch check-in của bạn</div>
      <table><tbody>
        <tr><td class="label">Khách</td><td class="value">${d.guestName}</td></tr>
        <tr><td class="label">Phòng</td><td class="value">${d.roomName}</td></tr>
        <tr><td class="label">Check-in</td><td class="value">${fmtDate(d.checkIn)} — từ 14:00${d.hasEarlyCheckIn ? ' <span class="badge badge-green">Early check-in đã xác nhận</span>' : ''}</td></tr>
        <tr><td class="label">Check-out</td><td class="value">${fmtDate(d.checkOut)} — trước 12:00${d.hasLateCheckOut ? ' <span class="badge badge-green">Late check-out đã xác nhận</span>' : ''}</td></tr>
        <tr><td class="label">Số đêm</td><td class="value">${d.nights}</td></tr>
      </tbody></table>
    </div>

    <div class="section">
      <div class="section-title">Hướng dẫn nhận phòng</div>
      <table><tbody>
        <tr><td class="label">Địa chỉ</td><td class="value">${HOSTEL_ADDRESS}</td></tr>
        <tr><td class="label">Giờ check-in</td><td class="value">14:00 – 22:00 (muộn hơn: báo trước qua Zalo)</td></tr>
        <tr><td class="label">Liên hệ</td><td class="value">${HOSTEL_PHONE} (Zalo/Call)</td></tr>
        <tr><td class="label">Thanh toán</td><td class="value">Tiền mặt hoặc chuyển khoản khi check-in</td></tr>
      </tbody></table>
    </div>

    ${d.paid < d.grandTotal ? `
    <div class="highlight">
      💵 Số tiền cần thanh toán khi check-in: <strong>${fmtVND(remaining(d))}</strong>
    </div>` : `
    <div class="highlight" style="border-color:#2d6a4f;background:#e8f5e9">
      ✅ Bạn đã thanh toán đủ — chỉ cần đến nhận phòng!
    </div>`}

    <div class="footer">${HOSTEL_NAME} · ${HOSTEL_ADDRESS}</div>
  </body></html>`;

  const zaloText = `🌿 *NHẮC NHỞ CHECK-IN — ${HOSTEL_NAME}*

Xin chào ${d.guestName}!

Chúng tôi vui lòng nhắc bạn về lịch check-in:

🛏 Phòng: ${d.roomName}
📅 Check-in: *${fmtDate(d.checkIn)}* từ 14:00${d.hasEarlyCheckIn ? ' (Early check-in)' : ''}
📅 Check-out: ${fmtDate(d.checkOut)} trước 12:00${d.hasLateCheckOut ? ' (Late check-out)' : ''}

📍 Địa chỉ: ${HOSTEL_ADDRESS}
📞 Liên hệ: ${HOSTEL_PHONE}

${d.paid < d.grandTotal
  ? `💵 Còn lại khi check-in: *${fmtVND(remaining(d))}* (tiền mặt hoặc CK)`
  : '✅ Bạn đã thanh toán đủ rồi!'
}

Nếu đến muộn sau 22:00, vui lòng báo trước qua Zalo này nhé!
Hẹn gặp bạn tại Đà Lạt! 🌿`;

  return { html, zaloText };
}

// Labels hiển thị cho từng doc kind
export const DOC_KIND_LABELS: Record<DocKind, string> = {
  booking_confirmation: 'Xác nhận đặt phòng',
  deposit_request: 'Yêu cầu đặt cọc',
  deposit_confirmation: 'Xác nhận nhận cọc',
  invoice: 'Hóa đơn',
  arrival_notice: 'Thông báo check-in',
};

// Re-export DocKind type để DocumentActionsMenu import được
export type { DocKind };