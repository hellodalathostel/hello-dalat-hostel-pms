// src/features/documents/templates/shared.ts
// Types, constants, helpers, CSS, và các block HTML chung (header/footer/house rules/
// cancel policy/surcharge/QR) dùng bởi mọi template document.
// Tách từ documentTemplates.ts (M4 — file splitting, không đổi logic).

import dayjs from 'dayjs';


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

export interface GroupBookingRow {
  bookingId: string;
  roomName: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  pricePerNight: number;
  roomSubtotal: number;
  surcharge: number;
  services: BookingServiceItem[];
  discounts: BookingDiscountItem[];
  grandTotal: number;
}

export interface GroupDocumentData {
  groupId: string;
  guestName: string;
  guestPhone: string;
  source: string;
  otaBookingNumber?: string;
  checkIn: string;       // earliest check_in trong group
  checkOut: string;      // latest check_out trong group
  bookings: GroupBookingRow[];
  totalGrandTotal: number;  // SUM(booking.grandTotal)
  totalPaid: number;
  payments: PaymentItem[];
  generatedAt: string;
  lang?: 'vi' | 'en';
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

export const HOSTEL_NAME    = 'Hello Dalat Hostel';
export const HOSTEL_ADDR_VI = '33/18/2 Phan Đình Phùng, P.1, Đà Lạt · Lâm Đồng';
export const HOSTEL_ADDR_EN = '33/18/2 Phan Dinh Phung St., Ward 1, Da Lat · Lam Dong, Vietnam';
export const HOSTEL_PHONE   = '0969 975 935';
export const HOSTEL_PHONE_INTL = '+84 969 975 935';
export const HOSTEL_EMAIL   = 'hellodalathostel@gmail.com';
export const LOGO_URL       = 'https://rcfhhgywjdwqcgnpkbtl.supabase.co/storage/v1/object/public/assets/1773723283955.png';

export const VQR_BANK    = 'VCB';
export const VQR_ACCOUNT = '9969975935';
export const VQR_ACCOUNT_DISPLAY = '9969 975 935';
export const VQR_OWNER   = 'NGUYEN THANH HIEU';

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
  card: 'Thẻ',
  momo: 'MoMo',
  zalopay: 'ZaloPay',
  other: 'Khác',
};

