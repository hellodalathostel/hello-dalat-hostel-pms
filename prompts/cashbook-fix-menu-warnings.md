# Task: Fix 3 vấn đề sau khi test module Sổ quỹ

Module Sổ quỹ đã chạy đúng ở `/so-quy`, dữ liệu hiển thị chuẩn. Còn 3 vấn đề phát hiện khi test trên desktop.

---

## VẤN ĐỀ 1 — Menu desktop thiếu tab Sổ quỹ (quan trọng nhất)

**Hiện tượng:** Khi ở `/so-quy` trên desktop, menu ngang trên cùng vẫn tô đậm "Tổng quan". Ant Design Menu không tìm thấy key khớp với `/so-quy` nên fallback về mục đầu tiên. Người dùng tưởng đang ở Dashboard.

**Nguyên nhân:** Spec trước chỉ hướng dẫn thêm tab vào `BottomNav.tsx` (mobile), quên `MainLayout.tsx` (desktop sidebar/menu).

**File cần sửa:** `src/app/layouts/MainLayout.tsx`

### Sửa 1.1 — thêm icon vào import

Tìm khối import icon, dòng cuối là `UserAddOutlined,`:

```typescript
  UserAddOutlined,
} from '@ant-design/icons'
```

Đổi thành:

```typescript
  UserAddOutlined,
  WalletOutlined,
} from '@ant-design/icons'
```

### Sửa 1.2 — thêm menu item

Trong hàm `createMenuItems`, tìm 2 dòng liền nhau:

```typescript
    { key: '/housekeeping', icon: <CheckSquareOutlined />, label: 'Housekeeping' },
    { key: '/finance', icon: <DollarOutlined />, label: 'Tài chính' },
```

Chèn 1 dòng vào giữa:

```typescript
    { key: '/housekeeping', icon: <CheckSquareOutlined />, label: 'Housekeeping' },
    { key: '/so-quy', icon: <WalletOutlined />, label: 'Sổ quỹ' },
    { key: '/finance', icon: <DollarOutlined />, label: 'Tài chính' },
```

> **Lưu ý:** Menu desktop dùng `key` làm path (khớp pattern các mục sẵn có), không cần thêm field `path`. Đặt trước `/finance` cho khớp thứ tự với BottomNav.

> **KHÔNG thêm `ownerOnly`** hay bất kỳ role-check nào. Lợi (staff) là người dùng chính của Sổ quỹ. Đây là chủ ý, không phải thiếu sót.

---

## VẤN ĐỀ 2 — Warning `destroyOnClose` deprecated

**Console log:**
```
Warning: [antd: Modal] `destroyOnClose` is deprecated. Please use `destroyOnHidden` instead.
```

**File cần sửa (4 file):**
- `src/features/cashbook/components/CashEntryModal.tsx`
- `src/features/cashbook/components/VoidEntryModal.tsx`
- `src/features/cashbook/components/CloseShiftModal.tsx`
- `src/features/cashbook/components/ReopenShiftModal.tsx`

Xem cách xử lý ở Vấn đề 3 — hai vấn đề này fix chung một chỗ.

---

## VẤN ĐỀ 3 — Warning `useForm` không kết nối Form

**Console log:**
```
Warning: Instance created by `useForm` is not connected to any Form element.
Forget to pass `form` prop?
```

**Nguyên nhân:** `destroyOnClose` huỷ toàn bộ nội dung Modal khi đóng, khiến `Form` instance tạo bởi `useForm()` mất kết nối với DOM element.

**Cách fix:** Bỏ hẳn prop `destroyOnClose` khỏi cả 4 Modal.

Lý do bỏ được: mỗi component đã có sẵn `useEffect` reset form khi modal đóng:

```typescript
useEffect(() => {
  if (!open) form.resetFields();
}, [open, form]);
```

`destroyOnClose` vốn chỉ để đảm bảo form sạch khi mở lại — việc đó `resetFields()` đã làm rồi. Giữ cả hai vừa thừa vừa gây warning.

### Thao tác cụ thể

Trong **cả 4 file**, tìm và **xoá** dòng:

```typescript
      destroyOnClose
```

Ví dụ, `VoidEntryModal.tsx` trước khi sửa:

```typescript
    <Modal
      open={open}
      title="Huỷ giao dịch"
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Huỷ giao dịch"
      okButtonProps={{ danger: true }}
      cancelText="Quay lại"
      confirmLoading={voidEntry.isPending}
      destroyOnClose
      width="min(480px, 92vw)"
    >
```

