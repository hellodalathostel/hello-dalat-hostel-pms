# Task: Refactor documentTemplates.ts — Redesign HTML Layout

File: `src/features/documents/documentTemplates.ts`

KHÔNG thay đổi: logic TypeScript, helpers, constants, zaloText, surchargeRow, qrBlockHtml, cancelPolicyHtml, houseRulesHtml, types, exports.
CHỈ thay đổi: HTML string bên trong 5 hàm render* + BASE_STYLE + htmlHeader + htmlFooter.

---

## 1. Thay toàn bộ BASE_STYLE

Tìm: `const BASE_STYLE = \`` đến dấu backtick đóng.
Thay bằng:

```
const BASE_STYLE = `
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
  .qr-img { width:110px; height:110px; background:#fff; border:0.5px solid #d0c8b8; border-radius:4px; display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden; }
  .qr-img img { width:110px; height:110px; object-fit:contain; }
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
```

---

## 2. Thay hàm htmlHeader()

Tìm: `const htmlHeader = (lang: 'vi' | 'en' = 'vi') => \`` đến backtick đóng.
Thay bằng:

```
const htmlHeader = (lang: 'vi' | 'en' = 'vi') => `
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
```

---

## 3. Thay hàm htmlFooter()

Tìm: `const htmlFooter = (extra?: string, lang: 'vi' | 'en' = 'vi') => \`` đến backtick đóng.
Thay bằng:

```
const htmlFooter = (extra?: string, lang: 'vi' | 'en' = 'vi') => `
<div class="inv-footer">
  <div class="inv-footer-brand">${HOSTEL_NAME}</div>
  <div class="inv-footer-meta">
    <div>${extra ?? (lang === 'en' ? '33/18/2 Phan Dinh Phung, Ward 1, Da Lat' : HOSTEL_ADDR_VI)}</div>
  </div>
</div>`;
```

---

## 4. Tìm & thay — áp dụng cho TẤT CẢ 5 hàm render*

Dùng global find & replace trong file:

| Tìm | Thay bằng |
|-----|-----------|
| `<div class="title-band">` | `<div class="inv-docbar">` |
| `</div>\n\n  <div class="doc-body">` | `</div>\n\n  <div class="inv-body">` |
| `class="doc-title"` | `class="inv-doc-title"` |
| `class="doc-meta"` | `class="inv-doc-meta"` |
| `</div>\n\n  ${htmlFooter` | `</div>\n\n  ${htmlFooter` |

Lưu ý: `</div>` đóng `doc-body` → đổi thành đóng `inv-body` — chỉ đổi tên class opening tag, không đổi closing tag (closing tag `</div>` không có class).

---

## 5. Thêm info-grid vào renderInvoice (Template 4)

Trong hàm `renderInvoice`, tìm dòng bắt đầu section "Chi tiết sử dụng" / "Itemised Charges":
```
    <div class="section">
      <div class="section-label">${isEN ? 'Itemised Charges' : 'Chi tiết sử dụng'}</div>
```

Chèn TRƯỚC đoạn đó một section mới:

```
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
```

---

## 6. Checklist tự kiểm tra sau khi xong

Chạy các lệnh này, tất cả phải trả về 0:

```
grep -c "title-band" src/features/documents/documentTemplates.ts
grep -c "doc-body" src/features/documents/documentTemplates.ts
grep -c "masthead" src/features/documents/documentTemplates.ts
grep -c "Cormorant" src/features/documents/documentTemplates.ts
npx tsc --noEmit
```

Nếu grep nào > 0 hoặc tsc có lỗi → fix trước khi báo xong.