export const PAYMENT_METHOD_LABEL_EN: Record<string, string> = {
  cash: 'Cash',
  transfer: 'Bank transfer',
  card: 'Card',
  momo: 'MoMo',
  zalopay: 'ZaloPay',
  other: 'Other',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const fmtVND = (amount: number) =>
  new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';

export const fmtVND_EN = (amount: number) =>
  new Intl.NumberFormat('vi-VN').format(amount) + ' VND';

export const fmtDate_VI = (d: string) => dayjs(d).format('DD/MM/YYYY');
export const fmtDate_EN = (d: string) => dayjs(d).format('DD MMM YYYY');
export const fmtDateTime_VI = (d: string) => dayjs(d).format('DD/MM/YYYY HH:mm');
export const fmtDateTime_EN = (d: string) => dayjs(d).format('DD MMM YYYY · HH:mm');

export const nightsLabel_VI = (d: DocumentData) =>
  `${d.nights} đêm (${fmtDate_VI(d.checkIn)} → ${fmtDate_VI(d.checkOut)})`;
export const nightsLabel_EN = (d: DocumentData) =>
  `${d.nights} nights · ${fmtDate_EN(d.checkIn)} → ${fmtDate_EN(d.checkOut)}`;

export const servicesTotal = (services: BookingServiceItem[]) =>
  services.reduce((sum, s) => sum + s.price * s.qty, 0);

export const remaining = (d: DocumentData) => d.grandTotal - d.paid;

export const removeDiacritics = (str: string) =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

export const vietQrUrl = (amount: number, addInfo: string) => {
  const safeInfo = encodeURIComponent(removeDiacritics(addInfo));
  const safeName = encodeURIComponent(removeDiacritics(VQR_OWNER));
  return `https://img.vietqr.io/image/${VQR_BANK}-${VQR_ACCOUNT}-print.png?amount=${amount}&addInfo=${safeInfo}&accountName=${safeName}`;
};



// ─── CSS Base ─────────────────────────────────────────────────────────────────
// Tất cả màu text trong callout/table dùng hardcode hex để đảm bảo đọc được
// trên cả light mode và dark mode trong popup window.

export const BASE_STYLE = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600&family=Playfair+Display:wght@600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Be Vietnam Pro','Segoe UI',sans-serif; font-size:13px; line-height:1.6; color:#1a1a1a; background:#fff; max-width:700px; margin:0 auto; }
  .inv-header { background:#2d6a4f; padding:20px 28px; display:flex; align-items:center; gap:16px; }
  .inv-logo { width:48px; height:48px; border-radius:50%; overflow:hidden; border:2px solid rgba(255,255,255,0.3); flex-shrink:0; }
  .inv-logo img { width:100%; height:100%; object-fit:cover; }
  .inv-brand { flex:1; }
  .inv-brand-name { font-family:'Playfair Display',Georgia,serif; font-size:17px; font-weight:600; color:#fff; letter-spacing:0.2px; line-height:1.2; }
  .inv-brand-addr { font-size:10.5px; color:rgba(255,255,255,0.62); margin-top:3px; }
  .inv-brand-contact { font-size:10.5px; color:rgba(255,255,255,0.75); margin-top:1px; }
  .inv-docbar { background:#f7f4ee; border-bottom:0.5px solid #e4ddd0; padding:12px 28px; display:flex; justify-content:space-between; align-items:center; }
  .inv-doc-title { font-family:'Playfair Display',serif; font-size:17px; font-weight:600; color:#1a1a1a; }
  .inv-doc-meta { text-align:right; font-size:10px; color:#8a7a60; line-height:1.9; }
  .inv-body { padding:22px 28px; }
  .inv-footer { background:#f2ede4; border-top:1px solid #e4ddd0; padding:10px 28px; display:flex; justify-content:space-between; align-items:center; }
  .inv-footer-brand { font-family:'Playfair Display',serif; font-size:14px; font-weight:600; color:#2d6a4f; }
  .inv-footer-meta { font-size:10px; color:#6a5a40; text-align:right; line-height:1.8; }
  .section { margin-bottom:20px; }
  .section-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:2px; color:#2d6a4f; padding-bottom:7px; border-bottom:1px solid #c8ddd0; margin-bottom:12px; display:flex; align-items:center; gap:6px; }
  .section-label::before { content:''; display:inline-block; width:3px; height:10px; background:#2d6a4f; border-radius:2px; }
  .info-grid { display:grid; grid-template-columns:1fr 1fr; border:0.5px solid #e4ddd0; border-radius:6px; overflow:hidden; }
  .info-cell { padding:10px 14px; border-bottom:0.5px solid #e4ddd0; border-right:0.5px solid #e4ddd0; background:#fff; }
  .info-cell:nth-child(even) { border-right:none; }
  .info-cell:nth-last-child(-n+2) { border-bottom:none; }
  .info-cell.full { grid-column:span 2; border-right:none; }
  .info-key { font-size:9px; text-transform:uppercase; letter-spacing:1.5px; color:#8a7a60; font-weight:700; margin-bottom:3px; }
  .info-val { font-size:13px; font-weight:500; color:#1a1a1a; }
  .info-val.muted { color:#8a7a60; font-weight:400; }
  .badge { display:inline-block; padding:1px 8px; border-radius:20px; font-size:10px; font-weight:700; }
  .badge-green { background:#c8e6c9; color:#1b5e20; }
  .badge-amber { background:#ffe0b2; color:#6d3200; }
  .inv-tag { display:inline-block; padding:1px 8px; border-radius:20px; font-size:10px; font-weight:700; }
  .tag-paid { background:#c8e6c9; color:#1b5e20; }
  .tag-pending { background:#ffe0b2; color:#6d3200; }
  table.line-table { width:100%; border-collapse:collapse; border:0.5px solid #e4ddd0; }
  table.line-table thead tr { background:#f2ede4; }
  table.line-table th { padding:8px 12px; font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:1.2px; color:#5a4a30; border-bottom:0.5px solid #e4ddd0; text-align:left; }
  table.line-table td { padding:9px 12px; font-size:12.5px; border-bottom:0.5px solid #f0ebe0; color:#1a1a1a; vertical-align:middle; background:#fff; }
  table.line-table tr:last-child td { border-bottom:none; }
  table.line-table .total-row td { background:#d0e8da; font-weight:700; color:#0a3d1a; font-size:13.5px; border-top:1px solid #a8d5b5; }
  table.line-table .paid-row td { background:#dce8fa; color:#0c2a5e; font-weight:600; }
  table.line-table .due-row td { background:#fde8c8; color:#6d2800; font-weight:700; font-size:13.5px; border-top:1px solid #f5c87a; }
  table.line-table .surcharge-row td { background:#fdf6ee; color:#7a4500; }
  .tr { text-align:right; }
  .tc { text-align:center; }
  .qr-block { display:flex; gap:18px; padding:16px; background:#f7f4ef; border:0.5px solid #e0d8c8; border-radius:6px; align-items:flex-start; }
  .qr-img { width:220px; height:220px; background:#fff; border:0.5px solid #d0c8b8; border-radius:4px; display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden; }
  .qr-img img { width:220px; height:220px; object-fit:contain; }
  .qr-info { flex:1; }
  .qr-amount { font-family:'Playfair Display',serif; font-size:22px; font-weight:600; color:#0a3d1a; line-height:1; margin-bottom:10px; }
  .qr-row { display:flex; gap:8px; margin-bottom:4px; }
  .qr-key { font-size:10px; color:#6a5a40; width:100px; flex-shrink:0; }
  .qr-val { font-size:12px; color:#1a1a1a; font-weight:500; }
  .qr-note { font-size:10.5px; color:#5a4a30; margin-top:8px; line-height:1.5; border-top:0.5px solid #e0d8c8; padding-top:7px; }
  .callout { display:flex; gap:12px; padding:12px 16px; margin:14px 0; align-items:flex-start; font-size:12.5px; line-height:1.6; border-radius:0 4px 4px 0; }
  .callout-text { color:#1a1a1a; }
  .callout-icon { width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; flex-shrink:0; margin-top:1px; font-weight:700; }
  .callout-green { background:#e8f5ec; border-left:3px solid #2d6a4f; }
  .callout-green .callout-icon { background:#2d6a4f; color:#fff; }
  .callout-amber { background:#fff3e0; border-left:3px solid #c07800; }
  .callout-amber .callout-icon { background:#c07800; color:#fff; }
  .callout-blue { background:#e8f0fe; border-left:3px solid #1a56a0; }
  .callout-blue .callout-icon { background:#1a56a0; color:#fff; }
  .cancel-table { width:100%; border-collapse:collapse; border:0.5px solid #e0d8c8; }
  .cancel-table th { background:#f5f0e8; padding:7px 12px; font-size:9.5px; text-transform:uppercase; letter-spacing:1.2px; color:#5a4a30; font-weight:700; border-bottom:0.5px solid #e0d8c8; text-align:left; }
  .cancel-table td { padding:7px 12px; font-size:12px; border-bottom:0.5px solid #f0ebe0; color:#1a1a1a; background:#fff; }
  .cancel-table tr:last-child td { border-bottom:none; }
  .refund-ok { color:#0a4d1a; font-weight:700; }
  .refund-none { color:#8b0000; font-weight:700; }
  .rules-list { list-style:none; }
  .rules-list li { display:flex; align-items:baseline; gap:10px; padding:6px 0; border-bottom:0.5px solid #f0ebe0; font-size:12px; color:#2a2a2a; }
  .rules-list li:last-child { border-bottom:none; }
  .rules-icon { color:#2d6a4f; font-size:8px; flex-shrink:0; }
  .directions-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .direction-card { background:#f7f4ef; border:0.5px solid #e0d8c8; border-radius:4px; padding:10px 12px; }
  .dir-mode { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:#6a5a40; margin-bottom:4px; }
  .dir-detail { font-size:12px; color:#1a1a1a; line-height:1.5; }
  .dir-time { font-size:10.5px; color:#2d6a4f; font-weight:600; margin-top:3px; }
  hr.divider { border:none; border-top:0.5px solid #e8e0d0; margin:18px 0; }
  @media print {
    body { max-width:100%; }
    .inv-header,.inv-docbar,.inv-footer,.callout-green,.callout-amber,.callout-blue,
    table.line-table .total-row td,table.line-table .paid-row td,
    table.line-table .due-row td,table.line-table .surcharge-row td,
    table.line-table thead tr,.cancel-table th { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  }
</style>`;

// ─── Header ───────────────────────────────────────────────────────────────────

export const htmlHeader = (lang: 'vi' | 'en' = 'vi') => `
<div class="inv-header">
  <div class="inv-logo">
    <img src="${LOGO_URL}" alt="Hello Dalat Hostel logo" />
  </div>
  <div class="inv-brand">
    <div class="inv-brand-name">${HOSTEL_NAME}</div>
    <div class="inv-brand-addr">${lang === 'en' ? HOSTEL_ADDR_EN : HOSTEL_ADDR_VI}</div>
    <div class="inv-brand-contact">${lang === 'en' ? HOSTEL_PHONE_INTL : HOSTEL_PHONE} &nbsp;·&nbsp; ${HOSTEL_EMAIL}</div>
  </div>
</div>`;

// ─── Footer ───────────────────────────────────────────────────────────────────

export const htmlFooter = (extra?: string, lang: 'vi' | 'en' = 'vi') => `
<div class="inv-footer">
  <div class="inv-footer-brand">${HOSTEL_NAME}</div>
  <div class="inv-footer-meta">
    <div>${extra ?? (lang === 'en' ? '33/18/2 Phan Dinh Phung, Ward 1, Da Lat' : HOSTEL_ADDR_VI)}</div>
  </div>
</div>`;

// ─── House Rules ──────────────────────────────────────────────────────────────

export const houseRulesHtml = (lang: 'vi' | 'en' = 'vi') => lang === 'en' ? `
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

export const cancelPolicyHtml = (hasDeposit: boolean, lang: 'vi' | 'en' = 'vi') => {
  if (lang === 'en') return `
<div class="section">
  <div class="section-label">Cancellation Policy</div>
  <table class="cancel-table">
    <thead><tr><th>Cancellation timing</th><th>Deposit refund</th></tr></thead>
    <tbody>
      <tr><td>3 or more days before check-in</td><td class="refund-ok">50% refunded</td></tr>
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
      <tr><td>Từ 3 ngày trở lên trước check-in</td><td class="refund-ok">Hoàn 50%</td></tr>
      <tr><td>Trong vòng 3 ngày trước check-in</td><td class="refund-none">Không hoàn (Non-refundable)</td></tr>
    </tbody>
  </table>
  ${!hasDeposit ? `<p style="font-size:10.5px;color:#5a4a30;margin-top:6px">* Chính sách áp dụng sau khi đặt cọc. Chưa có cọc = chỗ chưa được giữ.</p>` : ''}
</div>`;
};

// ─── Surcharge row helper ─────────────────────────────────────────────────────
// Chỉ render khi surcharge > 0. Label tiếng Việt + tiếng Anh.

export const surchargeRow = (surcharge: number, lang: 'vi' | 'en' = 'vi') => {
  if (surcharge <= 0) return '';
  const label = lang === 'en'
    ? `Card payment surcharge <span style="color:#9a6000;font-size:11px">(4%)</span>`
    : `Phụ thu thanh toán thẻ <span style="color:#9a6000;font-size:11px">(4%)</span>`;
  const amount = lang === 'en' ? fmtVND_EN(surcharge) : fmtVND(surcharge);
  return `<tr class="surcharge-row"><td>${label}</td><td class="tr">${amount}</td></tr>`;
};

// Overload cho 4-column line table (invoice)
export const surchargeRow4Col = (surcharge: number, lang: 'vi' | 'en' = 'vi') => {
  if (surcharge <= 0) return '';
  const label = lang === 'en'
    ? `Card surcharge <span style="color:#9a6000;font-size:11px">(4%)</span>`
    : `Phụ thu thẻ <span style="color:#9a6000;font-size:11px">(4%)</span>`;
  const amount = lang === 'en' ? fmtVND_EN(surcharge) : fmtVND(surcharge);
  return `<tr class="surcharge-row"><td>${label}</td><td class="tr">—</td><td class="tc">—</td><td class="tr">${amount}</td></tr>`;
};

// ─── QR Block ─────────────────────────────────────────────────────────────────

export const qrBlockHtml = (
  amount: number,
  addInfo: string,
  deadline?: string,
  lang: 'vi' | 'en' = 'vi',
  totalAmount?: number   // tổng booking — hiển thị bên dưới số cọc để khách có context
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
    ${totalAmount !== undefined && totalAmount !== amount ? `
    <div class="qr-row" style="margin-bottom:8px">
      <span class="qr-key">${lang === 'en' ? 'Total booking' : 'Tổng đặt phòng'}</span>
      <span class="qr-val" style="color:#6a5a40">${fmt(totalAmount)}</span>
    </div>` : ''}
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

