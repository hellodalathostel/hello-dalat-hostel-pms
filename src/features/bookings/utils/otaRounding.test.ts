import { describe, expect, it } from 'vitest'
import { getOtaRoundingDiff } from './otaRounding'

describe('getOtaRoundingDiff', () => {
  it('chia hết → không lệch', () => {
    expect(getOtaRoundingDiff(800_000, 200_000, 4)).toBe(0)
  })

  it('946.890đ / 4 đêm làm tròn 236.723 → lệch 2đ', () => {
    expect(getOtaRoundingDiff(946_890, Math.round(946_890 / 4), 4)).toBe(2)
  })

  it('tổng OTA = 0 → không lệch', () => {
    expect(getOtaRoundingDiff(0, 0, 4)).toBe(0)
  })

  it('số đêm <= 0 → không lệch', () => {
    expect(getOtaRoundingDiff(946_890, 946_890, 0)).toBe(0)
  })
})
