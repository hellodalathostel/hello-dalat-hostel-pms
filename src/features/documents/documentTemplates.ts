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
  description: string | null;
  amount: number;
}

export interface PaymentItem {
  id: string;
  amount: number;
  method: string;
  date: string;
  note: string | null;
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
  pricePerNight: number;    // bookings.price_per_night
  roomSubtotal: number;     // bookings.room_subtotal (trigger-computed)
  surcharge: number;        // bookings.surcharge (card_fee — trigger tính)
  grandTotal: number;       // bookings.grand_total (trigger tính)
  services: BookingServiceItem[];
  discounts: BookingDiscountItem[];
  paid: number;             // groups.paid (tổng đã trả)
  payments: PaymentItem[];  // lịch sử thanh toán

  // Meta
  generatedAt: string;      // ISO string — caller set = new Date().toISOString()
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HOSTEL_NAME = 'Hello Dalat Hostel';
const HOSTEL_ADDRESS = '33/18/2 Phan Đình Phùng, P.1, Đà Lạt';
const HOSTEL_PHONE = '0969 975 935';
const HOSTEL_EMAIL = 'hellodalathostel@gmail.com';
const LOGO_URL = 'https://rcfhhgywjdwqcgnpkbtl.supabase.co/storage/v1/object/public/assets/1773723283955.png';

// VietQR - Vietcombank
const VQR_BANK = 'VCB';
const VQR_ACCOUNT = '9969975935';
const VQR_OWNER = 'NGUYEN THANH HIEU';

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
  card: 'Thẻ',
  momo: 'MoMo',
  zalopay: 'ZaloPay',
  other: 'Khác',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/** Bỏ dấu tiếng Việt để VietQR xử lý được */
const removeDiacritics = (str: string) =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

/**
 * Generate VietQR image URL
 * addInfo phải là ASCII — strip dấu tiếng Việt trước khi encode
 */
const vietQrUrl = (amount: number, addInfo: string) => {
  const safeInfo = encodeURIComponent(removeDiacritics(addInfo));
  const safeName = encodeURIComponent(removeDiacritics(VQR_OWNER));
  return `https://img.vietqr.io/image/${VQR_BANK}-${VQR_ACCOUNT}-print.png?amount=${amount}&addInfo=${safeInfo}&accountName=${safeName}`;
};

// ─── CSS chung (print-safe) ───────────────────────────────────────────────────

const BASE_STYLE = `
  <style>
    /* -- Reset -- */
    * { box-sizing: border-box; margin: 0; padding: 0; }

    /* -- A4 base -- */
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 13px;
      line-height: 1.6;
      color: #1a1a1a;
      background: #fff;
      padding: 28px 32px;
      width: 100%;
      max-width: 680px;
      margin: 0 auto;
    }

    /* -- Header -- */
    .header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 18px;
      padding-bottom: 14px;
      border-bottom: 3px solid #2d6a4f;
    }
    .header-logo {
      width: 56px;
      height: 56px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .header-info h1 {
      font-size: 17px;
      color: #2d6a4f;
      font-weight: 700;
      letter-spacing: 0.3px;
    }
    .header-info .sub {
      font-size: 11px;
      color: #666;
      margin-top: 3px;
      line-height: 1.5;
    }

    /* -- Tieu de tai lieu -- */
    .doc-title {
      text-align: center;
      font-size: 15px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #1a1a1a;
      margin: 14px 0 4px;
    }
    .doc-meta {
      text-align: center;
      font-size: 11px;
      color: #999;
      margin-bottom: 18px;
    }

    /* -- Section -- */
    .section { margin-bottom: 16px; }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #2d6a4f;
      border-bottom: 1px solid #c8e6c9;
      padding-bottom: 4px;
      margin-bottom: 8px;
    }

    /* -- Info table (label/value) -- */
    table { width: 100%; border-collapse: collapse; }
    td { padding: 5px 6px; vertical-align: top; }
    td.label {
      width: 38%;
      color: #666;
      font-size: 12px;
    }
    td.value {
      font-weight: 500;
      font-size: 13px;
    }

    /* -- Line items table -- */
    .line-table th,
    .line-table td {
      border: 1px solid #e8e8e8;
      padding: 6px 10px;
      font-size: 12px;
    }
    .line-table th {
      background: #f5f5f5;
      font-weight: 600;
      color: #333;
    }

    /* -- Total rows -- */
    .total-row td {
      background: #e8f5e9;
      font-size: 14px;
      font-weight: 700;
      color: #1b5e20;
    }
    .paid-row td {
      background: #d1e7dd;
      font-weight: 600;
      color: #0a3622;
      font-size: 13px;
    }
    .remaining-row td {
      background: #fff8e1;
      font-weight: 700;
      color: #e65100;
      font-size: 14px;
    }

    /* -- Highlight boxes -- */
    .highlight {
      background: #fffde7;
      border-left: 4px solid #f9ca24;
      border-radius: 4px;
      padding: 10px 14px;
      margin-top: 14px;
      font-size: 13px;
    }
    .highlight-green {
      background: #f1f8e9;
      border-left: 4px solid #2d6a4f;
      border-radius: 4px;
      padding: 10px 14px;
      margin-top: 14px;
      font-size: 13px;
    }
    .highlight-red {
      background: #fff2f0;
      border-left: 4px solid #ff4d4f;
      border-radius: 4px;
      padding: 10px 14px;
      margin-top: 14px;
      font-size: 13px;
    }

    /* -- QR block -- */
    .qr-block {
      display: flex;
      align-items: flex-start;
      gap: 20px;
      margin-top: 10px;
    }
    .qr-block img {
      width: 160px;
      height: 160px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      flex-shrink: 0;
    }
    .qr-info .amount {
      font-size: 22px;
      font-weight: 700;
      color: #1b5e20;
      margin-bottom: 8px;
    }
    .qr-info table td { padding: 3px 6px; font-size: 12px; }

    /* -- House rules -- */
    .rules-list { padding-left: 0; list-style: none; }
    .rules-list li {
      padding: 5px 0;
      font-size: 12px;
      color: #444;
      border-bottom: 1px solid #f0f0f0;
    }
    .rules-list li:last-child { border-bottom: none; }

    /* -- Cancel policy -- */
    .cancel-table td,
    .cancel-table th {
      padding: 6px 10px;
      font-size: 12px;
      border: 1px solid #e0e0e0;
    }
    .cancel-table th {
      background: #f5f5f5;
      font-weight: 600;
    }

    /* -- Badge -- */
    .badge {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
    }
    .badge-green { background: #d1e7dd; color: #0a3622; }
    .badge-yellow { background: #fff3cd; color: #856404; }

    /* -- Footer -- */
    .footer {
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px solid #eee;
      font-size: 11px;
      color: #aaa;
      text-align: center;
    }

    /* -- Print -- */
    @media print {
      body {
        padding: 16px 20px;
        max-width: 100%;
        font-size: 12px;
      }
      .qr-block img { width: 140px; height: 140px; }
      .doc-title { font-size: 14px; }
      .total-row td,
      .remaining-row td { font-size: 13px; }
    }
  </style>
`;

// Header với logo
const htmlHeader = () => `
  <div class="header">
    <img class="header-logo" src="${LOGO_URL}" alt="Hello Dalat Hostel logo" />
    <div class="header-info">
      <h1>${HOSTEL_NAME}</h1>
      <div class="sub">
        ${HOSTEL_ADDRESS}<br>
        📞 ${HOSTEL_PHONE} · ✉️ ${HOSTEL_EMAIL}
      </div>
    </div>
  </div>
`;

// ─── House Rules (dùng chung) ─────────────────────────────────────────────────

const houseRulesHtml = () => `
  <div class="section">
    <div class="section-title">Nội quy phòng</div>
    <ul class="rules-list">
      <li>🕑 Check-in: từ 14:00 — Check-out: trước 12:00</li>
      <li>🌙 Giữ yên lặng sau 22:00, tránh làm phiền các phòng khác</li>
      <li>🚭 Không hút thuốc trong phòng và khu vực chung của hostel</li>
      <li>🔑 Vui lòng trả chìa khoá/thẻ phòng khi check-out</li>
      <li>📞 Mọi hỗ trợ: ${HOSTEL_PHONE} (Zalo/Call)</li>
    </ul>
  </div>
`;

// ─── Cancel Policy blocks ─────────────────────────────────────────────────────

/** Cancel policy cho booking chưa cọc (trước deposit) */
const cancelPolicyPreDepositHtml = () => `
  <div class="section">
    <div class="section-title">Chính sách huỷ phòng</div>
    <table class="cancel-table" style="width:100%">
      <thead>
        <tr>
          <th>Thời điểm huỷ</th>
          <th>Hoàn tiền</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Trước 7 ngày check-in</td><td style="color:#0a3622;font-weight:600">Hoàn 50% tiền cọc</td></tr>
        <tr><td>Trong vòng 3–7 ngày trước check-in</td><td style="color:#0a3622;font-weight:600">Hoàn 50% tiền cọc</td></tr>
        <tr><td>Trong vòng 3 ngày trước check-in</td><td style="color:#ff4d4f;font-weight:600">Không hoàn tiền (Non-refundable)</td></tr>
      </tbody>
    </table>
    <p style="font-size:11px;color:#888;margin-top:6px">* Chính sách áp dụng sau khi đặt cọc. Chưa có cọc = chỗ chưa được giữ.</p>
  </div>
`;

/** Cancel policy cho booking đã cọc (sau deposit) */
const cancelPolicyPostDepositHtml = () => `
  <div class="section">
    <div class="section-title">Chính sách huỷ phòng</div>
    <table class="cancel-table" style="width:100%">
      <thead>
        <tr>
          <th>Thời điểm huỷ</th>
          <th>Hoàn tiền cọc</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Huỷ trước 7 ngày check-in</td><td style="color:#0a3622;font-weight:600">Hoàn 50%</td></tr>
        <tr><td>Huỷ từ 3–7 ngày trước check-in</td><td style="color:#0a3622;font-weight:600">Hoàn 50%</td></tr>
        <tr><td>Huỷ trong vòng 3 ngày trước check-in</td><td style="color:#ff4d4f;font-weight:600">Không hoàn (Non-refundable)</td></tr>
      </tbody>
    </table>
  </div>
`;

// ─── Template 1: Booking Confirmation ─────────────────────────────────────────
// Tự động phân biệt pre-deposit (d.paid === 0) vs post-deposit (d.paid > 0)

export function renderBookingConfirmation(d: DocumentData): { html: string; zaloText: string } {
  const hasDeposit = d.paid > 0;

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
      <table class="line-table">
        <thead><tr><th>Dịch vụ</th><th style="text-align:right">Đơn giá</th><th style="text-align:center">SL</th><th style="text-align:right">Thành tiền</th></tr></thead>
        <tbody>${d.services.map(s => `<tr><td>${s.name}</td><td style="text-align:right">${fmtVND(s.price)}</td><td style="text-align:center">${s.qty}</td><td style="text-align:right">${fmtVND(s.price * s.qty)}</td></tr>`).join('')}</tbody>
      </table>
    </div>` : ''}

    <div class="section">
      <div class="section-title">Tổng thanh toán</div>
      <table class="line-table"><tbody>
        <tr><td>Tiền phòng (${d.nights} đêm × ${fmtVND(d.pricePerNight)})</td><td style="text-align:right">${fmtVND(d.roomSubtotal)}</td></tr>
        ${d.services.length > 0 ? `<tr><td>Dịch vụ</td><td style="text-align:right">${fmtVND(servicesTotal(d.services))}</td></tr>` : ''}
        ${d.surcharge > 0 ? `<tr><td>Phụ thu thanh toán thẻ</td><td style="text-align:right">${fmtVND(d.surcharge)}</td></tr>` : ''}
        ${d.discounts.map(disc => `<tr><td>Giảm giá${disc.description ? `: ${disc.description}` : ''}</td><td style="text-align:right; color:#0a3622">-${fmtVND(disc.amount)}</td></tr>`).join('')}
        <tr class="total-row"><td><strong>TỔNG CỘNG</strong></td><td style="text-align:right"><strong>${fmtVND(d.grandTotal)}</strong></td></tr>
        ${hasDeposit ? `
        <tr class="paid-row"><td>Đã đặt cọc</td><td style="text-align:right">-${fmtVND(d.paid)}</td></tr>
        <tr class="remaining-row"><td><strong>Còn lại khi check-in</strong></td><td style="text-align:right"><strong>${fmtVND(Math.max(0, remaining(d)))}</strong></td></tr>
        ` : ''}
      </tbody></table>
    </div>

    ${hasDeposit
      ? `<div class="highlight-green">✅ Chỗ của bạn đã được giữ chắc chắn. Hẹn gặp bạn ngày <strong>${fmtDate(d.checkIn)}</strong> tại Hello Dalat! 🌿</div>`
      : `<div class="highlight">⚠️ <strong>Chỗ chưa được giữ.</strong> Vui lòng đặt cọc để xác nhận booking. Liên hệ <strong>${HOSTEL_PHONE}</strong> để được hỗ trợ.</div>`
    }

    ${hasDeposit ? houseRulesHtml() : ''}
    ${hasDeposit ? cancelPolicyPostDepositHtml() : cancelPolicyPreDepositHtml()}

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
${hasDeposit ? `✅ Đã cọc: ${fmtVND(d.paid)} — Còn lại: ${fmtVND(Math.max(0, remaining(d)))}` : ''}
${d.otaBookingNumber ? `📋 Mã booking: ${d.otaBookingNumber}` : ''}

${hasDeposit
  ? `✅ Chỗ đã được giữ. Hẹn gặp bạn ngày ${fmtDate(d.checkIn)}!

📋 Nội quy:
• Check-in 14:00 | Check-out trước 12:00
• Giữ yên lặng sau 22:00
• Không hút thuốc trong phòng

🔄 Chính sách huỷ: Hoàn 50% nếu huỷ trước 3–7 ngày. Không hoàn trong vòng 3 ngày check-in.`
  : `⚠️ Chỗ chưa được giữ — vui lòng đặt cọc để xác nhận.

🔄 Chính sách huỷ: Hoàn 50% nếu huỷ trước 3–7 ngày. Không hoàn trong vòng 3 ngày check-in.`
}

Mọi thắc mắc: ${HOSTEL_PHONE} 🌿`;

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
  // Default sang Vietcombank
  const bank = opts.bankName ?? 'Vietcombank (VCB)';
  const acct = opts.bankAccount ?? VQR_ACCOUNT;
  const owner = opts.bankOwner ?? VQR_OWNER;
  const addInfo = `Coc phong ${d.roomName} ${fmtDate(d.checkIn)} ${d.guestName}`;
  const qrUrl = vietQrUrl(opts.depositAmount, addInfo);

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Yêu cầu đặt cọc</title>${BASE_STYLE}</head><body>
    ${htmlHeader()}
    <div class="doc-title">Yêu cầu đặt cọc</div>
    <div class="doc-meta">Ngày tạo: ${fmtDateTime(d.generatedAt)}</div>

    <div class="section">
      <div class="section-title">Thông tin đặt phòng</div>
      <table><tbody>
        <tr><td class="label">Khách</td><td class="value">${d.guestName}</td></tr>
        <tr><td class="label">Phòng</td><td class="value">${d.roomName} (${d.roomType})</td></tr>
        <tr><td class="label">Thời gian</td><td class="value">${nightsLabel(d)}</td></tr>
        <tr><td class="label">Tổng tiền phòng</td><td class="value">${fmtVND(d.grandTotal)}</td></tr>
      </tbody></table>
    </div>

    <div class="section">
      <div class="section-title">Thanh toán đặt cọc</div>
      <div class="qr-block">
        <img src="${qrUrl}" alt="QR chuyển khoản" />
        <div class="qr-info">
          <div class="amount">${fmtVND(opts.depositAmount)}</div>
          <table><tbody>
            <tr><td class="label">Ngân hàng</td><td class="value">${bank}</td></tr>
            <tr><td class="label">Số tài khoản</td><td class="value" style="font-weight:700;letter-spacing:1px">${acct}</td></tr>
            <tr><td class="label">Chủ TK</td><td class="value">${owner}</td></tr>
            <tr><td class="label">Nội dung CK</td><td class="value" style="color:#2d6a4f;font-weight:600">${addInfo}</td></tr>
            <tr><td class="label">Hạn cọc</td><td class="value" style="color:#ff4d4f;font-weight:600">${fmtDate(opts.deadline)}</td></tr>
          </tbody></table>
        </div>
      </div>
      <p style="font-size:11px;color:#888;margin-top:8px">* Scan QR bằng app ngân hàng để chuyển khoản nhanh. Sau khi chuyển, gửi ảnh xác nhận qua Zalo ${HOSTEL_PHONE}.</p>
    </div>

    ${cancelPolicyPreDepositHtml()}

    <div class="highlight">
      ⚠️ Chỗ chỉ được giữ sau khi nhận được khoản cọc. Hạn chót: <strong>${fmtDate(opts.deadline)}</strong>.
    </div>

    <div class="footer">${HOSTEL_NAME} · ${HOSTEL_ADDRESS}</div>
  </body></html>`;

  const zaloText = `💰 *YÊU CẦU ĐẶT CỌC — ${HOSTEL_NAME}*

Xin chào ${d.guestName},

Để giữ chỗ cho đặt phòng của bạn:
🛏 Phòng: ${d.roomName}
📅 ${nightsLabel(d)}
💵 Tổng: ${fmtVND(d.grandTotal)}

Vui lòng chuyển khoản:
💰 *${fmtVND(opts.depositAmount)}*
⏰ Hạn: *${fmtDate(opts.deadline)}*

🏦 ${bank}
🔢 STK: *${acct}*
👤 ${owner}
📝 Nội dung: ${addInfo}

Sau khi chuyển, gửi ảnh chụp màn hình để xác nhận nhé!

🔄 Chính sách huỷ: Hoàn 50% nếu huỷ trước 3–7 ngày. Không hoàn trong vòng 3 ngày check-in.

Mọi thắc mắc: ${HOSTEL_PHONE} 🌿`;

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
        <tr><td class="label">Phòng</td><td class="value">${d.roomName} (${d.roomType})</td></tr>
        <tr><td class="label">Thời gian</td><td class="value">${nightsLabel(d)}</td></tr>
      </tbody></table>
    </div>

    <div class="section">
      <div class="section-title">Lịch sử đặt cọc</div>
      <table class="line-table">
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Phương thức</th>
            <th style="text-align:right">Số tiền</th>
            <th>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          ${d.payments.length > 0
            ? d.payments.map(p => `
              <tr>
                <td>${fmtDate(p.date)}</td>
                <td>${PAYMENT_METHOD_LABEL[p.method] ?? p.method}</td>
                <td style="text-align:right">${fmtVND(p.amount)}</td>
                <td>${p.note ?? '—'}</td>
              </tr>`).join('')
            : '<tr><td colspan="4" style="text-align:center;color:#888">Chưa có khoản cọc nào.</td></tr>'
          }
        </tbody>
        <tfoot>
          <tr class="paid-row">
            <td colspan="2"><strong>Tổng đã cọc</strong></td>
            <td style="text-align:right"><strong>${fmtVND(depositPaid)}</strong></td>
            <td></td>
          </tr>
          <tr>
            <td colspan="2">Tổng hóa đơn</td>
            <td style="text-align:right">${fmtVND(d.grandTotal)}</td>
            <td></td>
          </tr>
          <tr class="${balance <= 0 ? 'paid-row' : 'remaining-row'}">
            <td colspan="2"><strong>Còn lại khi check-in</strong></td>
            <td style="text-align:right"><strong>${fmtVND(Math.max(0, balance))}</strong></td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>

    ${cancelPolicyPostDepositHtml()}
    ${houseRulesHtml()}

    <div class="highlight-green">
      ✅ Chúng tôi đã nhận cọc và xác nhận giữ phòng cho bạn. Hẹn gặp bạn ngày <strong>${fmtDate(d.checkIn)}</strong>!
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

✅ Phòng của bạn đã được giữ chắc chắn!

📋 Nội quy:
• Check-in 14:00 | Check-out trước 12:00
• Giữ yên lặng sau 22:00 | Không hút thuốc

🔄 Chính sách huỷ: Hoàn 50% nếu huỷ trước 3–7 ngày. Không hoàn trong vòng 3 ngày check-in.

Hẹn gặp bạn ngày ${fmtDate(d.checkIn)} tại Đà Lạt 🌿
📞 ${HOSTEL_PHONE}`;

  return { html, zaloText };
}

// ─── Template 4: Invoice (Hóa đơn checkout) ───────────────────────────────────

export function renderInvoice(d: DocumentData): { html: string; zaloText: string } {
  const invoiceNo = `HD-${dayjs(d.generatedAt).format('YYYYMMDD')}-${d.bookingId.slice(0, 6).toUpperCase()}`;
  const balance = remaining(d);
  // QR chỉ hiển thị khi còn nợ
  const addInfo = `TT hoa don ${invoiceNo} ${d.guestName}`;
  const qrUrl = balance > 0 ? vietQrUrl(balance, addInfo) : null;

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
            <td style="text-align:right">${fmtVND(d.roomSubtotal)}</td>
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
            <td>Giảm giá: ${disc.description ?? '—'}</td>
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
        ${d.paid > 0 ? `
        <tr class="paid-row">
          <td colspan="3" style="text-align:right">Đã thanh toán</td>
          <td style="text-align:right">-${fmtVND(d.paid)}</td>
        </tr>` : ''}
        <tr class="${balance <= 0 ? 'paid-row' : 'remaining-row'}" style="font-size:1.1em;">
          <td colspan="3" style="text-align:right"><strong>CÒN LẠI</strong></td>
          <td style="text-align:right"><strong>${fmtVND(Math.max(0, balance))}</strong></td>
        </tr>
      </tbody></table>
    </div>

    ${qrUrl ? `
    <div class="section">
      <div class="section-title">Thanh toán số tiền còn lại</div>
      <div class="qr-block">
        <img src="${qrUrl}" alt="QR thanh toán" />
        <div class="qr-info">
          <div class="amount">${fmtVND(balance)}</div>
          <table><tbody>
            <tr><td class="label">Ngân hàng</td><td class="value">Vietcombank (VCB)</td></tr>
            <tr><td class="label">Số tài khoản</td><td class="value" style="font-weight:700">${VQR_ACCOUNT}</td></tr>
            <tr><td class="label">Chủ TK</td><td class="value">${VQR_OWNER}</td></tr>
            <tr><td class="label">Nội dung</td><td class="value" style="color:#2d6a4f;font-weight:600">${addInfo}</td></tr>
          </tbody></table>
        </div>
      </div>
    </div>` : `
    <p style="text-align:center;margin-top:16px;font-size:12px;color:#2d6a4f;font-weight:600">🎉 Đã thanh toán đủ. Cảm ơn quý khách!</p>`}

    <p style="text-align:center;margin-top:12px;font-size:12px;color:#555">Cảm ơn quý khách đã lưu trú tại ${HOSTEL_NAME}. Hẹn gặp lại! 🌿</p>
    <div class="footer">${invoiceNo} · ${HOSTEL_NAME} · ${HOSTEL_ADDRESS}</div>
  </body></html>`;

  const zaloText = `🧾 *HÓA ĐƠN THANH TOÁN — ${HOSTEL_NAME}*
Số HĐ: ${invoiceNo}

Khách: ${d.guestName}
🛏 Phòng: ${d.roomName} | ${nightsLabel(d)}

CHI TIẾT:
• Tiền phòng: ${fmtVND(d.roomSubtotal)}
${d.services.map(s => `• ${s.name} (×${s.qty}): ${fmtVND(s.price * s.qty)}`).join('\n')}
${d.surcharge > 0 ? `• Phụ thu thẻ: ${fmtVND(d.surcharge)}` : ''}
${d.discounts.map(disc => `• Giảm (${disc.description ?? '—'}): -${fmtVND(disc.amount)}`).join('\n')}

💰 TỔNG: ${fmtVND(d.grandTotal)}
${d.paid > 0 ? `✅ Đã trả: ${fmtVND(d.paid)}` : ''}
${balance > 0 ? `⏳ Còn lại: *${fmtVND(balance)}*` : '🎉 Đã thanh toán đủ'}

Cảm ơn bạn đã ở lại Hello Dalat! 🌿`;

  return { html, zaloText };
}

// ─── Template 5: Arrival Notice ───────────────────────────────────────────────

export function renderArrivalNotice(d: DocumentData): { html: string; zaloText: string } {
  const bal = remaining(d);

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

    ${d.services.length > 0 ? `
    <div class="section">
      <div class="section-title">Dịch vụ đã đăng ký</div>
      <table class="line-table">
        <thead><tr><th>Dịch vụ</th><th style="text-align:center">SL</th><th style="text-align:right">Đơn giá</th></tr></thead>
        <tbody>
          ${d.services.map(s => `
          <tr>
            <td>${s.name}</td>
            <td style="text-align:center">${s.qty}</td>
            <td style="text-align:right">${fmtVND(s.price)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}

    ${d.discounts.length > 0 ? `
    <div class="section">
      <div class="section-title">Ưu đãi áp dụng</div>
      <p style="font-size:13px">Giảm giá: <strong>${fmtVND(d.discounts.reduce((s, disc) => s + disc.amount, 0))}</strong>
      ${d.discounts[0].description ? `(${d.discounts[0].description})` : ''}</p>
    </div>` : ''}

    ${houseRulesHtml()}

    ${bal > 0 ? `
    <div class="highlight">
      💵 Số tiền cần thanh toán khi check-in: <strong>${fmtVND(bal)}</strong>
    </div>` : `
    <div class="highlight-green">
      ✅ Bạn đã thanh toán đủ — chỉ cần đến nhận phòng!
    </div>`}

    <div class="footer">${HOSTEL_NAME} · ${HOSTEL_ADDRESS}</div>
  </body></html>`;

  const zaloText = `🌿 *NHẮC NHỞ CHECK-IN — ${HOSTEL_NAME}*

Xin chào ${d.guestName}!

Chúng tôi nhắc bạn về lịch check-in sắp tới:

🛏 Phòng: ${d.roomName}
📅 Check-in: *${fmtDate(d.checkIn)}* từ 14:00${d.hasEarlyCheckIn ? ' (Early check-in)' : ''}
📅 Check-out: ${fmtDate(d.checkOut)} trước 12:00${d.hasLateCheckOut ? ' (Late check-out)' : ''}

📍 Địa chỉ: ${HOSTEL_ADDRESS}
📞 Liên hệ: ${HOSTEL_PHONE}

📋 Nội quy:
• Check-in 14:00 | Check-out trước 12:00
• Giữ yên lặng sau 22:00 | Không hút thuốc

${bal > 0
  ? `💵 Còn lại khi check-in: *${fmtVND(bal)}* (tiền mặt hoặc CK)`
  : '✅ Bạn đã thanh toán đủ rồi!'
}

Nếu đến muộn sau 22:00, vui lòng báo trước qua Zalo nhé!
Hẹn gặp bạn tại Đà Lạt! 🌿`;

  return { html, zaloText };
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  booking_confirmation: 'Xác nhận đặt phòng',
  deposit_request: 'Yêu cầu đặt cọc',
  deposit_confirmation: 'Xác nhận nhận cọc',
  invoice: 'Hóa đơn',
  arrival_notice: 'Thông báo check-in',
};

export type { DocKind };
