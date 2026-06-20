# M3 Fix — staleTime/gcTime policy cho 3 hooks

Phát hiện thực tế (khác báo cáo Codex gốc): `useBookingsList` và `useGuests` đã có
`staleTime: 30_000` sẵn — chỉ thiếu `gcTime`. `useDashboard` dùng `refetchInterval`
thay staleTime (hợp lý vì cần real-time) nhưng chưa khai báo tường minh.
`useGuestBookings` (con của useGuests) hoàn toàn chưa có policy.

## File 1: src/features/bookings/hooks/useBookingsList.ts

Thay:
```typescript
export function useBookingsList() {
  return useQuery({
    queryKey: ['bookings-list'],
    queryFn: fetchBookingsList,
    staleTime: 30_000,
  })
}
```

Bằng:
```typescript
export function useBookingsList() {
  return useQuery({
    queryKey: ['bookings-list'],
    queryFn: fetchBookingsList,
    staleTime: 30_000, // 30s — danh sách booking thay đổi khi staff thao tác
    gcTime: 5 * 60_000, // 5 phút — giữ cache khi chuyển tab/trang rồi quay lại
  })
}
```

## File 2: src/features/dashboard/hooks/useDashboard.ts

Thay:
```typescript
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'today'],
    queryFn: fetchDashboardRooms,
    refetchInterval: 300000,
    refetchOnWindowFocus: true,
  })
}
```

Bằng:
```typescript
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'today'],
    queryFn: fetchDashboardRooms,
    staleTime: 0, // Tường minh: dashboard cần luôn fresh khi focus lại tab (real-time tình trạng phòng)
    gcTime: 60_000, // 1 phút — không cần giữ cache lâu vì luôn refetch khi mount
    refetchInterval: 300000,
    refetchOnWindowFocus: true,
  })
}
```

## File 3: src/features/guests/hooks/useGuests.ts

Thay `useGuests`:
```typescript
export function useGuests(search: string) {
  return useQuery({
    queryKey: ['guests', search],
    queryFn: () => fetchGuests(search),
    staleTime: 30_000,
  })
}
```

Bằng:
```typescript
export function useGuests(search: string) {
  return useQuery({
    queryKey: ['guests', search],
    queryFn: () => fetchGuests(search),
    staleTime: 30_000, // 30s — danh sách khách ít thay đổi trong phiên làm việc
    gcTime: 5 * 60_000,
  })
}
```

Thay `useGuestBookings`:
```typescript
export function useGuestBookings(customerId: string | null) {
  return useQuery({
    queryKey: ['guest-bookings', customerId],
    enabled: Boolean(customerId),
    queryFn: () => fetchGuestBookings(customerId as string),
  })
}
```

Bằng:
```typescript
export function useGuestBookings(customerId: string | null) {
  return useQuery({
    queryKey: ['guest-bookings', customerId],
    enabled: Boolean(customerId),
    queryFn: () => fetchGuestBookings(customerId as string),
    staleTime: 60_000, // 60s — lịch sử booking của khách hầu như không đổi trong phiên xem
    gcTime: 10 * 60_000,
  })
}
```

## Policy chung (tham khảo cho hooks tương tự tương lai)
- List/search pages (bookings, guests): staleTime 30s, gcTime 5 phút
- Dashboard real-time: staleTime 0 tường minh + refetchInterval
- Chi tiết ít đổi (lịch sử, danh sách tĩnh): staleTime 60s, gcTime 10 phút

## Sau khi sửa
- Chạy `tsc --noEmit` để confirm không lỗi type.
- Commit riêng: `perf: standardize staleTime/gcTime policy across query hooks (M3)`