# M5 Fix — Standardize try/catch trong mutations

Áp dụng đúng 3 patch sau, không sửa gì khác ngoài phạm vi này.

## File 1: src/features/bookings/hooks/useServiceActions.ts

Thay nội dung 2 mutation `addService` và `deleteService` bằng:

```typescript
  const addService = useMutation({
    mutationFn: async (payload: AddServicePayload) => {
      try {
        const { data, error } = await supabase.rpc('add_booking_service_txn', {
          p_booking_id: payload.bookingId,
          p_service_id: payload.serviceId ?? null,
          p_qty: payload.qty,
          p_custom_name: payload.serviceId ? null : payload.name,
          p_custom_price: payload.serviceId ? null : payload.price,
        })
        if (error) throw error
        return data
      } catch (err) {
        // Bắt cả lỗi network/parsing ngoài error field của Supabase response
        throw err instanceof Error ? err : new Error('Lỗi không xác định khi thêm dịch vụ')
      }
    },
    onSuccess: () => { message.success('Đã thêm dịch vụ'); invalidate() },
    onError: (err: Error) => { message.error(`Lỗi thêm dịch vụ: ${err.message}`) },
  })

  const deleteService = useMutation({
    mutationFn: async (serviceRowId: string) => {
      try {
        const { error } = await supabase.rpc('delete_booking_service_txn', {
          p_service_row_id: serviceRowId,
        })
        if (error) throw error
      } catch (err) {
        throw err instanceof Error ? err : new Error('Lỗi không xác định khi xóa dịch vụ')
      }
    },
    onSuccess: () => { message.success('Đã xóa dịch vụ'); invalidate() },
    onError: (err: Error) => { message.error(`Lỗi xóa dịch vụ: ${err.message}`) },
  })
```

## File 2: src/features/bookings/hooks/useDiscountActions.ts

Thay nội dung 2 mutation `addDiscount` và `deleteDiscount` bằng:

```typescript
  const addDiscount = useMutation({
    mutationFn: async (payload: AddDiscountPayload) => {
      try {
        const { data, error } = await supabase.rpc('add_discount_txn', {
          p_booking_id: payload.bookingId,
          p_amount: payload.amount,
          p_description: payload.description ?? null,
        })
        if (error) throw error
        return data
      } catch (err) {
        throw err instanceof Error ? err : new Error('Lỗi không xác định khi thêm giảm giá')
      }
    },
    onSuccess: () => { message.success('Đã thêm giảm giá'); invalidate() },
    onError: (err: Error) => { message.error(`Lỗi thêm giảm giá: ${err.message}`) },
  })

  const deleteDiscount = useMutation({
    mutationFn: async (discountId: string) => {
      try {
        const { error } = await supabase.rpc('delete_booking_discount_txn', {
          p_discount_row_id: discountId,
        })
        if (error) throw error
      } catch (err) {
        throw err instanceof Error ? err : new Error('Lỗi không xác định khi xóa giảm giá')
      }
    },
    onSuccess: () => { message.success('Đã xóa giảm giá'); invalidate() },
    onError: (err: Error) => { message.error(`Lỗi xóa giảm giá: ${err.message}`) },
  })
```

## File 3: src/features/booking-requests/hooks/useBookingRequests.ts

Thay toàn bộ function `useRejectRequest` bằng:

```typescript
export function useRejectRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string, reason?: string }) => {
      try {
        const { error } = await supabase
          .from('booking_requests')
          .update({ status: 'rejected', rejected_reason: reason ?? null })
          .eq('id', id)

        if (error) {
          throw error
        }
      } catch (err) {
        throw err instanceof Error ? err : new Error('Lỗi không xác định khi từ chối yêu cầu')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingRequestKeys.all })
      queryClient.invalidateQueries({ queryKey: bookingRequestKeys.pendingCount })
      message.success('Đã từ chối yêu cầu')
    },
    onError: (err: Error) => {
      message.error(`Không thể cập nhật: ${err.message}`)
    },
  })
}
```

Và thay `mutationFn` trong `useConvertRequest` bằng:

```typescript
    mutationFn: async ({
      request,
      pricePerNight,
    }: {
      request: BookingRequest,
      pricePerNight: number,
    }) => {
      try {
        const { data, error } = await supabase.rpc('confirm_booking_request_txn', {
          p_request_id: request.id,
          p_price_per_night: pricePerNight,
        })

        if (error) {
          throw error
        }

        const result = data as ConfirmBookingRequestTxnResult | null
        if (!result?.success) {
          throw new Error(result?.error ?? 'confirm_booking_request_txn thất bại')
        }

        return result.group_id
      } catch (err) {
        throw err instanceof Error ? err : new Error('Lỗi không xác định khi tạo booking')
      }
    },
```

(Phần `onSuccess`/`onError` của `useConvertRequest` giữ nguyên không đổi.)

## Sau khi sửa
- Chạy `npm run typecheck` hoặc `tsc --noEmit` để confirm không lỗi type.
- Commit riêng: `fix: standardize try/catch in service/discount/booking-request mutations (M5)`