// src/features/documents/documentTemplates.ts
// Templates tạo nội dung cho 5 loại document — tiếng Việt (VI) và tiếng Anh (EN).
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
  surcharge: number;        // phụ thu thẻ — do trigger tính, frontend đọc từ DB
  grandTotal: number;
  services: BookingServiceItem[];
  discounts: BookingDiscountItem[];
  paid: number;
  payments: PaymentItem[];
  generatedAt: string;
  lang?: 'vi' | 'en';      // ngôn ngữ template, mặc định 'vi'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HOSTEL_NAME    = 'Hello Dalat Hostel';
const HOSTEL_ADDR_VI = '33/18/2 Phan Đình Phùng, P.1, Đà Lạt · Lâm Đồng';
const HOSTEL_ADDR_EN = '33/18/2 Phan Dinh Phung St., Ward 1, Da Lat · Lam Dong, Vietnam';
const HOSTEL_PHONE   = '0969 975 935';
const HOSTEL_PHONE_INTL = '+84 969 975 935';
const HOSTEL_EMAIL   = 'hellodalathostel@gmail.com';
const LOGO_URL       = 'https://rcfhhgywjdwqcgnpkbtl.supabase.co/storage/v1/object/public/assets/1773723283955.png';

const VQR_BANK    = 'VCB';
const VQR_ACCOUNT = '9969975935';
const VQR_ACCOUNT_DISPLAY = '9969 975 935';
const VQR_OWNER   = 'NGUYEN THANH HIEU';

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
  card: 'Thẻ',
  momo: 'MoMo',
  zalopay: 'ZaloPay',
  other: 'Khác',
};

