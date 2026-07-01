# Spec: Settings → Quản lý phòng (Room Management)

Module 1/4 của Settings UI. Implement xong báo lại trước khi sang module 2 (Loại phòng/Tầng).

---

## 1. Why

**Hiện trạng:** `rooms` table đã có đủ schema (`id, name, type, capacity, base_price, floor, is_active, housekeeping_status, housekeeping_note, ical_export_token, ota_feed_url, ota_last_synced_at`). RLS đã đúng chuẩn: Owner full CRUD qua policy `owner_write` (ALL, with_check `current_user_role() = 'owner'`), Staff/authenticated chỉ SELECT qua `auth_read`. Hiện chưa có UI để sửa `name`, `base_price`, `floor`, `capacity`, `is_active` — chỉ đổi được qua Supabase Dashboard tay.

**Giả định nghiệp vụ:**
- Chỉ Owner mới thấy nút Sửa/Thêm/Xoá (Staff chỉ xem danh sách — RLS đã chặn write ở DB, nhưng ẩn UI luôn cho UX rõ ràng, tránh Staff bấm rồi nhận lỗi).
- "Xoá phòng" thực chất là set `is_active = false` (soft-delete) — không DELETE thật, vì phòng có thể đã có booking lịch sử liên kết (FK booking.room_id). Không thêm RPC mới cho việc này — update trực tiếp qua RLS `owner_write` là đủ, vì đây là cấu hình đơn giản, không phải mutation nghiệp vụ phức tạp cần transaction.
- Không cho sửa `id` (room code, dùng làm khoá ngoài ở booking/calendar) sau khi tạo — chỉ set lúc tạo mới.
- Thêm phòng mới: cần nhập `id` (ví dụ "401"), `name`, `type` (free text — chưa có bảng loại phòng riêng, module 2 sẽ chuẩn hoá sau), `capacity`, `base_price`, `floor`. `housekeeping_status` mặc định `'clean'`, `ical_export_token` generate random hex32 (giữ đúng pattern các phòng cũ).

---

## 2. DB

Không cần migration mới — schema đã đủ. Chỉ cần đảm bảo `ical_export_token` có default generate ở DB hoặc generate ở frontend lúc tạo phòng.

Verify trước khi code (Claude Code CLI tự chạy nếu có quyền, hoặc Hiếu confirm tay):

```sql
-- Kiểm tra ical_export_token có default không
SELECT column_default FROM information_schema.columns
WHERE table_name = 'rooms' AND column_name = 'ical_export_token';
```

Nếu kết quả là `NULL` (không có default), bắt buộc generate token ở frontend lúc INSERT — xem code Bước 3.

---

## 3. Frontend

### 3.1. Mở rộng `useRooms` hook để lấy thêm `base_price`

File: `src/features/bookings/hooks/useRooms.ts`

```typescript
// Hook fetch danh sách phòng từ DB — dùng cho Calendar, Dashboard, OTA panel, Settings, v.v.
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
  | 'base_price'
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
          'id, name, type, floor, capacity, base_price, is_active, housekeeping_status, housekeeping_note, ota_feed_url, ota_last_synced_at',
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

**Lưu ý:** chỉ thêm `base_price` vào type + select string. Không đổi gì khác — các nơi đang dùng `useRooms` (ICalFeedPanel, Calendar, Dashboard) không bị ảnh hưởng vì chỉ thêm field, không xoá field cũ.

---

### 3.2. Hook mutation — `useRoomMutations.ts` (mới)

File: `src/features/settings/hooks/useRoomMutations.ts`

```typescript
// Hook tạo/sửa/ẩn phòng — chỉ Owner dùng được (RLS owner_write chặn ở DB,
// UI cũng ẩn nút cho Staff để tránh nhận lỗi RLS confusing).
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

export interface CreateRoomInput {
  id: string
  name: string
  type: string
  capacity: number
  base_price: number
  floor: number | null
}

export interface UpdateRoomInput {
  id: string
  name?: string
  type?: string
  capacity?: number
  base_price?: number
  floor?: number | null
}

function generateIcalToken(): string {
  // hex32 — giữ đúng pattern token cũ trong Brain (ví dụ "53a8a98b3a6802c3469abbdc6ae62dc2")
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function useCreateRoom() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async (input: CreateRoomInput) => {
      const { error } = await supabase.from('rooms').insert({
        ...input,
        ical_export_token: generateIcalToken(),
        is_active: true,
        housekeeping_status: 'clean',
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      message.success('Da them phong moi')
    },
    onError: (error) => {
      console.error(error)
      message.error('Khong the them phong. Kiem tra ma phong co bi trung khong.')
    },
  })
}

