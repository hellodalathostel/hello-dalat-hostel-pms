# M2 Fix — Document generation N+1 + bug nghiêm trọng phát hiện thêm

## Phát hiện thực tế (khác mô tả gốc "N+1 nhiều bảng tuần tự")

1. **`fetchGroupDocumentData`** (dùng cho group invoice/confirmation) — ĐÃ ĐÚNG,
   dùng 1 query JOIN nested cho bookings+services+discounts+rooms. KHÔNG sửa.

2. **`fetchDocumentData`** (dùng cho single booking) — N+1 thật: 3 query tuần tự
   (bookings → groups → rooms) + 3 query Promise.all (services/discounts/payments).
   Fix: gộp bookings+groups thành Promise.all (độc lập nhau), rooms+services+
   discounts+payments cũng gộp thành Promise.all thứ 2 (chỉ phụ thuộc kết quả
   bookings vừa có, không phụ thuộc nhau). Giảm từ 3 round-trip tuần tự + 1 batch
   xuống 2 batch song song.

3. **BUG NGHIÊM TRỌNG phát hiện thêm (đã fix qua migration DB riêng, xem dưới)** —
   3 case `group_invoice`/`group_confirmation`/`group_deposit_request` gọi RPC
   `create_document_log` với `doc_type` không tồn tại trong enum Postgres `doc_kind`.
   Đã confirm bằng query thực tế: **0 dòng log** cho 3 loại document này từ trước
   đến giờ — audit trail bị mất hoàn toàn dù document vẫn render/in/copy OK cho user.
   Đã apply migration `20260620000001_add_group_doc_kind_values` thêm 3 enum value.
   Case `group_deposit_request` còn có thêm lỗi khác: gọi RPC với params hoàn toàn
   sai tên (`p_doc_kind`, `p_lang` — không tồn tại), nên trước đây luôn ghi log SAI
   (mặc định `doc_type='booking_confirmation'`, format='pdf', mất snapshot) — không
   throw lỗi vì mọi param RPC có default.

## DB — Migration đã apply qua MCP (cần backfill file vào repo)

Tạo file `supabase/migrations/20260620000001_add_group_doc_kind_values.sql`:

```sql
-- M2: Thêm 3 giá trị doc_kind cho document nhóm (group_invoice, group_confirmation,
-- group_deposit_request). Trước đây code gọi create_document_log với các giá trị này
-- nhưng enum chưa có → RPC throw lỗi invalid enum input, audit trail bị mất 100%
-- cho 3 loại document này (confirm qua query: 0 dòng log group_* trong document_logs).
-- Ngày: 2026-06-20

ALTER TYPE doc_kind ADD VALUE 'group_invoice';
ALTER TYPE doc_kind ADD VALUE 'group_confirmation';
ALTER TYPE doc_kind ADD VALUE 'group_deposit_request';
```