const PAYMENT_METHOD_LABEL_EN: Record<string, string> = {
  cash: 'Cash',
  transfer: 'Bank transfer',
  card: 'Card',
  momo: 'MoMo',
  zalopay: 'ZaloPay',
  other: 'Other',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtVND = (amount: number) =>
  new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';

const fmtVND_EN = (amount: number) =>
  new Intl.NumberFormat('vi-VN').format(amount) + ' VND';

const fmtDate_VI = (d: string) => dayjs(d).format('DD/MM/YYYY');
const fmtDate_EN = (d: string) => dayjs(d).format('DD MMM YYYY');
const fmtDateTime_VI = (d: string) => dayjs(d).format('DD/MM/YYYY HH:mm');
const fmtDateTime_EN = (d: string) => dayjs(d).format('DD MMM YYYY · HH:mm');

const nightsLabel_VI = (d: DocumentData) =>
  `${d.nights} đêm (${fmtDate_VI(d.checkIn)} → ${fmtDate_VI(d.checkOut)})`;
const nightsLabel_EN = (d: DocumentData) =>
  `${d.nights} nights · ${fmtDate_EN(d.checkIn)} → ${fmtDate_EN(d.checkOut)}`;

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

// QR SVG placeholder (hiển thị khi không có real QR)
const QR_PLACEHOLDER_SVG = `
  <svg viewBox="0 0 24 24" width="70" height="70" fill="none" stroke="#2d6a4f" stroke-width="1.5">
    <rect x="3" y="3" width="8" height="8"/>
    <rect x="13" y="3" width="8" height="8"/>
    <rect x="3" y="13" width="8" height="8"/>
    <rect x="5" y="5" width="4" height="4" fill="#2d6a4f" stroke="none"/>
    <rect x="15" y="5" width="4" height="4" fill="#2d6a4f" stroke="none"/>
    <rect x="5" y="15" width="4" height="4" fill="#2d6a4f" stroke="none"/>
    <line x1="14" y1="14" x2="14" y2="14" stroke="#2d6a4f" stroke-width="2"/>
    <line x1="17" y1="14" x2="17" y2="14" stroke="#2d6a4f" stroke-width="2"/>
    <line x1="20" y1="14" x2="20" y2="14" stroke="#2d6a4f" stroke-width="2"/>
    <line x1="14" y1="17" x2="14" y2="17" stroke="#2d6a4f" stroke-width="2"/>
    <line x1="20" y1="17" x2="20" y2="17" stroke="#2d6a4f" stroke-width="2"/>
    <line x1="14" y1="20" x2="20" y2="20" stroke="#2d6a4f" stroke-width="2"/>
    <line x1="17" y1="17" x2="17" y2="20" stroke="#2d6a4f" stroke-width="2"/>
  </svg>`;

// ─── CSS Base ─────────────────────────────────────────────────────────────────
// Tất cả màu text trong callout/table dùng hardcode hex để đảm bảo đọc được
// trên cả light mode và dark mode trong popup window.

const BASE_STYLE = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Be Vietnam Pro', 'Segoe UI', sans-serif;
    font-size: 13px;
    line-height: 1.6;
    color: #1a1a1a;
    background: #fff;
    padding: 0;
    max-width: 700px;
    margin: 0 auto;
  }

  /* ── Masthead ── */
  .masthead {
    background: #2d6a4f;
    padding: 20px 28px;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .masthead-logo {
    width: 44px; height: 44px;
    border-radius: 50%;
    background: rgba(255,255,255,0.15);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
  }
  .masthead-logo img { width: 44px; height: 44px; object-fit: cover; }
  .masthead-brand { flex: 1; }
  .masthead-brand h1 {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 18px; font-weight: 600;
    color: #fff; letter-spacing: 0.3px; line-height: 1.2;
  }
  .masthead-brand p { font-size: 10.5px; color: rgba(255,255,255,0.65); margin-top: 2px; }
  .masthead-contact { text-align: right; font-size: 10.5px; color: rgba(255,255,255,0.78); line-height: 1.9; }

  /* ── Title band ── */
  .title-band {
    border-bottom: 0.5px solid #e0d8c8;
    padding: 14px 28px;
    display: flex; justify-content: space-between; align-items: center;
    background: #faf8f4;
  }
  .doc-title {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 20px; font-weight: 600;
    color: #1a1a1a; letter-spacing: 0.3px;
  }
  .doc-meta { font-size: 10px; color: #8a7a60; text-align: right; line-height: 1.8; }

  /* ── Body ── */
  .doc-body { padding: 22px 28px; background: #fff; }

  /* ── Section ── */
  .section { margin-bottom: 20px; }
  .section-label {
    font-size: 9px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 2px;
    color: #2d6a4f;
    padding-bottom: 7px;
    border-bottom: 1px solid #c8ddd0;
    margin-bottom: 12px;
    display: flex; align-items: center; gap: 6px;
  }
  .section-label::before {
    content: '';
    display: inline-block; width: 3px; height: 10px;
    background: #2d6a4f; border-radius: 2px; flex-shrink: 0;
  }

  /* ── Info grid ── */
  .info-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    border: 0.5px solid #e8e0d0; border-radius: 4px; overflow: hidden;
  }
  .info-cell {
    padding: 9px 12px;
    border-bottom: 0.5px solid #e8e0d0;
    border-right: 0.5px solid #e8e0d0;
    background: #fff;
  }
  .info-cell:nth-child(even) { border-right: none; }
  .info-cell:nth-last-child(-n+2) { border-bottom: none; }
  .info-cell.full { grid-column: span 2; border-right: none; }
  .info-key {
    font-size: 9px; text-transform: uppercase;
    letter-spacing: 1.5px; color: #8a7a60; font-weight: 700; margin-bottom: 3px;
  }
  .info-val { font-size: 13px; font-weight: 500; color: #1a1a1a; line-height: 1.4; }
  .info-val.muted { color: #8a7a60; font-weight: 400; }

  /* ── Badge ── */
  .badge {
    display: inline-block; padding: 1px 6px;
    border-radius: 20px; font-size: 9.5px; font-weight: 700;
  }
  .badge-green { background: #c8e6c9; color: #1b5e20; }
  .badge-amber { background: #ffe0b2; color: #6d3200; }

  /* ── Line table ── */
  .line-table { width: 100%; border-collapse: collapse; border: 0.5px solid #e0d8c8; }
  .line-table thead tr { background: #f5f0e8; }
  .line-table th {
    padding: 7px 12px; font-size: 9.5px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 1.2px; color: #5a4a30;
    border-bottom: 0.5px solid #e0d8c8; text-align: left;
  }
  .line-table td {
    padding: 8px 12px; font-size: 12.5px;
    border-bottom: 0.5px solid #f0ebe0;
    color: #1a1a1a; vertical-align: middle; background: #fff;
  }
  .line-table tr:last-child td { border-bottom: none; }
  .line-table .total-row td {
    background: #d4edda; font-weight: 700; color: #0a3d1a;
    font-size: 13.5px; border-top: 1px solid #a8d5b5;
  }
  .line-table .paid-row td { background: #dce8fa; color: #0c2a5e; font-weight: 600; }
  .line-table .due-row td {
    background: #fde8c8; color: #6d2800; font-weight: 700;
    font-size: 13.5px; border-top: 1px solid #f5c87a;
  }
  /* Dòng phụ thu thẻ — nền nhẹ để phân biệt với dịch vụ thường */
  .line-table .surcharge-row td { background: #fdf6ee; color: #7a4500; }
  .tr { text-align: right; }
  .tc { text-align: center; }

  /* ── QR block ── */
  .qr-block {
    display: flex; gap: 18px; padding: 16px;
    background: #f7f4ef; border: 0.5px solid #e0d8c8; border-radius: 4px;
    align-items: flex-start;
  }
  .qr-img {
    width: 110px; height: 110px;
    background: #fff; border: 0.5px solid #d0c8b8; border-radius: 4px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    overflow: hidden;
  }
  .qr-img img { width: 110px; height: 110px; object-fit: contain; }
  .qr-info { flex: 1; }
  .qr-amount {
    font-family: 'Cormorant Garamond', serif;
    font-size: 22px; font-weight: 600; color: #0a3d1a; line-height: 1; margin-bottom: 10px;
  }
  .qr-row { display: flex; gap: 8px; margin-bottom: 4px; }
  .qr-key { font-size: 10px; color: #6a5a40; width: 100px; flex-shrink: 0; }
  .qr-val { font-size: 12px; color: #1a1a1a; font-weight: 500; }
  .qr-note {
    font-size: 10.5px; color: #5a4a30; margin-top: 8px; line-height: 1.5;
    border-top: 0.5px solid #e0d8c8; padding-top: 7px;
  }

  /* ── Callout ── */
  .callout {
    display: flex; gap: 12px; padding: 12px 16px; margin: 14px 0;
    align-items: flex-start; font-size: 12.5px; line-height: 1.6;
    border-radius: 0 4px 4px 0;
  }
  .callout strong { font-weight: 700; }
  .callout-text { color: #1a1a1a; }
  .callout-icon {
    width: 18px; height: 18px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; flex-shrink: 0; margin-top: 1px; font-weight: 700;
  }
  .callout-green { background: #e8f5ec; border-left: 3px solid #2d6a4f; }
  .callout-green .callout-icon { background: #2d6a4f; color: #fff; }
  .callout-amber { background: #fff3e0; border-left: 3px solid #c07800; }
  .callout-amber .callout-icon { background: #c07800; color: #fff; font-size: 11px; }
  .callout-blue { background: #e8f0fe; border-left: 3px solid #1a56a0; }
  .callout-blue .callout-icon { background: #1a56a0; color: #fff; }
  .callout-blue .callout-text { color: #1a1a1a; }

  /* ── Cancel policy table ── */
  .cancel-table { width: 100%; border-collapse: collapse; border: 0.5px solid #e0d8c8; }
  .cancel-table th {
    background: #f5f0e8; padding: 7px 12px; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 1.2px; color: #5a4a30;
    font-weight: 700; border-bottom: 0.5px solid #e0d8c8; text-align: left;
  }
  .cancel-table td {
    padding: 7px 12px; font-size: 12px;
    border-bottom: 0.5px solid #f0ebe0; color: #1a1a1a; background: #fff;
  }
  .cancel-table tr:last-child td { border-bottom: none; }
  .refund-ok   { color: #0a4d1a; font-weight: 700; }
  .refund-none { color: #8b0000; font-weight: 700; }

  /* ── House rules ── */
  .rules-list { list-style: none; }
  .rules-list li {
    display: flex; align-items: baseline; gap: 10px;
    padding: 6px 0; border-bottom: 0.5px solid #f0ebe0;
    font-size: 12px; color: #2a2a2a;
  }
  .rules-list li:last-child { border-bottom: none; }
  .rules-icon { color: #2d6a4f; font-size: 8px; flex-shrink: 0; }

  /* ── Getting here (EN only) ── */
  .directions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .direction-card {
    background: #f7f4ef; border: 0.5px solid #e0d8c8;
    border-radius: 4px; padding: 10px 12px;
  }
  .dir-mode {
    font-size: 9px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1.5px; color: #6a5a40; margin-bottom: 4px;
  }
  .dir-detail { font-size: 12px; color: #1a1a1a; line-height: 1.5; }
  .dir-time { font-size: 10.5px; color: #2d6a4f; font-weight: 600; margin-top: 3px; }

  /* ── Divider ── */
  hr.divider { border: none; border-top: 0.5px solid #e8e0d0; margin: 18px 0; }

  /* ── Footer ── */
  .doc-footer {
    padding: 12px 28px; background: #f5f0e8;
    border-top: 1px solid #e0d8c8;
    display: flex; justify-content: space-between; align-items: center;
  }
  .doc-footer .brand {
    font-family: 'Cormorant Garamond', serif;
    font-size: 14px; font-weight: 600; color: #2d6a4f;
  }
  .doc-footer .footer-meta { font-size: 10px; color: #6a5a40; text-align: right; line-height: 1.7; }

  /* ── Print ── */
  @media print {
    body { padding: 0; max-width: 100%; }
    .masthead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .line-table .total-row td,
    .line-table .paid-row td,
    .line-table .due-row td,
    .line-table .surcharge-row td,
    .callout-green, .callout-amber, .callout-blue,
    .cancel-table th, .line-table thead tr,
    .title-band, .doc-footer { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>`;

// ─── Header ───────────────────────────────────────────────────────────────────

const htmlHeader = (lang: 'vi' | 'en' = 'vi') => `
<div class="masthead">
  <div class="masthead-logo">
    <img src="${LOGO_URL}" alt="Hello Dalat Hostel logo" />
  </div>
  <div class="masthead-brand">
    <h1>${HOSTEL_NAME}</h1>
    <p>${lang === 'en' ? HOSTEL_ADDR_EN : HOSTEL_ADDR_VI}</p>
  </div>
  <div class="masthead-contact">
    <div>${lang === 'en' ? HOSTEL_PHONE_INTL : HOSTEL_PHONE}</div>
    <div>${HOSTEL_EMAIL}</div>
  </div>
</div>`;

// ─── Footer ───────────────────────────────────────────────────────────────────

const htmlFooter = (extra?: string, lang: 'vi' | 'en' = 'vi') => `
<div class="doc-footer">
  <span class="brand">${HOSTEL_NAME}</span>
  <div class="footer-meta">
    <div>${extra ?? (lang === 'en' ? '33/18/2 Phan Dinh Phung, Ward 1, Da Lat' : HOSTEL_ADDR_VI)}</div>
  </div>
</div>`;

// ─── House Rules ──────────────────────────────────────────────────────────────

const houseRulesHtml = (lang: 'vi' | 'en' = 'vi') => lang === 'en' ? `
<div class="section">
  <div class="section-label">House Rules</div>
  <ul class="rules-list">
    <li><span class="rules-icon">◆</span><span>Check-in from 14:00 — Check-out by 12:00</span></li>
    <li><span class="rules-icon">◆</span><span>Quiet hours after 22:00 — please be considerate of other guests</span></li>
    <li><span class="rules-icon">◆</span><span>No smoking inside the room or common areas</span></li>
    <li><span class="rules-icon">◆</span><span>Please return your key card at check-out</span></li>
    <li><span class="rules-icon">◆</span><span>Need help? Call or WhatsApp: ${HOSTEL_PHONE_INTL}</span></li>
  </ul>
</div>` : `
<div class="section">
  <div class="section-label">Nội quy phòng</div>
  <ul class="rules-list">
    <li><span class="rules-icon">◆</span><span>Check-in từ 14:00 — Check-out trước 12:00</span></li>
    <li><span class="rules-icon">◆</span><span>Giữ yên lặng sau 22:00, tránh làm phiền các phòng khác</span></li>
    <li><span class="rules-icon">◆</span><span>Không hút thuốc trong phòng và khu vực chung</span></li>
    <li><span class="rules-icon">◆</span><span>Vui lòng trả chìa khoá khi check-out</span></li>
    <li><span class="rules-icon">◆</span><span>Mọi hỗ trợ: ${HOSTEL_PHONE} (Zalo / Call)</span></li>
  </ul>
</div>`;

// ─── Cancel Policy ────────────────────────────────────────────────────────────

const cancelPolicyHtml = (hasDeposit: boolean, lang: 'vi' | 'en' = 'vi') => {
  if (lang === 'en') return `
<div class="section">
  <div class="section-label">Cancellation Policy</div>
  <table class="cancel-table">
    <thead><tr><th>Cancellation timing</th><th>Deposit refund</th></tr></thead>
    <tbody>
      <tr><td>More than 7 days before check-in</td><td class="refund-ok">50% refunded</td></tr>
      <tr><td>3–7 days before check-in</td><td class="refund-ok">50% refunded</td></tr>
      <tr><td>Within 3 days of check-in</td><td class="refund-none">Non-refundable</td></tr>
    </tbody>
  </table>
  ${!hasDeposit ? `<p style="font-size:10.5px;color:#5a4a30;margin-top:6px">* Policy applies once deposit is received. No deposit = no room hold.</p>` : ''}
</div>`;

  return `
<div class="section">
  <div class="section-label">Chính sách huỷ phòng</div>
  <table class="cancel-table">
    <thead><tr><th>Thời điểm huỷ</th><th>Hoàn tiền cọc</th></tr></thead>
    <tbody>
      <tr><td>Trước 7 ngày check-in</td><td class="refund-ok">Hoàn 50%</td></tr>
      <tr><td>Từ 3–7 ngày trước check-in</td><td class="refund-ok">Hoàn 50%</td></tr>
      <tr><td>Trong vòng 3 ngày trước check-in</td><td class="refund-none">Không hoàn (Non-refundable)</td></tr>
    </tbody>
  </table>
  ${!hasDeposit ? `<p style="font-size:10.5px;color:#5a4a30;margin-top:6px">* Chính sách áp dụng sau khi đặt cọc. Chưa có cọc = chỗ chưa được giữ.</p>` : ''}
</div>`;
};

// ─── Surcharge row helper ─────────────────────────────────────────────────────
// Chỉ render khi surcharge > 0. Label tiếng Việt + tiếng Anh.

const surchargeRow = (surcharge: number, lang: 'vi' | 'en' = 'vi') => {
  if (surcharge <= 0) return '';
  const label = lang === 'en'
    ? `Card payment surcharge <span style="color:#9a6000;font-size:11px">(4%)</span>`
    : `Phụ thu thanh toán thẻ <span style="color:#9a6000;font-size:11px">(4%)</span>`;
  const amount = lang === 'en' ? fmtVND_EN(surcharge) : fmtVND(surcharge);
  return `<tr class="surcharge-row"><td>${label}</td><td class="tr">${amount}</td></tr>`;
};

// Overload cho 4-column line table (invoice)
const surchargeRow4Col = (surcharge: number, lang: 'vi' | 'en' = 'vi') => {
  if (surcharge <= 0) return '';
  const label = lang === 'en'
    ? `Card surcharge <span style="color:#9a6000;font-size:11px">(4%)</span>`
    : `Phụ thu thẻ <span style="color:#9a6000;font-size:11px">(4%)</span>`;
  const amount = lang === 'en' ? fmtVND_EN(surcharge) : fmtVND(surcharge);
  return `<tr class="surcharge-row"><td>${label}</td><td class="tr">—</td><td class="tc">—</td><td class="tr">${amount}</td></tr>`;
};

// ─── QR Block ─────────────────────────────────────────────────────────────────

const qrBlockHtml = (
  amount: number,
  addInfo: string,
  deadline?: string,
  lang: 'vi' | 'en' = 'vi'
) => {
  const qrUrl = vietQrUrl(amount, addInfo);
  const fmtDate = lang === 'en' ? fmtDate_EN : fmtDate_VI;
  const fmt = lang === 'en' ? fmtVND_EN : fmtVND;

  return `
<div class="qr-block">
  <div class="qr-img">
    <img src="${qrUrl}" alt="QR chuyển khoản" />
  </div>
  <div class="qr-info">
    <div class="qr-amount">${fmt(amount)}</div>
    <div class="qr-row">
      <span class="qr-key">${lang === 'en' ? 'Bank' : 'Ngân hàng'}</span>
      <span class="qr-val">Vietcombank (VCB)</span>
    </div>
    <div class="qr-row">
      <span class="qr-key">${lang === 'en' ? 'Account No.' : 'Số tài khoản'}</span>
      <span class="qr-val" style="font-weight:700;letter-spacing:1px">${VQR_ACCOUNT_DISPLAY}</span>
    </div>
    <div class="qr-row">
      <span class="qr-key">${lang === 'en' ? 'Account Name' : 'Chủ TK'}</span>
      <span class="qr-val">${VQR_OWNER}</span>
    </div>
    <div class="qr-row">
      <span class="qr-key">${lang === 'en' ? 'Reference' : 'Nội dung CK'}</span>
      <span class="qr-val" style="color:#0a3d1a;font-weight:600">${addInfo}</span>
    </div>
    ${deadline ? `
    <div class="qr-row">
      <span class="qr-key">${lang === 'en' ? 'Deadline' : 'Hạn cọc'}</span>
      <span class="qr-val" style="color:#8b0000;font-weight:700">${fmtDate(deadline)}</span>
    </div>` : ''}
    <p class="qr-note">${lang === 'en'
      ? `Scan QR with any Vietnamese banking app. Once transferred, please send a screenshot to WhatsApp/Zalo ${HOSTEL_PHONE_INTL} to confirm your booking.`
      : `Scan QR bằng app ngân hàng để chuyển khoản nhanh. Sau khi chuyển, gửi ảnh xác nhận qua Zalo ${HOSTEL_PHONE}.`
    }</p>
  </div>
</div>`;
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE 1 — Booking Confirmation / Xác nhận đặt phòng
// ═══════════════════════════════════════════════════════════════════════════════

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

  <div class="title-band">
    <div class="doc-title">${isEN ? 'Booking Confirmation' : 'Xác nhận đặt phòng'}</div>
    <div class="doc-meta">
      <div>${fmtDateTime(d.generatedAt)}</div>
      ${d.otaBookingNumber ? `<div>${isEN ? 'OTA Ref' : 'Mã OTA'}: ${d.otaBookingNumber}</div>` : ''}
    </div>
  </div>

  <div class="doc-body">
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

🔄 Cancellation: 50% refund if cancelled 3–7 days before. Non-refundable within 3 days.`
  : `⚠️ Room not yet confirmed — please send a deposit to secure your stay.

🔄 Cancellation: 50% refund if cancelled 3–7 days before. Non-refundable within 3 days.`
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

🔄 Huỷ phòng: Hoàn 50% nếu huỷ trước 3–7 ngày. Không hoàn trong vòng 3 ngày check-in.`
  : `⚠️ Chỗ chưa được giữ — vui lòng đặt cọc để xác nhận.

🔄 Huỷ phòng: Hoàn 50% nếu huỷ trước 3–7 ngày. Không hoàn trong vòng 3 ngày check-in.`
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
  const addInfo = isEN
    ? `Deposit Room${d.roomName} ${dayjs(d.checkIn).format('DDMon')} ${removeDiacritics(d.guestName)}`
    : `Coc phong ${d.roomName} ${fmtDate_VI(d.checkIn)} ${removeDiacritics(d.guestName)}`;

  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8">
  <title>${isEN ? 'Deposit Request' : 'Yêu cầu đặt cọc'}</title>${BASE_STYLE}</head><body>
  ${htmlHeader(lang)}

  <div class="title-band">
    <div class="doc-title">${isEN ? 'Deposit Request' : 'Yêu cầu đặt cọc'}</div>
    <div class="doc-meta"><div>${fmtDateTime(d.generatedAt)}</div></div>
  </div>

  <div class="doc-body">
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
      ${qrBlockHtml(opts.depositAmount, addInfo, opts.deadline, lang)}
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

🔄 Cancellation: 50% refund if cancelled 3–7 days before. Non-refundable within 3 days.

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

🔄 Huỷ phòng: Hoàn 50% nếu huỷ trước 3–7 ngày. Không hoàn trong vòng 3 ngày check-in.

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

  <div class="title-band">
    <div class="doc-title">${isEN ? 'Deposit Receipt' : 'Xác nhận nhận cọc'}</div>
    <div class="doc-meta"><div>${isEN ? 'Confirmed' : 'Ngày xác nhận'}: ${fmtDateTime(d.generatedAt)}</div></div>
  </div>

  <div class="doc-body">
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

🔄 Cancellation: 50% refund if cancelled 3–7 days before. Non-refundable within 3 days.

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

🔄 Huỷ phòng: Hoàn 50% nếu huỷ trước 3–7 ngày. Không hoàn trong vòng 3 ngày check-in.

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
  const fmtDate = isEN ? fmtDate_EN : fmtDate_VI;
  const fmtDateTime = isEN ? fmtDateTime_EN : fmtDateTime_VI;
  const nightsLabel = isEN ? nightsLabel_EN(d) : nightsLabel_VI(d);
  const invoiceNo = `HD-${dayjs(d.generatedAt).format('YYYYMMDD')}-${d.bookingId.slice(0, 6).toUpperCase()}`;
  const bal = remaining(d);
  const addInfo = isEN
    ? `Invoice ${invoiceNo} ${removeDiacritics(d.guestName)}`
    : `TT hoa don ${invoiceNo} ${removeDiacritics(d.guestName)}`;

  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8">
  <title>${isEN ? 'Invoice' : 'Hóa đơn'}</title>${BASE_STYLE}</head><body>
  ${htmlHeader(lang)}

  <div class="title-band">
    <div class="doc-title">${isEN ? 'Invoice' : 'Hóa đơn thanh toán'}</div>
    <div class="doc-meta">
      <div>${isEN ? 'No.' : 'Số HĐ:'} ${invoiceNo}</div>
      <div>${fmtDateTime(d.generatedAt)}</div>
    </div>
  </div>

  <div class="doc-body">
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
          ${d.paid > 0 ? `
          <tr class="paid-row">
            <td colspan="3" class="tr">${isEN ? 'Deposit paid' : 'Đã thanh toán (cọc)'}</td>
            <td class="tr">−${fmt(d.paid)}</td>
          </tr>` : ''}
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

  <div class="title-band">
    <div class="doc-title">${isEN ? "We're Looking Forward to Your Stay" : 'Thông báo trước ngày đến'}</div>
    <div class="doc-meta"><div>${isEN ? 'Sent' : 'Ngày gửi'}: ${fmtDateTime(d.generatedAt)}</div></div>
  </div>

  <div class="doc-body">
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

// ─── Labels ───────────────────────────────────────────────────────────────────

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  booking_confirmation: 'Xác nhận đặt phòng',
  deposit_request:      'Yêu cầu đặt cọc',
  deposit_confirmation: 'Xác nhận nhận cọc',
  invoice:              'Hóa đơn',
  arrival_notice:       'Thông báo check-in',
};

export const DOC_KIND_LABELS_EN: Record<DocKind, string> = {
  booking_confirmation: 'Booking Confirmation',
  deposit_request:      'Deposit Request',
  deposit_confirmation: 'Deposit Receipt',
  invoice:              'Invoice',
  arrival_notice:       'Pre-arrival Notice',
};

export type { DocKind };
