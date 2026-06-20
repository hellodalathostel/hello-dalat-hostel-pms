# M1 Fix — useRooms() single source of truth

## Phát hiện thực tế qua audit (khác mô tả gốc trong báo cáo Codex)

4 file đã đúng chuẩn, KHÔNG cần sửa: `BlockRoomModal.tsx`, `EditBookingModal.tsx`,
`NewBookingPage.tsx`, `RoomCalendarPage.tsx` — đều dùng `useRooms()` canonical.

5 vấn đề thật sự cần fix:
1. `AddRoomModal.tsx` — tự query rooms riêng, field subset
2. `useOtaCalendar.ts` (`useRoomsWithFeed`) — tự query riêng, cần field ota_feed_url/ota_last_synced_at mà canonical hook chưa có
3. `ICalFeedPanel.tsx` (bản đang dùng, ở `features/settings/components/`) — tự query riêng
4. `src/pages/Settings/ICalFeedPanel.tsx` — **dead code trùng lặp 100% logic**, không ai import → xoá hẳn
5. `useOtaImport.ts` — invalidate query key `['ota-rooms']` đã không còn tồn tại sau khi merge → phải đổi sang `['rooms']`

KHÔNG sửa `useDocumentGenerator.ts` (fetch single room theo id, thuộc N+1 pattern của M2,
không phải M1 — tránh trộn scope).

## Quyết định kỹ thuật quan trọng

Canonical `useRooms()` được MỞ RỘNG thêm 2 field `ota_feed_url`, `ota_last_synced_at`
vào SELECT mặc định — vì list chỉ 8 phòng, thêm 2 cột không ảnh hưởng performance,
và đảm bảo 1 nguồn field duy nhất cho mọi nơi dùng rooms list trong tương lai.

---

## File 1: src/types/room.ts

Thêm 2 field vào cuối interface `Room`:

```typescript
import type { HousekeepingStatus } from '@/types/database'

export interface Room {
  id: string
  name: string
  type: string
  capacity: number
  base_price: number
  floor: number | null
  is_active: boolean
  housekeeping_status: HousekeepingStatus
  housekeeping_note: string | null
  ical_export_token: string
  ota_feed_url: string | null
  ota_last_synced_at: string | null
}
```

---

## File 2: src/features/bookings/hooks/useRooms.ts

Thay toàn bộ nội dung file bằng:

```typescript
// Hook fetch danh sách phòng từ DB — dùng cho Calendar, Dashboard, OTA panel, v.v.
// Single source of truth duy nhất cho danh sách rooms trong toàn app (M1 fix).
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import type { Room } from '@/types/room'

export type RoomsQueryItem = Pick<
  Room,
  | 'id'
  | 'name'
  | 'type'
  | 'floor'
  | 'capacity'
  | 'is_active'
  | 'housekeeping_status'
  | 'housekeeping_note'
  | 'ota_feed_url'
  | 'ota_last_synced_at'
>

export function useRooms(onlyActive = true) {
  return useQuery<RoomsQueryItem[]>({
    queryKey: ['rooms', { onlyActive }],
    queryFn: async () => {
      let query = supabase
        .from('rooms')
        .select(
          'id, name, type, floor, capacity, is_active, housekeeping_status, housekeeping_note, ota_feed_url, ota_last_synced_at',
        )
        .order('floor', { ascending: true })
        .order('id', { ascending: true })

      if (onlyActive) query = query.eq('is_active', true)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as RoomsQueryItem[]
    },
    staleTime: 10 * 60 * 1000, // phòng ít thay đổi, cache 10 phút
  })
}
```

---

## File 3: src/components/bookings/AddRoomModal.tsx

### Patch 3a — imports (đầu file)

Thay:
```typescript
import { useEffect } from 'react';
import {
  Modal, Form, Select, DatePicker, InputNumber, Input, Row, Col, Spin,
} from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabase';
import { useAddRoomToGroup } from '@/hooks/useAddRoomToGroup';
import { useAppFeedback } from '@/shared/hooks/useAppFeedback';
```

