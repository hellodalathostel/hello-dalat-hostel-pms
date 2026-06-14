# Cleanup Legacy Files

Xóa các file legacy không còn được dùng. Không sửa gì khác.

## Bước 1 — Verify import trước khi xóa

Chạy lệnh sau để confirm không còn import nào trỏ vào các file này:

```bash
grep -r "from '@/hooks/useCheckOut'" src/
grep -r "from '@/hooks/useCreateBooking'" src/
grep -r "from '@/components/CheckoutModal'" src/
```

Nếu kết quả rỗng (hoặc chỉ thấy chính file đó) → tiến hành xóa.

## Bước 2 — Xóa 3 file legacy

```bash
rm src/hooks/useCheckOut.ts
rm src/hooks/useCreateBooking.ts
rm src/components/CheckoutModal.tsx
```

## Bước 3 — Kiểm tra build

```bash
npm run build
```

Nếu có lỗi TypeScript báo missing import → paste lỗi lại để fix.