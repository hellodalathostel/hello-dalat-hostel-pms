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
  bookingId: string;
  groupId: string;
  roomName: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestsCount: number;
  hasEarlyCheckIn: boolean;
  hasLateCheckOut: boolean;
  guestName: string;
  guestPhone: string;
  source: string;
  otaBookingNumber?: string;
  pricePerNight: number;
  roomSubtotal: number;
  surcharge: number;
  grandTotal: number;
  services: BookingServiceItem[];
  discounts: BookingDiscountItem[];
  paid: number;
  payments: PaymentItem[];
  generatedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HOSTEL_NAME = 'Hello Dalat Hostel';
const HOSTEL_ADDRESS = '33/18/2 Phan Đình Phùng, P.1, Đà Lạt';
const HOSTEL_PHONE = '0969 975 935';
const HOSTEL_EMAIL = 'hellodalathostel@gmail.com';
const LOGO_URL = 'https://rcfhhgywjdwqcgnpkbtl.supabase.co/storage/v1/object/public/assets/1773723283955.png';

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

const fmtVND = (amount: number) =>
  new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';

const fmtDate = (d: string) => dayjs(d).format('DD/MM/YYYY');
const fmtDateTime = (d: string) => dayjs(d).format('DD/MM/YYYY HH:mm');

const nightsLabel = (d: DocumentData) =>
  `${d.nights} đêm (${fmtDate(d.checkIn)} → ${fmtDate(d.checkOut)})`;

const servicesTotal = (services: BookingServiceItem[]) =>
  services.reduce((sum, s) => sum + s.price * s.qty, 0);

const remaining = (d: DocumentData) => d.grandTotal - d.paid;

const removeDiacritics = (str: string) =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

const vietQrUrl = (amount: number, addInfo: string) => {
  const safeInfo = encodeURIComponent(removeDiacritics(addInfo));
  const safeName = encodeURIComponent(removeDiacritics(VQR_OWNER));
  return `https://img.vietqr.io/image/${VQR_BANK}-${VQR_ACCOUNT}-print.png?amount=${amount}&addInfo=${safeInfo}&accountName=${safeName}`;
};

// ─── CSS Base (A4-native, print-first, guest-facing) ─────────────────────────

