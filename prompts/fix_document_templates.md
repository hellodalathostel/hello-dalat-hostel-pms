# Fix documentTemplates.ts — 6 issues

File: `src/features/documents/documentTemplates.ts`

Áp dụng đúng 6 str_replace patches bên dưới theo thứ tự. Không thay đổi gì ngoài các đoạn được chỉ định.

---

## FIX 1 — cancelPolicyHtml: merge 3 tiers → 2 tiers (EN)

### FIND (exact):
```
      <tr><td>More than 7 days before check-in</td><td class="refund-ok">50% refunded</td></tr>
      <tr><td>3–7 days before check-in</td><td class="refund-ok">50% refunded</td></tr>
      <tr><td>Within 3 days of check-in</td><td class="refund-none">Non-refundable</td></tr>
```

### REPLACE WITH:
```
      <tr><td>3 or more days before check-in</td><td class="refund-ok">50% refunded</td></tr>
      <tr><td>Within 3 days of check-in</td><td class="refund-none">Non-refundable</td></tr>
```

---

## FIX 2 — cancelPolicyHtml: merge 3 tiers → 2 tiers (VI)

### FIND (exact):
```
      <tr><td>Trước 7 ngày check-in</td><td class="refund-ok">Hoàn 50%</td></tr>
      <tr><td>Từ 3–7 ngày trước check-in</td><td class="refund-ok">Hoàn 50%</td></tr>
      <tr><td>Trong vòng 3 ngày trước check-in</td><td class="refund-none">Không hoàn (Non-refundable)</td></tr>
```

### REPLACE WITH:
```
      <tr><td>Từ 3 ngày trở lên trước check-in</td><td class="refund-ok">Hoàn 50%</td></tr>
      <tr><td>Trong vòng 3 ngày trước check-in</td><td class="refund-none">Không hoàn (Non-refundable)</td></tr>
```

---

## FIX 3 — Sync zaloText cancel policy (tất cả template dùng chuỗi này)

Có 4 chỗ trong file dùng chuỗi cancel policy trong zaloText. Thay tất cả 4 chỗ:

### FIND pattern A (EN, xuất hiện nhiều lần — thay TẤT CẢ):
```
🔄 Cancellation: 50% refund if cancelled 3–7 days before. Non-refundable within 3 days.
```
### REPLACE WITH:
```
🔄 Cancellation: 50% refund if cancelled 3+ days before check-in. Non-refundable within 3 days.
```

### FIND pattern B (VI, xuất hiện nhiều lần — thay TẤT CẢ):
```
🔄 Huỷ phòng: Hoàn 50% nếu huỷ trước 3–7 ngày. Không hoàn trong vòng 3 ngày check-in.
```
### REPLACE WITH:
```
🔄 Huỷ phòng: Hoàn 50% nếu huỷ từ 3 ngày trở lên trước check-in. Không hoàn trong vòng 3 ngày.
```

---

## FIX 4 — renderDepositRequest: rút ngắn addInfo QR + thêm dòng tổng booking

### FIND (exact, trong function renderDepositRequest):
```
  const addInfo = isEN
    ? `Deposit Room${d.roomName} ${dayjs(d.checkIn).format('DDMon')} ${removeDiacritics(d.guestName)}`
    : `Coc phong ${d.roomName} ${fmtDate_VI(d.checkIn)} ${removeDiacritics(d.guestName)}`;
```

### REPLACE WITH:
```
  // addInfo ngắn gọn để không bị ngân hàng cắt (max ~25 ký tự)
  const lastName = removeDiacritics(d.guestName).trim().split(/\s+/).pop() ?? '';
  const addInfo = `COC ${d.roomName} ${dayjs(d.checkIn).format('DDMM')} ${lastName}`;
```

---

## FIX 5 — qrBlockHtml: thêm dòng "Tổng đặt phòng" trong QR block

Hàm `qrBlockHtml` nhận thêm optional param `totalAmount`. Thay toàn bộ function signature + body:

### FIND (exact):
```
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
```

### REPLACE WITH:
```
const qrBlockHtml = (
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
```

Sau đó tìm call site trong `renderDepositRequest` và truyền `d.grandTotal` vào:

### FIND (trong renderDepositRequest):
```
      ${qrBlockHtml(opts.depositAmount, addInfo, opts.deadline, lang)}
```
### REPLACE WITH:
```
      ${qrBlockHtml(opts.depositAmount, addInfo, opts.deadline, lang, d.grandTotal)}
```

---

## FIX 6 — renderBookingConfirmation: thêm field Source vào info-grid

### FIND (exact, trong renderBookingConfirmation):
```
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
```

### REPLACE WITH:
```
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
```

---

## FIX 7 — renderInvoice: invoiceNo stable + payment breakdown

### FIND (exact, đầu function renderInvoice):
```
  const invoiceNo = `HD-${dayjs(d.generatedAt).format('YYYYMMDD')}-${d.bookingId.slice(0, 6).toUpperCase()}`;
  const bal = remaining(d);
  const addInfo = isEN
    ? `Invoice ${invoiceNo} ${removeDiacritics(d.guestName)}`
    : `TT hoa don ${invoiceNo} ${removeDiacritics(d.guestName)}`;
```

### REPLACE WITH:
```
  // invoiceNo stable theo bookingId — không đổi khi generate lại cùng booking
  const invoiceNo = `HD-${d.bookingId.slice(0, 8).toUpperCase()}`;
  const bal = remaining(d);
  // addInfo ngắn gọn cho QR
  const lastName = removeDiacritics(d.guestName).trim().split(/\s+/).pop() ?? '';
  const addInfo = `TT ${d.roomName} ${lastName}`;
```

### FIND (exact, phần paid-row trong invoice table):
```
          ${d.paid > 0 ? `
          <tr class="paid-row">
            <td colspan="3" class="tr">${isEN ? 'Deposit paid' : 'Đã thanh toán (cọc)'}</td>
            <td class="tr">−${fmt(d.paid)}</td>
          </tr>` : ''}
```

### REPLACE WITH:
```
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
```

---

## Kiểm tra sau khi apply

Chạy:
```bash
npx tsc --noEmit
```

Không có lỗi TypeScript là xong. Không cần migration SQL. Không cần deploy Edge Function.
