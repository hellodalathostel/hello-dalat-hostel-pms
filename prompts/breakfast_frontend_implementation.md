# Implement: UI ghi nhận ăn sáng free/paid trên booking

## Bối cảnh
DB đã có sẵn (migration `breakfast_tracking` đã apply vào production, project `rcfhhgywjdwqcgnpkbtl`):
- `bookings` có 3 cột mới: `has_breakfast boolean`, `breakfast_type text ('free'|'paid'|null)`, `breakfast_qty_per_night integer`
- RPC `update_booking_breakfast_txn(p_booking_id, p_has_breakfast, p_breakfast_type, p_qty_per_night)` — entrypoint mutation duy nhất, KHÔNG update trực tiếp bảng `bookings`
- Bảng `breakfast_daily_snapshot`, `breakfast_price_history`, trigger tự tính lại snapshot — phần này đã xong, KHÔNG cần đụng vào, chỉ cần biết để hiểu ngữ cảnh

**Logic tính suất áp dụng (đã confirm và deploy, fix ngày 2026-08-21):** `check_in < ngày ≤ check_out` — sáng ngày check_in KHÔNG tính (khách vừa tới, chưa ở qua đêm), sáng ngày check_out CÓ tính (bữa ăn sáng cuối trước khi rời phòng). Số ngày tính suất = đúng bằng `nights`.

**Công thức hiển thị tổng suất trên UI:**
```
tổng_suất = breakfast_qty_per_night × nights
```
Đây là phép nhân đơn giản, khớp trực tiếp với tên field `breakfast_qty_per_night` — không cần +1 hay -1.

## Việc cần làm

### 1. Types
Tìm file định nghĩa type `Booking` (thường ở `src/types/booking.ts` hoặc tương tự). Thêm 3 field:

```typescript
has_breakfast: boolean;
breakfast_type: 'free' | 'paid' | null;
breakfast_qty_per_night: number;
```

### 2. Hook mutation mới
Tạo file `src/hooks/useUpdateBookingBreakfast.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase'; // CHỈNH lại đường dẫn theo client Supabase thật đang dùng trong repo
import { message } from 'antd';

interface UpdateBreakfastParams {
  bookingId: string;
  hasBreakfast: boolean;
  breakfastType: 'free' | 'paid' | null;
  qtyPerNight: number;
}

export function useUpdateBookingBreakfast() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bookingId, hasBreakfast, breakfastType, qtyPerNight }: UpdateBreakfastParams) => {
      const { data, error } = await supabase.rpc('update_booking_breakfast_txn', {
        p_booking_id: bookingId,
        p_has_breakfast: hasBreakfast,
        p_breakfast_type: breakfastType,
        p_qty_per_night: qtyPerNight,
      });

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    onSuccess: () => {
      // CHỈNH lại query key theo key thật đang dùng cho booking/group trong repo
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['group-detail'] });
      message.success('Đã cập nhật ăn sáng');
    },
    onError: (err: Error) => {
      message.error(`Lỗi cập nhật ăn sáng: ${err.message}`);
    },
  });
}
```

### 3. Component UI
Thêm section "Ăn sáng" vào modal chi tiết booking (component chứa nút "Thêm dịch vụ" / `add_booking_service_txn` hiện tại — tìm và đặt ngay cạnh block Dịch vụ/Discount).

```tsx
import { Switch, Radio, InputNumber, Space, Typography } from 'antd';
import { useState, useEffect } from 'react';
import { useUpdateBookingBreakfast } from '@/hooks/useUpdateBookingBreakfast';

const { Text } = Typography;

// booking: object đã có sẵn trong modal hiện tại, cần có field nights
function BreakfastSection({ booking }: { booking: BookingDetail }) {
  const [hasBreakfast, setHasBreakfast] = useState(booking.has_breakfast);
  const [breakfastType, setBreakfastType] = useState<'free' | 'paid'>(
    booking.breakfast_type ?? 'free'
  );
  const [qtyPerNight, setQtyPerNight] = useState(booking.breakfast_qty_per_night || 1);

  const { mutate: updateBreakfast, isPending } = useUpdateBookingBreakfast();

  useEffect(() => {
    setHasBreakfast(booking.has_breakfast);
    setBreakfastType(booking.breakfast_type ?? 'free');
    setQtyPerNight(booking.breakfast_qty_per_night || 1);
  }, [booking.id]);

  const handleSave = (
    nextHasBreakfast: boolean,
    nextType: 'free' | 'paid',
    nextQty: number
  ) => {
    updateBreakfast({
      bookingId: booking.id,
      hasBreakfast: nextHasBreakfast,
      breakfastType: nextHasBreakfast ? nextType : null,
      qtyPerNight: nextHasBreakfast ? nextQty : 0,
    });
  };

  const totalservings = qtyPerNight * booking.nights;

  return (
    <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginTop: 12 }}>
      <Space align="center" style={{ marginBottom: hasBreakfast ? 8 : 0 }}>
        <Switch
          checked={hasBreakfast}
          loading={isPending}
          onChange={(checked) => {
            setHasBreakfast(checked);
            handleSave(checked, breakfastType, qtyPerNight);
          }}
        />
        <Text strong>Ăn sáng</Text>
      </Space>

      {hasBreakfast && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Radio.Group
            value={breakfastType}
            onChange={(e) => {
              const val = e.target.value as 'free' | 'paid';
              setBreakfastType(val);
              handleSave(true, val, qtyPerNight);
            }}
          >
            <Radio.Button value="free">Free</Radio.Button>
            <Radio.Button value="paid">Có phí</Radio.Button>
          </Radio.Group>

          <Space align="center">
            <Text>Số suất/ngày:</Text>
            <InputNumber
              min={1}
              value={qtyPerNight}
              onChange={(val) => {
                if (val === null) return;
                setQtyPerNight(val);
              }}
              onBlur={() => handleSave(true, breakfastType, qtyPerNight)}
              style={{ width: 80 }}
            />
          </Space>

          <Text type="secondary" style={{ fontSize: 12 }}>
            Tổng: {qtyPerNight} suất × {booking.nights} đêm = {totalservings} suất
          </Text>
        </Space>
      )}
    </div>
  );
}

export default BreakfastSection;
```

Gắn `<BreakfastSection booking={booking} />` vào modal chi tiết booking, ngay dưới block dịch vụ/discount hiện có.

## Lưu ý khi implement
- Đường dẫn import (`@/lib/supabase`), tên component modal thật, và query key thật của booking/group cần map theo repo — đọc file hiện có trước khi chèn code, không đoán.
- Debounce hợp lý cho `InputNumber` (dùng `onBlur` thay vì gọi RPC mỗi lần gõ số) — đã áp dụng trong code mẫu trên.
- Không tự thêm role-check (Owner/Staff) — theo nguyên tắc cốt lõi #3, mọi CRUD nghiệp vụ đều full quyền cho cả 2 role trừ khi được yêu cầu rõ.
- Sau khi implement xong, test thử: tick free 2 suất trên booking 2 đêm (VD check_in 01/09, check_out 03/09) → verify `breakfast_daily_snapshot` có đúng 2 ngày (02/09, 03/09) = 2 suất free. Ngày check_in (01/09) KHÔNG được xuất hiện trong snapshot.