**Lưu ý:** Migration này ĐÃ apply trực tiếp vào DB qua Supabase MCP (giống pattern
M6/Fix#5 trước đây) — KHÔNG cần re-run, chỉ cần tạo file để backfill vào repo.

## Frontend — File: src/features/documents/useDocumentGenerator.ts

### Patch 1 — `fetchDocumentData` (N+1 fix)

Thay toàn bộ thân function (từ `async function fetchDocumentData(` tới trước dòng
`const services = servicesRes.data ?? [];`) bằng:

```typescript
/** Query toàn bộ data cần thiết cho 1 booking */
async function fetchDocumentData(
  bookingId: string,
  groupId: string
): Promise<DocumentPreviewData> {
  // M2 fix: bookings và groups độc lập với nhau (cả 2 chỉ cần tham số đầu vào),
  // chạy song song để giảm 1 round-trip tuần tự. rooms phải đợi vì cần booking.room_id
  // vừa nhận được (không có foreign key tới rooms table để JOIN trực tiếp).
  const [bookingRes, groupRes] = await Promise.all([
    supabase
      .from('bookings')
      .select(`
        id, group_id, room_id, check_in, check_out, nights,
        price_per_night, room_subtotal, surcharge, grand_total, tax_rate, tax_amount,
        has_early_check_in, has_late_check_out,
        guest_name, guests_count, status, note
      `)
      .eq('id', bookingId)
      .single(),
    supabase
      .from('groups')
      .select('id, customer_name, customer_phone, source, ota_booking_number, paid, deposit_method')
      .eq('id', groupId)
      .single(),
  ]);

  const { data: booking, error: bErr } = bookingRes;
  if (bErr || !booking) throw new Error('Không tìm thấy booking: ' + bErr?.message);

  const { data: group, error: gErr } = groupRes;
  if (gErr || !group) throw new Error('Không tìm thấy group: ' + gErr?.message);

  // Room info + services/discounts/payments — tất cả độc lập với nhau,
  // chỉ phụ thuộc booking.room_id/bookingId/groupId đã có sẵn → chạy song song.
  const [roomRes, servicesRes, discountsRes, paymentsRes] = await Promise.all([
    supabase
      .from('rooms')
      .select('id, name, type')
      .eq('id', booking.room_id)
      .single(),
    supabase
      .from('booking_services')
      .select('name, price, qty')
      .eq('booking_id', bookingId),
    supabase
      .from('booking_discounts')
      .select('description, amount')
      .eq('booking_id', bookingId),
    supabase
      .from('payment_history')
      .select('id, amount, method, date, note')
      .eq('group_id', groupId)
      .order('date', { ascending: true }),
  ]);

  const { data: room, error: rErr } = roomRes;
  if (rErr || !room) throw new Error('Không tìm thấy phòng: ' + rErr?.message);

  if (servicesRes.error) throw servicesRes.error;
  if (discountsRes.error) throw discountsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;
```

(Phần còn lại của function từ `const services = servicesRes.data ?? [];` tới hết
giữ nguyên không đổi.)

### Patch 2 — case `group_invoice` (thêm error check)

Tìm đoạn (gần cuối case `group_invoice`):
```typescript
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

Thay bằng:
```typescript
          const { error: logErr1 } = await supabase.rpc('create_document_log', {
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
          // Log lỗi nhưng không throw — document đã render/in thành công rồi
          if (logErr1) console.error('[useDocumentGeneratorByGroup] Lỗi ghi log group_invoice:', logErr1.message);
          return null;
        }
```

### Patch 3 — case `group_confirmation` (thêm error check)

Tìm đoạn (gần cuối case `group_confirmation`):
```typescript
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

Thay bằng:
```typescript
          const { error: logErr2 } = await supabase.rpc('create_document_log', {
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
          if (logErr2) console.error('[useDocumentGeneratorByGroup] Lỗi ghi log group_confirmation:', logErr2.message);
          return null;
        }
```

### Patch 4 — case `group_deposit_request` (fix bug signature SAI + thêm error check)

Tìm đoạn:
```typescript
        case 'group_deposit_request': {
          const groupData = await fetchGroupDocumentData(groupId);
          const depositAmount = params.depositAmount ?? 0;
          const zaloMsg = generateGroupZaloDeposit(groupData, depositAmount);
          await copyZaloText(zaloMsg);
          message.success('Đã sao chép nội dung Zalo vào clipboard!');
          setZaloText(zaloMsg);
          await supabase.rpc('create_document_log', {
            p_group_id: groupId,
            p_booking_id: null,
            p_doc_kind: 'group_deposit_request',
            p_lang: 'vi',
          });
          return zaloMsg;
        }
```

Thay TOÀN BỘ bằng:
```typescript
        case 'group_deposit_request': {
          const groupData = await fetchGroupDocumentData(groupId);
          const depositAmount = params.depositAmount ?? 0;
          const zaloMsg = generateGroupZaloDeposit(groupData, depositAmount);
          await copyZaloText(zaloMsg);
          message.success('Đã sao chép nội dung Zalo vào clipboard!');
          setZaloText(zaloMsg);
          // Bug fix (M2): RPC create_document_log không có params p_doc_kind/p_lang —
          // signature thật là p_doc_type/p_doc_format/p_content_snapshot/... Lệnh gọi
          // cũ chạy "thành công" vì mọi param có default, nhưng ghi log sai hoàn toàn
          // (luôn ghi doc_type='booking_confirmation', format='pdf', mất snapshot).
          const snapshot = {
            guestName: groupData.guestName,
            checkIn: groupData.checkIn,
            checkOut: groupData.checkOut,
            totalGrandTotal: groupData.totalGrandTotal,
            totalPaid: groupData.totalPaid,
            depositAmount,
            roomCount: groupData.bookings.length,
            generatedAt: groupData.generatedAt,
          };
          const { error: logErr3 } = await supabase.rpc('create_document_log', {
            p_group_id: groupId,
            p_booking_id: null,
            p_doc_type: 'group_deposit_request',
            p_doc_format: 'zalo_text',
            p_content_snapshot: snapshot,
            p_sent_via: 'zalo_clipboard',
            p_recipient_name: groupData.guestName,
            p_recipient_phone: groupData.guestPhone || null,
            p_note: null,
          });
          if (logErr3) console.error('[useDocumentGeneratorByGroup] Lỗi ghi log group_deposit_request:', logErr3.message);
          return zaloMsg;
        }
```

## KHÔNG cần sửa
- `src/features/documents/documentTemplates.ts` — `DocKind` type và
  `DOC_KIND_LABELS`/`DOC_KIND_LABELS_EN` đã đầy đủ 8 giá trị đúng tên, không cần đổi.
- `fetchGroupDocumentData` — đã đúng từ trước, không có N+1.

## Sau khi sửa
- Chạy `tsc --noEmit` để confirm không lỗi type.
- Test thực tế: tạo thử 1 group_invoice/group_confirmation/group_deposit_request
  cho 1 booking nhóm có sẵn, query lại bảng `document_logs` để confirm log xuất
  hiện đúng `doc_type` (group_invoice/group_confirmation/group_deposit_request)
  thay vì rơi vào lỗi enum hoặc log sai thành booking_confirmation.
- Commit: `perf+fix: optimize document fetch N+1, fix group doc_type enum + logging bug (M2)`