const BASE_STYLE = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Playfair+Display:wght@600&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Be Vietnam Pro', 'Segoe UI', sans-serif;
      font-size: 13px;
      line-height: 1.65;
      color: #1c1c1c;
      background: #fff;
      padding: 32px 36px 28px;
      max-width: 700px;
      margin: 0 auto;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding-bottom: 16px;
      margin-bottom: 20px;
      border-bottom: 2px solid #2d6a4f;
    }
    .header-logo {
      width: 52px;
      height: 52px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .header-brand { flex: 1; }
    .header-brand h1 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 19px;
      color: #2d6a4f;
      font-weight: 600;
      letter-spacing: 0.2px;
      line-height: 1.2;
    }
    .header-brand .tagline {
      font-size: 11px;
      color: #888;
      margin-top: 3px;
      line-height: 1.5;
    }
    .header-contact {
      text-align: right;
      font-size: 11px;
      color: #555;
      line-height: 1.8;
    }
    .header-contact a { color: #2d6a4f; text-decoration: none; }

    /* ── Document title block ── */
    .doc-header {
      text-align: center;
      margin: 0 0 20px;
      padding: 14px 20px;
      background: #f6faf7;
      border-radius: 8px;
      border: 1px solid #c8e6c9;
    }
    .doc-header .doc-title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 17px;
      font-weight: 600;
      color: #1c1c1c;
      text-transform: uppercase;
      letter-spacing: 1.5px;
    }
    .doc-header .doc-meta {
      font-size: 11px;
      color: #999;
      margin-top: 4px;
    }

    /* ── Section ── */
    .section { margin-bottom: 18px; }
    .section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: #2d6a4f;
      border-bottom: 1px solid #c8e6c9;
      padding-bottom: 5px;
      margin-bottom: 10px;
    }

    /* ── Two-column info grid ── */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 24px;
    }
    .info-row {
      display: flex;
      flex-direction: column;
      padding: 5px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    .info-row:last-child { border-bottom: none; }
    .info-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #999;
      font-weight: 600;
    }
    .info-value {
      font-size: 13px;
      font-weight: 500;
      color: #1c1c1c;
      margin-top: 1px;
    }

    /* ── Simple key-value table (fallback) ── */
    table { width: 100%; border-collapse: collapse; }
    td { padding: 5px 6px; vertical-align: top; }
    td.label { width: 38%; color: #777; font-size: 11.5px; }
    td.value { font-weight: 500; font-size: 13px; }

    /* ── Line items table ── */
    .line-table { border-radius: 6px; overflow: hidden; border: 1px solid #e8e8e8; }
    .line-table th {
      background: #f6faf7;
      padding: 7px 10px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #444;
      border-bottom: 1px solid #e0e0e0;
    }
    .line-table td {
      padding: 7px 10px;
      font-size: 12.5px;
      border-bottom: 1px solid #f0f0f0;
    }
    .line-table tr:last-child td { border-bottom: none; }

    /* ── Totals ── */
    .total-row td {
      background: #e8f5e9;
      font-size: 14px;
      font-weight: 700;
      color: #1b5e20;
      border-top: 1px solid #c8e6c9;
    }
    .paid-row td {
      background: #e3f2fd;
      font-weight: 600;
      color: #0d47a1;
      font-size: 13px;
    }
    .remaining-row td {
      background: #fff8e1;
      font-weight: 700;
      color: #e65100;
      font-size: 14px;
      border-top: 1px solid #ffe0b2;
    }

    /* ── Highlight callout ── */
    .callout {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 8px;
      margin-top: 16px;
      font-size: 13px;
      line-height: 1.6;
    }
    .callout-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
    .callout-yellow { background: #fffde7; border: 1px solid #ffe082; }
    .callout-green  { background: #f1f8e9; border: 1px solid #aed581; }
    .callout-red    { background: #fff3e0; border: 1px solid #ffcc80; }

    /* ── QR payment block ── */
    .qr-section {
      display: flex;
      gap: 20px;
      align-items: flex-start;
      padding: 14px;
      background: #fafafa;
      border: 1px solid #e8e8e8;
      border-radius: 8px;
    }
    .qr-section img {
      width: 150px;
      height: 150px;
      border-radius: 6px;
      border: 1px solid #e0e0e0;
      flex-shrink: 0;
    }
    .qr-details { flex: 1; }
    .qr-amount {
      font-size: 24px;
      font-weight: 700;
      color: #1b5e20;
      margin-bottom: 10px;
      line-height: 1;
    }
    .qr-details table td { padding: 3px 6px; font-size: 12px; }
    .qr-note {
      font-size: 11px;
      color: #888;
      margin-top: 8px;
      line-height: 1.5;
    }

    /* ── Cancel policy ── */
    .cancel-table { border-radius: 6px; overflow: hidden; border: 1px solid #e8e8e8; }
    .cancel-table th {
      background: #fafafa;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #555;
      border-bottom: 1px solid #e0e0e0;
    }
    .cancel-table td {
      padding: 7px 10px;
      font-size: 12px;
      border-bottom: 1px solid #f5f5f5;
    }
    .cancel-table tr:last-child td { border-bottom: none; }
    .refund-ok   { color: #2e7d32; font-weight: 600; }
    .refund-none { color: #c62828; font-weight: 600; }

    /* ── House rules ── */
    .rules-list { list-style: none; padding: 0; }
    .rules-list li {
      padding: 5px 0;
      font-size: 12px;
      color: #444;
      border-bottom: 1px solid #f5f5f5;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .rules-list li:last-child { border-bottom: none; }

    /* ── Badge ── */
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 20px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }
    .badge-green  { background: #e8f5e9; color: #2e7d32; }
    .badge-yellow { background: #fff8e1; color: #e65100; }

    /* ── Divider ── */
    .divider {
      border: none;
      border-top: 1px solid #eeeeee;
      margin: 18px 0;
    }

    /* ── Footer ── */
    .doc-footer {
      margin-top: 28px;
      padding-top: 12px;
      border-top: 2px solid #f0f0f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10.5px;
      color: #bbb;
    }
    .doc-footer .brand { color: #2d6a4f; font-weight: 600; }

    /* ── Print overrides ── */
    @media print {
      body { padding: 18px 22px; max-width: 100%; font-size: 12px; }
      .callout { padding: 9px 13px; }
      .qr-section img { width: 130px; height: 130px; }
      .doc-header { padding: 10px 16px; }
    }
  </style>
`;

// ─── Header component ─────────────────────────────────────────────────────────

const htmlHeader = () => `
  <div class="header">
    <img class="header-logo" src="${LOGO_URL}" alt="Hello Dalat Hostel logo" />
    <div class="header-brand">
      <h1>${HOSTEL_NAME}</h1>
      <div class="tagline">${HOSTEL_ADDRESS}</div>
    </div>
    <div class="header-contact">
      <div>📞 ${HOSTEL_PHONE}</div>
      <div>✉ ${HOSTEL_EMAIL}</div>
    </div>
  </div>
`;

// ─── Footer component ─────────────────────────────────────────────────────────

const htmlFooter = (extra?: string) => `
  <div class="doc-footer">
    <span class="brand">${HOSTEL_NAME}</span>
    <span>${extra ?? HOSTEL_ADDRESS}</span>
  </div>
`;

// ─── House Rules ──────────────────────────────────────────────────────────────

const houseRulesHtml = () => `
  <div class="section">
    <div class="section-title">Nội quy phòng</div>
    <ul class="rules-list">
      <li><span>🕑</span><span>Check-in: từ 14:00 — Check-out: trước 12:00</span></li>
      <li><span>🌙</span><span>Giữ yên lặng sau 22:00, tránh làm phiền các phòng khác</span></li>
      <li><span>🚭</span><span>Không hút thuốc trong phòng và khu vực chung của hostel</span></li>
      <li><span>🔑</span><span>Vui lòng trả chìa khoá/thẻ phòng khi check-out</span></li>
      <li><span>📞</span><span>Mọi hỗ trợ: ${HOSTEL_PHONE} (Zalo/Call)</span></li>
    </ul>
  </div>
`;

// ─── Cancel Policy blocks ─────────────────────────────────────────────────────

const cancelPolicyPreDepositHtml = () => `
  <div class="section">
    <div class="section-title">Chính sách huỷ phòng</div>
    <table class="cancel-table" style="width:100%">
      <thead>
        <tr><th>Thời điểm huỷ</th><th>Hoàn tiền</th></tr>
      </thead>
      <tbody>
        <tr><td>Trước 7 ngày check-in</td><td class="refund-ok">Hoàn 50% tiền cọc</td></tr>
        <tr><td>Trong vòng 3–7 ngày trước check-in</td><td class="refund-ok">Hoàn 50% tiền cọc</td></tr>
        <tr><td>Trong vòng 3 ngày trước check-in</td><td class="refund-none">Không hoàn (Non-refundable)</td></tr>
      </tbody>
    </table>
    <p style="font-size:11px;color:#999;margin-top:6px">* Chính sách áp dụng sau khi đặt cọc. Chưa có cọc = chỗ chưa được giữ.</p>
  </div>
`;

const cancelPolicyPostDepositHtml = () => `
  <div class="section">
    <div class="section-title">Chính sách huỷ phòng</div>
    <table class="cancel-table" style="width:100%">
      <thead>
        <tr><th>Thời điểm huỷ</th><th>Hoàn tiền cọc</th></tr>
      </thead>
      <tbody>
        <tr><td>Huỷ trước 7 ngày check-in</td><td class="refund-ok">Hoàn 50%</td></tr>
        <tr><td>Huỷ từ 3–7 ngày trước check-in</td><td class="refund-ok">Hoàn 50%</td></tr>
        <tr><td>Huỷ trong vòng 3 ngày trước check-in</td><td class="refund-none">Không hoàn (Non-refundable)</td></tr>
      </tbody>
    </table>
  </div>
`;

// ─── Template 1: Booking Confirmation ─────────────────────────────────────────

export function renderBookingConfirmation(d: DocumentData): { html: string; zaloText: string } {
  const hasDeposit = d.paid > 0;

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Xác nhận đặt phòng</title>${BASE_STYLE}</head><body>
    ${htmlHeader()}

    <div class="doc-header">
      <div class="doc-title">Phiếu xác nhận đặt phòng</div>
      <div class="doc-meta">Ngày tạo: ${fmtDateTime(d.generatedAt)}${d.otaBookingNumber ? ` · Mã OTA: ${d.otaBookingNumber}` : ''}</div>
    </div>

    <div class="section">
      <div class="section-title">Thông tin khách</div>
      <div class="info-grid">
        <div class="info-row">
          <span class="info-label">Họ tên</span>
          <span class="info-value">${d.guestName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Số điện thoại</span>
          <span class="info-value">${d.guestPhone || '—'}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Chi tiết đặt phòng</div>
      <div class="info-grid">
        <div class="info-row">
          <span class="info-label">Phòng</span>
          <span class="info-value">${d.roomName} <span style="color:#888;font-weight:400">(${d.roomType})</span></span>
        </div>
        <div class="info-row">
          <span class="info-label">Số khách</span>
          <span class="info-value">${d.guestsCount} người</span>
        </div>
        <div class="info-row">
          <span class="info-label">Check-in</span>
          <span class="info-value">${fmtDate(d.checkIn)} · từ 14:00${d.hasEarlyCheckIn ? ' <span class="badge badge-yellow">Early</span>' : ''}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Check-out</span>
          <span class="info-value">${fmtDate(d.checkOut)} · trước 12:00${d.hasLateCheckOut ? ' <span class="badge badge-yellow">Late</span>' : ''}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Số đêm</span>
          <span class="info-value">${d.nights} đêm</span>
        </div>
        <div class="info-row">
          <span class="info-label">Giá/đêm</span>
          <span class="info-value">${fmtVND(d.pricePerNight)}</span>
        </div>
      </div>
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
      <table class="line-table">
        <tbody>
          <tr><td>Tiền phòng (${d.nights} đêm × ${fmtVND(d.pricePerNight)})</td><td style="text-align:right">${fmtVND(d.roomSubtotal)}</td></tr>
          ${d.services.length > 0 ? `<tr><td>Dịch vụ</td><td style="text-align:right">${fmtVND(servicesTotal(d.services))}</td></tr>` : ''}
          ${d.surcharge > 0 ? `<tr><td>Phụ thu thanh toán thẻ</td><td style="text-align:right">${fmtVND(d.surcharge)}</td></tr>` : ''}
          ${d.discounts.map(disc => `<tr><td>Giảm giá${disc.description ? `: ${disc.description}` : ''}</td><td style="text-align:right;color:#2e7d32">−${fmtVND(disc.amount)}</td></tr>`).join('')}
          <tr class="total-row"><td><strong>TỔNG CỘNG</strong></td><td style="text-align:right"><strong>${fmtVND(d.grandTotal)}</strong></td></tr>
          ${hasDeposit ? `
          <tr class="paid-row"><td>Đã đặt cọc</td><td style="text-align:right">−${fmtVND(d.paid)}</td></tr>
          <tr class="remaining-row"><td><strong>Còn lại khi check-in</strong></td><td style="text-align:right"><strong>${fmtVND(Math.max(0, remaining(d)))}</strong></td></tr>
          ` : ''}
        </tbody>
      </table>
    </div>

    ${hasDeposit
      ? `<div class="callout callout-green"><span class="callout-icon">✅</span><span>Chỗ của bạn đã được giữ chắc chắn. Hẹn gặp bạn ngày <strong>${fmtDate(d.checkIn)}</strong> tại Hello Dalat! 🌿</span></div>`
      : `<div class="callout callout-yellow"><span class="callout-icon">⚠️</span><span><strong>Chỗ chưa được giữ.</strong> Vui lòng đặt cọc để xác nhận booking. Liên hệ <strong>${HOSTEL_PHONE}</strong> để được hỗ trợ.</span></div>`
    }

    <hr class="divider">
    ${hasDeposit ? houseRulesHtml() : ''}
    ${hasDeposit ? cancelPolicyPostDepositHtml() : cancelPolicyPreDepositHtml()}

    ${htmlFooter()}
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
  const bank = opts.bankName ?? 'Vietcombank (VCB)';
  const acct = opts.bankAccount ?? VQR_ACCOUNT;
  const owner = opts.bankOwner ?? VQR_OWNER;
  const addInfo = `Coc phong ${d.roomName} ${fmtDate(d.checkIn)} ${d.guestName}`;
  const qrUrl = vietQrUrl(opts.depositAmount, addInfo);

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Yêu cầu đặt cọc</title>${BASE_STYLE}</head><body>
    ${htmlHeader()}

    <div class="doc-header">
      <div class="doc-title">Yêu cầu đặt cọc</div>
      <div class="doc-meta">Ngày tạo: ${fmtDateTime(d.generatedAt)}</div>
    </div>

    <div class="section">
      <div class="section-title">Thông tin đặt phòng</div>
      <div class="info-grid">
        <div class="info-row">
          <span class="info-label">Khách</span>
          <span class="info-value">${d.guestName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Phòng</span>
          <span class="info-value">${d.roomName} <span style="color:#888;font-weight:400">(${d.roomType})</span></span>
        </div>
        <div class="info-row">
          <span class="info-label">Thời gian</span>
          <span class="info-value">${nightsLabel(d)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Tổng tiền phòng</span>
          <span class="info-value">${fmtVND(d.grandTotal)}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Thanh toán đặt cọc</div>
      <div class="qr-section">
        <img src="${qrUrl}" alt="QR chuyển khoản" />
        <div class="qr-details">
          <div class="qr-amount">${fmtVND(opts.depositAmount)}</div>
          <table><tbody>
            <tr><td class="label">Ngân hàng</td><td class="value">${bank}</td></tr>
            <tr><td class="label">Số tài khoản</td><td class="value" style="font-weight:700;letter-spacing:1px">${acct}</td></tr>
            <tr><td class="label">Chủ TK</td><td class="value">${owner}</td></tr>
            <tr><td class="label">Nội dung CK</td><td class="value" style="color:#2d6a4f;font-weight:600">${addInfo}</td></tr>
            <tr><td class="label">Hạn cọc</td><td class="value" style="color:#c62828;font-weight:700">${fmtDate(opts.deadline)}</td></tr>
          </tbody></table>
          <p class="qr-note">Scan QR bằng app ngân hàng để chuyển khoản nhanh. Sau khi chuyển, gửi ảnh xác nhận qua Zalo ${HOSTEL_PHONE}.</p>
        </div>
      </div>
    </div>

    ${cancelPolicyPreDepositHtml()}

    <div class="callout callout-yellow">
      <span class="callout-icon">⚠️</span>
      <span>Chỗ chỉ được giữ sau khi nhận được khoản cọc. Hạn chót: <strong>${fmtDate(opts.deadline)}</strong>.</span>
    </div>

    ${htmlFooter()}
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

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Xác nhận nhận cọc</title>${BASE_STYLE}</head><body>
    ${htmlHeader()}

    <div class="doc-header">
      <div class="doc-title">Xác nhận nhận cọc</div>
      <div class="doc-meta">Ngày xác nhận: ${fmtDateTime(d.generatedAt)}</div>
    </div>

    <div class="section">
      <div class="section-title">Thông tin đặt phòng</div>
      <div class="info-grid">
        <div class="info-row">
          <span class="info-label">Khách</span>
          <span class="info-value">${d.guestName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Phòng</span>
          <span class="info-value">${d.roomName} <span style="color:#888;font-weight:400">(${d.roomType})</span></span>
        </div>
        <div class="info-row">
          <span class="info-label">Thời gian</span>
          <span class="info-value">${nightsLabel(d)}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Lịch sử đặt cọc</div>
      <table class="line-table">
        <thead>
          <tr><th>Ngày</th><th>Phương thức</th><th style="text-align:right">Số tiền</th><th>Ghi chú</th></tr>
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
            : '<tr><td colspan="4" style="text-align:center;color:#999;padding:12px">Chưa có khoản cọc nào.</td></tr>'
          }
        </tbody>
        <tfoot>
          <tr class="paid-row">
            <td colspan="2"><strong>Tổng đã cọc</strong></td>
            <td style="text-align:right"><strong>${fmtVND(depositPaid)}</strong></td>
            <td></td>
          </tr>
          <tr>
            <td colspan="2" style="color:#777">Tổng hóa đơn</td>
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

    <div class="callout callout-green">
      <span class="callout-icon">✅</span>
      <span>Chúng tôi đã nhận cọc và xác nhận giữ phòng cho bạn. Hẹn gặp bạn ngày <strong>${fmtDate(d.checkIn)}</strong>!</span>
    </div>

    ${htmlFooter()}
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
  const addInfo = `TT hoa don ${invoiceNo} ${d.guestName}`;
  const qrUrl = balance > 0 ? vietQrUrl(balance, addInfo) : null;

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Hóa đơn</title>${BASE_STYLE}</head><body>
    ${htmlHeader()}

    <div class="doc-header">
      <div class="doc-title">Hóa đơn thanh toán</div>
      <div class="doc-meta">Số HĐ: ${invoiceNo} · Ngày: ${fmtDateTime(d.generatedAt)}</div>
    </div>

    <div class="section">
      <div class="section-title">Thông tin khách</div>
      <div class="info-grid">
        <div class="info-row">
          <span class="info-label">Họ tên</span>
          <span class="info-value">${d.guestName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Số điện thoại</span>
          <span class="info-value">${d.guestPhone || '—'}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Chi tiết sử dụng</div>
      <table class="line-table">
        <thead>
          <tr><th>Mô tả</th><th style="text-align:right">Đơn giá</th><th style="text-align:center">SL</th><th style="text-align:right">Thành tiền</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Phòng ${d.roomName} <span style="color:#888">(${d.roomType})</span><br><small style="color:#999">${nightsLabel(d)}</small></td>
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
          <tr style="color:#2e7d32">
            <td>Giảm giá: ${disc.description ?? '—'}</td>
            <td style="text-align:right">—</td>
            <td style="text-align:center">—</td>
            <td style="text-align:right">−${fmtVND(disc.amount)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="3"><strong>TỔNG CỘNG</strong></td>
            <td style="text-align:right"><strong>${fmtVND(d.grandTotal)}</strong></td>
          </tr>
          ${d.paid > 0 ? `
          <tr class="paid-row">
            <td colspan="3" style="text-align:right">Đã thanh toán</td>
            <td style="text-align:right">−${fmtVND(d.paid)}</td>
          </tr>` : ''}
          <tr class="${balance <= 0 ? 'paid-row' : 'remaining-row'}">
            <td colspan="3" style="text-align:right"><strong>CÒN LẠI</strong></td>
            <td style="text-align:right"><strong>${fmtVND(Math.max(0, balance))}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>

    ${qrUrl ? `
    <div class="section">
      <div class="section-title">Thanh toán số tiền còn lại</div>
      <div class="qr-section">
        <img src="${qrUrl}" alt="QR thanh toán" />
        <div class="qr-details">
          <div class="qr-amount">${fmtVND(balance)}</div>
          <table><tbody>
            <tr><td class="label">Ngân hàng</td><td class="value">Vietcombank (VCB)</td></tr>
            <tr><td class="label">Số tài khoản</td><td class="value" style="font-weight:700">${VQR_ACCOUNT}</td></tr>
            <tr><td class="label">Chủ TK</td><td class="value">${VQR_OWNER}</td></tr>
            <tr><td class="label">Nội dung</td><td class="value" style="color:#2d6a4f;font-weight:600">${addInfo}</td></tr>
          </tbody></table>
        </div>
      </div>
    </div>` : `
    <div class="callout callout-green">
      <span class="callout-icon">🎉</span>
      <span>Đã thanh toán đủ. Cảm ơn quý khách!</span>
    </div>`}

    <p style="text-align:center;margin-top:16px;font-size:12px;color:#777">Cảm ơn quý khách đã lưu trú tại ${HOSTEL_NAME}. Hẹn gặp lại! 🌿</p>
    ${htmlFooter(invoiceNo + ' · ' + HOSTEL_ADDRESS)}
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

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Thông báo check-in</title>${BASE_STYLE}</head><body>
    ${htmlHeader()}

    <div class="doc-header">
      <div class="doc-title">Thông báo trước ngày đến</div>
      <div class="doc-meta">Ngày gửi: ${fmtDateTime(d.generatedAt)}</div>
    </div>

    <div class="section">
      <div class="section-title">Lịch check-in của bạn</div>
      <div class="info-grid">
        <div class="info-row">
          <span class="info-label">Khách</span>
          <span class="info-value">${d.guestName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Phòng</span>
          <span class="info-value">${d.roomName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Check-in</span>
          <span class="info-value">${fmtDate(d.checkIn)} — từ 14:00${d.hasEarlyCheckIn ? ' <span class="badge badge-green">Early check-in ✓</span>' : ''}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Check-out</span>
          <span class="info-value">${fmtDate(d.checkOut)} — trước 12:00${d.hasLateCheckOut ? ' <span class="badge badge-green">Late check-out ✓</span>' : ''}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Số đêm</span>
          <span class="info-value">${d.nights} đêm</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Hướng dẫn nhận phòng</div>
      <div class="info-grid">
        <div class="info-row">
          <span class="info-label">Địa chỉ</span>
          <span class="info-value">${HOSTEL_ADDRESS}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Giờ check-in</span>
          <span class="info-value">14:00 – 22:00 <span style="color:#888;font-size:11px">(muộn hơn: báo trước qua Zalo)</span></span>
        </div>
        <div class="info-row">
          <span class="info-label">Liên hệ</span>
          <span class="info-value">${HOSTEL_PHONE} (Zalo/Call)</span>
        </div>
        <div class="info-row">
          <span class="info-label">Thanh toán</span>
          <span class="info-value">Tiền mặt hoặc chuyển khoản khi check-in</span>
        </div>
      </div>
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

    ${bal > 0
      ? `<div class="callout callout-yellow"><span class="callout-icon">💵</span><span>Số tiền cần thanh toán khi check-in: <strong>${fmtVND(bal)}</strong></span></div>`
      : `<div class="callout callout-green"><span class="callout-icon">✅</span><span>Bạn đã thanh toán đủ — chỉ cần đến nhận phòng!</span></div>`
    }

    ${htmlFooter()}
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