export function useUpdateRoom() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async ({ id, ...rest }: UpdateRoomInput) => {
      const { error } = await supabase.from('rooms').update(rest).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      message.success('Da luu thay doi')
    },
    onError: (error) => {
      console.error(error)
      message.error('Khong the luu thay doi phong')
    },
  })
}

export function useToggleRoomActive() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('rooms').update({ is_active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      message.success(variables.is_active ? 'Da kich hoat lai phong' : 'Da an phong')
    },
    onError: (error) => {
      console.error(error)
      message.error('Khong the doi trang thai phong')
    },
  })
}
```

---

### 3.3. Component — `RoomManagementPanel.tsx` (mới)

File: `src/features/settings/components/RoomManagementPanel.tsx`

```tsx
import { useState } from 'react'
import { PlusOutlined, EditOutlined, EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, InputNumber, Modal, Space, Switch, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRooms, type RoomsQueryItem } from '@/features/bookings/hooks/useRooms'
import {
  useCreateRoom,
  useUpdateRoom,
  useToggleRoomActive,
  type CreateRoomInput,
} from '@/features/settings/hooks/useRoomMutations'
import { useCurrentUserRole } from '@/features/auth/hooks/useCurrentUserRole'

export function RoomManagementPanel() {
  const { data: role } = useCurrentUserRole()
  const isOwner = role === 'owner'

  const { data: rooms, isLoading } = useRooms(false)
  const createRoom = useCreateRoom()
  const updateRoom = useUpdateRoom()
  const toggleActive = useToggleRoomActive()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingRoom, setEditingRoom] = useState<RoomsQueryItem | null>(null)
  const [form] = Form.useForm<CreateRoomInput>()

  const openCreateModal = () => {
    setEditingRoom(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEditModal = (room: RoomsQueryItem) => {
    setEditingRoom(room)
    form.setFieldsValue({
      id: room.id,
      name: room.name,
      type: room.type,
      capacity: room.capacity,
      base_price: room.base_price,
      floor: room.floor,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()

    if (editingRoom) {
      await updateRoom.mutateAsync({ id: editingRoom.id, ...values })
    } else {
      await createRoom.mutateAsync(values)
    }
    setModalOpen(false)
  }

  const columns: ColumnsType<RoomsQueryItem> = [
    { title: 'Ma phong', dataIndex: 'id', key: 'id', width: 90 },
    { title: 'Ten phong', dataIndex: 'name', key: 'name' },
    { title: 'Loai', dataIndex: 'type', key: 'type' },
    { title: 'Tang', dataIndex: 'floor', key: 'floor', width: 70 },
    { title: 'So khach', dataIndex: 'capacity', key: 'capacity', width: 90 },
    {
      title: 'Gia co ban',
      dataIndex: 'base_price',
      key: 'base_price',
      width: 130,
      render: (price: number) => `${price.toLocaleString('vi-VN')}d`,
    },
    {
      title: 'Trang thai',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 110,
      render: (active: boolean) =>
        active ? <Tag color="green">Dang dung</Tag> : <Tag color="red">Da an</Tag>,
    },
    ...(isOwner
      ? [
          {
            title: 'Hanh dong',
            key: 'action',
            width: 140,
            render: (_: unknown, record: RoomsQueryItem) => (
              <Space>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEditModal(record)}
                />
                <Button
                  size="small"
                  danger={record.is_active}
                  icon={record.is_active ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  onClick={() =>
                    toggleActive.mutate({ id: record.id, is_active: !record.is_active })
                  }
                />
              </Space>
            ),
          },
        ]
      : []),
  ]

  return (
    <Card
      title="Quan ly phong"
      extra={
        isOwner && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            Them phong
          </Button>
        )
      }
    >
      <Table<RoomsQueryItem>
        dataSource={rooms ?? []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        pagination={false}
        size="small"
        scroll={{ x: true }}
      />

      <Modal
        title={editingRoom ? `Sua phong ${editingRoom.id}` : 'Them phong moi'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={createRoom.isPending || updateRoom.isPending}
        okText="Luu"
        cancelText="Huy"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="id"
            label="Ma phong"
            rules={[{ required: true, message: 'Nhap ma phong' }]}
          >
            <Input disabled={!!editingRoom} placeholder="Vi du: 401" />
          </Form.Item>
          <Form.Item
            name="name"
            label="Ten phong"
            rules={[{ required: true, message: 'Nhap ten phong' }]}
          >
            <Input placeholder="Vi du: Deluxe Double" />
          </Form.Item>
          <Form.Item
            name="type"
            label="Loai phong"
            rules={[{ required: true, message: 'Nhap loai phong' }]}
          >
            <Input placeholder="Vi du: Deluxe Double" />
          </Form.Item>
          <Form.Item
            name="capacity"
            label="So khach toi da"
            rules={[{ required: true, message: 'Nhap so khach' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="base_price"
            label="Gia co ban (VND/dem)"
            rules={[{ required: true, message: 'Nhap gia co ban' }]}
          >
            <InputNumber
              min={0}
              step={10000}
              style={{ width: '100%' }}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            />
          </Form.Item>
          <Form.Item name="floor" label="Tang">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
```

**Đã verify trực tiếp trong repo:** dùng đúng `useCurrentUserRole()` từ `src/features/auth/hooks/useCurrentUserRole.ts` — hook này gọi RPC `current_user_role()`, cùng pattern đang dùng trong `BottomNav.tsx` (`role === 'owner'`). Không dùng Zustand store cho role (không tồn tại file `src/store/authStore.ts` trong repo thật, khác với ghi nhận cũ trong Brain — Brain có drift, đã sửa ở đây).

---

### 3.4. Route — thêm vào router

File: `src/app/router.tsx`

Route `settings` hiện tại (đã verify trong repo):

```tsx
{
  path: 'settings',
  element: <Suspense fallback={null}><SettingsPage /></Suspense>,
  children: [
    { index: true, element: <Navigate to="ical" replace /> },
    { path: 'ical', element: <ICalFeedPanel /> },
  ],
},
```

Thêm dòng mới vào `children` array (giữ nguyên import `ICalFeedPanel` ở đầu file, thêm import `RoomManagementPanel` cùng kiểu):

```tsx
{ path: 'rooms', element: <RoomManagementPanel /> },
```

File: `src/app/layouts/MainLayout.tsx`

Menu hiện tại là flat list (không phải dropdown con). Đã verify dòng thật trong repo:

```tsx
{ key: '/settings/ical', icon: <LinkOutlined />, label: 'iCal Feed' },
```

Thêm dòng mới ngay sau, cùng pattern, import thêm icon `HomeOutlined` từ `@ant-design/icons` ở đầu file:

```tsx
{ key: '/settings/rooms', icon: <HomeOutlined />, label: 'Quan ly phong' },
```

Cũng cần thêm vào mapping `selectedKeys` (đoạn map `/settings` → `/settings/ical` ở gần dòng 68) — đây là mapping để highlight đúng menu item cha khi đang ở route con. Xem code thật:

```tsx
['/settings', '/settings/ical'],
```

Giữ nguyên dòng này — không cần sửa vì `/settings/rooms` vẫn match prefix `/settings` qua logic chung của component (không hardcode riêng cho `ical`). Nếu sau khi build thấy menu không highlight đúng khi ở `/settings/rooms`, báo lại để xem kỹ logic match đầy đủ.

---

### 3.5. Export — `src/features/settings/index.ts`

File: `src/features/settings/index.ts` (đã verify nội dung thật):

```typescript
export { ICalFeedPanel } from './components/ICalFeedPanel'
export { default as SettingsPage } from './pages/SettingsPage'
export { RoomManagementPanel } from './components/RoomManagementPanel'
```

Chỉ thêm 1 dòng cuối — giữ nguyên 2 dòng trên.

---

## 4. Checklist cho Claude Code CLI

- [ ] Sửa `useRooms.ts` — thêm `base_price`
- [ ] Tạo `useRoomMutations.ts`
- [ ] Tạo `RoomManagementPanel.tsx`
- [ ] Thêm route `/settings/rooms`
- [ ] Thêm menu entry trong `MainLayout.tsx`
- [ ] Export trong `features/settings/index.ts`
- [ ] `tsc -b` để build-check
- [ ] Test tay trên mobile thật với account Owner: thêm phòng, sửa giá, ẩn/hiện phòng
- [ ] Test tay với account Staff: xác nhận KHÔNG thấy nút thêm/sửa/ẩn, chỉ thấy bảng read-only — và nếu Staff cố gọi update qua console, RLS phải chặn (test bằng DevTools nếu muốn chắc chắn)claude "$(cat spec-settings-rooms.md)"