Bằng:
```typescript
import { useEffect } from 'react';
import {
  Modal, Form, Select, DatePicker, InputNumber, Input, Row, Col, Spin,
} from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/api/supabase';
import { useRooms } from '@/features/bookings/hooks/useRooms';
import { useAddRoomToGroup } from '@/hooks/useAddRoomToGroup';
import { useAppFeedback } from '@/shared/hooks/useAppFeedback';
```

(Lưu ý: `supabase` vẫn còn dùng ở chỗ khác trong file — RPC `get_suggested_price` —
nên giữ import này, chỉ xóa `useQuery`.)

### Patch 3b — query rooms

Thay:
```typescript
  const { data: rooms = [], isLoading: roomsLoading } = useQuery({
    queryKey: ['rooms-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, name')
        .eq('is_active', true)
        .order('id');
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });
```

Bằng:
```typescript
  // M1 fix: dùng canonical useRooms() thay vì tự query riêng (chỉ phòng active).
  const { data: rooms = [], isLoading: roomsLoading } = useRooms();
```

---

## File 4: src/features/ota-calendar/hooks/useOtaCalendar.ts

Thay toàn bộ nội dung file bằng:

```typescript
// src/features/ota-calendar/hooks/useOtaCalendar.ts
// Query danh sách OTA events + rooms có feed

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { supabase } from '@/api/supabase'
import { useRooms } from '@/features/bookings/hooks/useRooms'
import type { OtaCalendarEvent, RoomWithFeed } from '../types'

// ─── Query keys ──────────────────────────────────────────────────────────────
export const otaKeys = {
  events: (filters?: { status?: string; room_id?: string }) =>
    ['ota-events', filters] as const,
}

// ─── Lấy danh sách OTA events (có filter) ────────────────────────────────────
export function useOtaEvents(filters?: { status?: OtaCalendarEvent['status']; room_id?: string }) {
  return useQuery({
    queryKey: otaKeys.events(filters),
    queryFn: async () => {
      let q = supabase
        .from('ota_calendar_feed')
        .select('*')
        .order('check_in', { ascending: true })

      if (filters?.status) q = q.eq('status', filters.status)
      if (filters?.room_id) q = q.eq('room_id', filters.room_id)

      const { data, error } = await q
      if (error) throw error
      return data as OtaCalendarEvent[]
    },
  })
}

// ─── Lấy rooms có ota_feed_url ────────────────────────────────────────────────
// M1 fix: dùng canonical useRooms() (đã mở rộng select thêm ota_feed_url/
// ota_last_synced_at) thay vì tự query riêng — tránh lệch cache key với nơi khác.
export function useRoomsWithFeed() {
  const { data, isLoading, error } = useRooms()

  const rooms: RoomWithFeed[] = (data ?? []).map((room) => ({
    id: room.id,
    name: room.name,
    ota_feed_url: room.ota_feed_url,
    ota_last_synced_at: room.ota_last_synced_at,
  }))

  return { data: rooms, isLoading, error }
}

// ─── Dismiss event (đánh dấu đã xử lý) ──────────────────────────────────────
export function useDismissOtaEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from('ota_calendar_feed')
        .update({ status: 'dismissed' })
        .eq('id', eventId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ota-events'] })
      message.success('Đã dismiss event')
    },
    onError: (err: Error) => {
      message.error(`Lỗi: ${err.message}`)
    },
  })
}
```

**Lưu ý:** field `otaKeys.rooms` đã bị xoá khỏi object `otaKeys` — kiểm tra không
còn nơi nào khác trong code gọi `otaKeys.rooms()` (đã audit, chỉ có
`useOtaImport.ts` dùng string literal `'ota-rooms'` trực tiếp, xử lý ở File 5).

---

## File 5: src/features/ota-calendar/hooks/useOtaImport.ts

Tìm đoạn:
```typescript
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['ota-events'] })
      qc.invalidateQueries({ queryKey: ['ota-rooms'] })
      if (data.totalConflicts > 0) {
```