Sau khi sửa:

```typescript
    <Modal
      open={open}
      title="Huỷ giao dịch"
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Huỷ giao dịch"
      okButtonProps={{ danger: true }}
      cancelText="Quay lại"
      confirmLoading={voidEntry.isPending}
      width="min(480px, 92vw)"
    >
```

Làm tương tự cho 3 file còn lại.

### Trường hợp đặc biệt — `CashEntryModal.tsx`

File này có `useEffect` phức tạp hơn (vừa reset, vừa nạp dữ liệu khi ở chế độ sửa). **Giữ nguyên `useEffect`, chỉ bỏ `destroyOnClose`**:

```typescript
  // Do du lieu vao form khi mo o che do sua
  useEffect(() => {
    if (!open) {
      form.resetFields();
      return;
    }
    if (editingEntry) {
      form.setFieldsValue({
        entryType: editingEntry.entry_type as CashEntryType,
        amount: editingEntry.amount,
        description: editingEntry.description ?? '',
      });
    }
  }, [open, editingEntry, form]);
```

Logic này đã đúng, không đụng vào.

---

## Kiểm tra sau khi sửa

```bash
npm run dev
```

### Trên desktop (viewport rộng)

- [ ] Menu ngang có mục **"Sổ quỹ"** với icon ví, nằm giữa "Housekeeping" và "Tài chính"
- [ ] Bấm vào → URL thành `/so-quy`, mục "Sổ quỹ" được **tô đậm**, "Tổng quan" **không** còn tô đậm
- [ ] Bấm "Tổng quan" → quay lại `/`, tô đậm chuyển đúng

### Trên mobile (375px)

- [ ] BottomNav vẫn có tab "Sổ quỹ" như trước, hoạt động bình thường
- [ ] Mở modal "Thêm giao dịch" → điền dở → đóng → mở lại → **form trống** (không giữ dữ liệu cũ)
- [ ] Mở modal "Sửa" một giao dịch → đóng → mở "Thêm giao dịch" → **form trống**, không dính dữ liệu của giao dịch vừa sửa

> Hai mục cuối là để chắc chắn việc bỏ `destroyOnClose` không làm rò rỉ state giữa các lần mở modal. Nếu form vẫn giữ dữ liệu cũ, báo lại — khi đó cần thêm `key` prop cho Modal thay vì dựa vào `resetFields`.

### Console

- [ ] Không còn warning `destroyOnClose is deprecated`
- [ ] Không còn warning `useForm is not connected to any Form element`
- [ ] Warning `React Router Future Flag` vẫn còn — **bình thường**, không liên quan module này, không cần sửa

### Build

```bash
npx tsc -b
```

- [ ] Không phát sinh lỗi TS mới trong `src/features/cashbook/` hoặc `src/app/layouts/`
- [ ] 4 lỗi cũ ở `exportS1aExcel.ts` (thiếu type `exceljs`) vẫn còn — **bình thường**, có từ trước, ngoài phạm vi task này

---

## Trạng thái DB hiện tại (để đối chiếu khi test)

Ngày 2026-07-21, production:

| | |
|---|---|
| Tồn đầu ngày | 3.726.350 ₫ |
| Thu trong ngày | 1.684.410 ₫ (3 giao dịch tự động) |
| Chi trong ngày | 0 ₫ |
| **Tồn quỹ** | **5.410.760 ₫** |
| Trạng thái | Chưa chốt ca |

> Đây là production DB, số có thể thay đổi nếu Lợi thu tiền khách. Nếu số trên màn hình khác bảng này, kiểm tra danh sách chi tiết trước khi kết luận là bug.
>
> Khi test modal, **chỉ tạo giao dịch có nội dung bắt đầu bằng "Test"** và huỷ sau khi xong. Không đụng vào các dòng "Thu khach" của khách thật.

---

## Phạm vi

Chỉ sửa 5 file:

| File | Thay đổi |
|---|---|
| `src/app/layouts/MainLayout.tsx` | +2 dòng (icon import + menu item) |
| `src/features/cashbook/components/CashEntryModal.tsx` | −1 dòng |
| `src/features/cashbook/components/VoidEntryModal.tsx` | −1 dòng |
| `src/features/cashbook/components/CloseShiftModal.tsx` | −1 dòng |
| `src/features/cashbook/components/ReopenShiftModal.tsx` | −1 dòng |

Không đụng router, hooks, types, constants, BottomNav — những phần đó đã đúng.
