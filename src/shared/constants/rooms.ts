export const ROOM_OPTIONS = [
  { label: 'Phòng 101', value: '101', capacity: 2 },
  { label: 'Phòng 102', value: '102', capacity: 2 },
  { label: 'Phòng 103', value: '103', capacity: 4 },
  { label: 'Phòng 104', value: '104', capacity: 4 },
  { label: 'Phòng 201', value: '201', capacity: 2 },
  { label: 'Phòng 202', value: '202', capacity: 2 },
  { label: 'Phòng 301', value: '301', capacity: 4 },
  { label: 'Phòng 302', value: '302', capacity: 4 },
]

export const ROOM_CAPACITY_BY_ID: Record<string, number> = Object.fromEntries(
  ROOM_OPTIONS.map((room) => [room.value, room.capacity]),
)