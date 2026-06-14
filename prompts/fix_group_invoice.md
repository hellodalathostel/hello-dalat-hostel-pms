# Fix: Group Invoice — 3 bugs trong useDocumentGenerator.ts

## File cần sửa
`src/features/documents/useDocumentGenerator.ts`

Dùng str_replace cho 3 patch riêng biệt theo thứ tự dưới đây.

---

## PATCH 1 — Filter is_void trong fetchGroupDocumentData

Tìm đoạn này (trong hàm `fetchGroupDocumentData`):

```ts
  const { data: payments, error: paymentsError } = await supabase
    .from('payment_history')
    .select('id, amount, method, date, note')
    .eq('group_id', groupId)
    .order('date', { ascending: true });
```

Thay bằng:

```ts
  // Chỉ lấy payments hợp lệ — loại bỏ các khoản đã void
  const { data: payments, error: paymentsError } = await supabase
    .from('payment_history')
    .select('id, amount, method, date, note')
    .eq('group_id', groupId)
    .eq('is_void', false)
    .order('date', { ascending: true });
```

---

## PATCH 2 — Fix create_document_log cho group_invoice

Tìm đoạn này (trong `run()`, case `group_invoice`):

```ts
        case 'group_invoice': {
          const groupData = await fetchGroupDocumentData(groupId);
          const html = renderGroupInvoice(groupData, params.lang ?? 'vi');
          openDocumentPreview(html, DOC_KIND_LABELS['group_invoice']);
          message.success('Đang mở cửa sổ in PDF…');
          await supabase.rpc('create_document_log', {
            p_group_id: groupId,
            p_booking_id: null,
            p_doc_kind: 'group_invoice',
            p_lang: params.lang ?? 'vi',
          });
          return null;
        }
```

Thay bằng:

```ts
        case 'group_invoice': {
          // Fetch đủ tất cả bookings trong group — không chỉ 1 booking
          const groupData = await fetchGroupDocumentData(groupId);
          const lang = params.lang ?? 'vi';
          const html = renderGroupInvoice(groupData, lang);
          openDocumentPreview(html, DOC_KIND_LABELS['group_invoice']);
          message.success('Đang mở cửa sổ in PDF…');
          // Log với đúng signature của create_document_log RPC
          const snapshot = {
            guestName: groupData.guestName,
            checkIn: groupData.checkIn,
            checkOut: groupData.checkOut,
            totalGrandTotal: groupData.totalGrandTotal,
            totalPaid: groupData.totalPaid,
            roomCount: groupData.bookings.length,
            generatedAt: groupData.generatedAt,
          };
          await supabase.rpc('create_document_log', {
            p_group_id: groupId,
            p_booking_id: null,
            p_doc_type: 'group_invoice',
            p_doc_format: 'pdf',
            p_content_snapshot: snapshot,
            p_sent_via: 'print',
            p_recipient_name: groupData.guestName,
            p_recipient_phone: groupData.guestPhone || null,
            p_note: null,
          });
          return null;
        }
```

---

## PATCH 3 — Fix create_document_log cho group_confirmation

Tìm đoạn này (trong `run()`, case `group_confirmation`):

```ts
        case 'group_confirmation': {
          const groupData = await fetchGroupDocumentData(groupId);
          if (params.lang) groupData.lang = params.lang;
          const html = renderGroupConfirmation(groupData, params.lang ?? 'vi');
          openDocumentPreview(html, DOC_KIND_LABELS['group_confirmation']);
          message.success('Đang mở cửa sổ in PDF…');
          await supabase.rpc('create_document_log', {
            p_group_id: groupId,
            p_booking_id: null,
            p_doc_kind: 'group_confirmation',
            p_lang: params.lang ?? 'vi',
          });
          return null;
        }
```

Thay bằng:

```ts
        case 'group_confirmation': {
          const groupData = await fetchGroupDocumentData(groupId);
          const lang = params.lang ?? 'vi';
          const html = renderGroupConfirmation(groupData, lang);
          openDocumentPreview(html, DOC_KIND_LABELS['group_confirmation']);
          message.success('Đang mở cửa sổ in PDF…');
          // Log với đúng signature của create_document_log RPC
          const snapshot = {
            guestName: groupData.guestName,
            checkIn: groupData.checkIn,
            checkOut: groupData.checkOut,
            totalGrandTotal: groupData.totalGrandTotal,
            totalPaid: groupData.totalPaid,
            roomCount: groupData.bookings.length,
            generatedAt: groupData.generatedAt,
          };
          await supabase.rpc('create_document_log', {
            p_group_id: groupId,
            p_booking_id: null,
            p_doc_type: 'group_confirmation',
            p_doc_format: 'pdf',
            p_content_snapshot: snapshot,
            p_sent_via: 'print',
            p_recipient_name: groupData.guestName,
            p_recipient_phone: groupData.guestPhone || null,
            p_note: null,
          });
          return null;
        }
```

---

## Sau khi apply 3 patches

```bash
npx tsc --noEmit
```

Không được có lỗi TypeScript. Nếu có lỗi, báo lại trước khi commit.

## Commit message

```
fix(documents): fix group invoice log params + filter void payments
```