// Danh sách phòng tĩnh — sync từ DB rooms table (is_active = true)
// Cập nhật thủ công khi thêm/bỏ phòng

export const ROOM_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '101', label: '101 – Family' },
  { value: '102', label: '102 – Single' },
  { value: '103', label: '103 – Deluxe Double' },
  { value: '201', label: '201 – Deluxe Queen' },
  { value: '202', label: '202 – Single' },
  { value: '203', label: '203 – Deluxe Double' },
  { value: '301', label: '301 – Standard Double' },
  { value: '302', label: '302 – Standard Double' },
]