Thay bằng:
```typescript
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['ota-events'] })
      // M1 fix: 'ota-rooms' đã merge vào canonical 'rooms' query key (useRooms hook)
      qc.invalidateQueries({ queryKey: ['rooms'] })
      if (data.totalConflicts > 0) {
```

(`invalidateQueries({queryKey: ['rooms']})` match prefix mọi key `['rooms', {...}]`
nên cả `onlyActive: true` và `false` đều được invalidate đúng.)

---

## File 6: src/features/settings/components/ICalFeedPanel.tsx

Thay toàn bộ nội dung file bằng:

```typescript
import { CopyOutlined, LinkOutlined } from '@ant-design/icons'
import { Button, Card, Space, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRooms, type RoomsQueryItem } from '@/features/bookings/hooks/useRooms'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

const { Text, Link } = Typography

const ICAL_BASE_URL =
  'https://rcfhhgywjdwqcgnpkbtl.supabase.co/functions/v1/ical-feed'

export function ICalFeedPanel() {
  const { message } = useAppFeedback()
  // M1 fix: dùng canonical useRooms() thay vì tự query riêng.
  // onlyActive=false để giữ behavior gốc: hiển thị cả phòng inactive (vẫn cần tạo feed URL khi reactivate).
  const { data: rooms, isLoading } = useRooms(false)

  const handleCopy = async (roomId: string, roomName: string) => {
    try {
      const feedUrl = `${ICAL_BASE_URL}?room_id=${roomId}`
      await navigator.clipboard.writeText(feedUrl)
      message.success(`Da copy iCal URL cho phong ${roomName}`)
    } catch (error) {
      console.error(error)
      message.error('Khong the copy iCal URL')
    }
  }

  const columns: ColumnsType<RoomsQueryItem> = [
    {
      title: 'Phong',
      dataIndex: 'id',
      key: 'id',
      width: 100,
    },
    {
      title: 'Loai phong',
      dataIndex: 'type',
      key: 'type',
      width: 160,
    },
    {
      title: 'iCal Feed URL',
      key: 'url',
      render: (_, record) => {
        const feedUrl = `${ICAL_BASE_URL}?room_id=${record.id}`

        return (
          <Text
            code
            copyable={false}
            style={{ fontSize: 11, wordBreak: 'break-all' }}
          >
            {feedUrl}
          </Text>
        )
      },
    },
    {
      title: 'Action',
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={() => handleCopy(record.id, record.name)}
          >
            Copy URL
          </Button>
          <Link
            href={`${ICAL_BASE_URL}?room_id=${record.id}`}
            target="_blank"
            rel="noreferrer"
          >
            <LinkOutlined /> Test
          </Link>
        </Space>
      ),
    },
  ]

  return (
    <Card
      title="iCal Feed - OTA Sync"
      extra={
        <Text type="secondary" style={{ fontSize: 12 }}>
          Copy URL, dan vao Booking.com / Availability / iCal Import
        </Text>
      }
    >
      <Table<RoomsQueryItem>
        dataSource={rooms ?? []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        pagination={false}
        size="small"
      />
    </Card>
  )
}
```

---

## File 7: src/pages/Settings/ICalFeedPanel.tsx

**XOÁ FILE NÀY HOÀN TOÀN.** Đây là dead code trùng lặp 100% logic với File 6 —
đã audit bằng `grep -rln "ICalFeedPanel" src`, chỉ
`src/app/router.tsx` và `src/features/settings/index.ts` import, cả hai đều
import từ `@/features/settings/components/ICalFeedPanel` (File 6), không phải
file này.

```bash
rm src/pages/Settings/ICalFeedPanel.tsx
```

---

## Sau khi sửa
- Chạy `tsc -b` hoặc `tsc --noEmit` để confirm hết lỗi type — đặc biệt chú ý
  `RoomsQueryItem` export đúng từ `useRooms.ts` vì File 6 import type này.
- Chạy thử UI: trang Settings → iCal Feed tab, trang OTA Calendar, modal Thêm phòng
  (AddRoomModal) — đảm bảo hiển thị đúng danh sách phòng.
- Commit: `refactor: consolidate rooms fetching into canonical useRooms() hook (M1)`