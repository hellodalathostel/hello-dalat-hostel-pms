# Task: Debug document layout — tại sao layout cũ vẫn hiển thị?

## Bước 1 — Kiểm tra BASE_STYLE thực tế trong file

Chạy lệnh này và paste output:
```
Select-String "inv-header|masthead|Cormorant|Playfair" src/features/documents/documentTemplates.ts
```

## Bước 2 — Tìm nơi document HTML được render

Tìm tất cả file liên quan đến documents:
```
Get-ChildItem -Recurse -Include "*.ts","*.tsx" | Select-String "documentTemplates|renderInvoice|renderBooking|useDocumentGenerator|openDocument|printDocument|htmlHeader" | Select-Object Filename, LineNumber, Line | Format-Table -AutoSize
```

## Bước 3 — Đọc useDocumentGenerator.ts

Đọc toàn bộ file: `src/features/documents/useDocumentGenerator.ts`

Tìm xem document HTML được mở như thế nào — `window.open`, `blob`, `iframe`, hay cách khác?

## Bước 4 — Kiểm tra xem có file build cached không

Chạy:
```
Get-ChildItem dist -Recurse -Filter "*.js" | Sort-Object LastWriteTime -Descending | Select-Object -First 5 Name, LastWriteTime
```

Nếu thư mục `dist` tồn tại và LastWriteTime cũ → build chưa được update.

## Bước 5 — Tìm xem có import từ file khác không

Trong `useDocumentGenerator.ts`, kiểm tra xem `BASE_STYLE` hay `htmlHeader` có được override từ file nào khác không:
```
Get-ChildItem -Recurse -Include "*.ts","*.tsx" | Select-String "BASE_STYLE|htmlHeader|htmlFooter" | Select-Object Filename, LineNumber, Line
```

## Bước 6 — Báo cáo

Sau khi chạy xong, báo cáo:
1. `inv-header` xuất hiện bao nhiêu lần trong documentTemplates.ts?
2. Document HTML được mở bằng cách nào (window.open? blob URL? iframe?)?
3. Có file nào khác chứa BASE_STYLE hoặc htmlHeader không?
4. Build dist có cũ không?

Không sửa gì cả ở bước này — chỉ report.