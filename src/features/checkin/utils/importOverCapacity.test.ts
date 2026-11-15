import { describe, expect, it } from 'vitest'
import { computeOverCapacityGroups } from './importOverCapacity'

const capacities = { '101': 4, '102': 1, '103': 2 }

function row(roomId: string, checkInDate = '2026-11-12') {
  return { roomId, checkInDate }
}

describe('computeOverCapacityGroups', () => {
  it('không cảnh báo khi số khách bằng sức chứa', () => {
    expect(computeOverCapacityGroups([row('102')], capacities)).toEqual([])
    expect(computeOverCapacityGroups([row('103'), row('103')], capacities)).toEqual([])
  })

  it('cảnh báo khi số khách vượt sức chứa', () => {
    expect(computeOverCapacityGroups([row('102'), row('102')], capacities)).toEqual([
      { roomId: '102', checkInDate: '2026-11-12', guests: 2, capacity: 1 },
    ])
  })

  it('tách nhóm theo ngày đến', () => {
    const rows = [row('102', '2026-11-12'), row('102', '2026-11-13')]
    expect(computeOverCapacityGroups(rows, capacities)).toEqual([])
  })

  it('bỏ qua phòng không có trong bảng sức chứa', () => {
    expect(computeOverCapacityGroups([row('999'), row('999')], capacities)).toEqual([])
  })

  it('cộng khách đã có sẵn trong booking (import nhiều đợt)', () => {
    const rows = [{ ...row('103'), documentType: 'CCCD' as const, documentNumber: 'C' }]
    const existing = { '103__2026-11-12': ['CCCD|A', 'CCCD|B'] }
    expect(computeOverCapacityGroups(rows, capacities, existing)).toEqual([
      { roomId: '103', checkInDate: '2026-11-12', guests: 3, capacity: 2 },
    ])
  })

  it('không đếm trùng khách import lại đã có trong booking', () => {
    const rows = [
      { ...row('103'), documentType: 'CCCD' as const, documentNumber: 'A' },
      { ...row('103'), documentType: 'CCCD' as const, documentNumber: 'B' },
    ]
    const existing = { '103__2026-11-12': ['CCCD|A', 'CCCD|B'] }
    expect(computeOverCapacityGroups(rows, capacities, existing)).toEqual([])
  })

  it('chỉ trả về nhóm vượt, bỏ nhóm đủ chỗ', () => {
    const rows = [row('101'), row('101'), row('102'), row('102')]
    expect(computeOverCapacityGroups(rows, capacities)).toEqual([
      { roomId: '102', checkInDate: '2026-11-12', guests: 2, capacity: 1 },
    ])
  })
})
