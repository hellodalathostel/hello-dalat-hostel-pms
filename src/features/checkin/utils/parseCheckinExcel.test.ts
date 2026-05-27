import { readFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { detectFormat, parseCheckinExcel } from './parseCheckinExcel'

const FIXTURE_PATH = new URL('../../../../khai_bao_10052026.xlsx', import.meta.url)

class MockFileReader {
  onload: ((event: { target: { result: ArrayBuffer } | null }) => void) | null = null
  onerror: (() => void) | null = null

  readAsArrayBuffer(file: File) {
    void file.arrayBuffer()
      .then((result) => {
        this.onload?.({ target: { result } })
      })
      .catch(() => {
        this.onerror?.()
      })
  }
}

describe('parseCheckinExcel', () => {
  const fixtureBuffer = readFileSync(FIXTURE_PATH)
  const workbook = XLSX.read(fixtureBuffer, { type: 'buffer' })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: true }) as unknown[][]
  const headerRowIndex = rows.findIndex((row) => Array.isArray(row) && String(row[0] ?? '').trim().toLowerCase() === 'stt')
  const headers = (rows[headerRowIndex] as unknown[]).map((header) => String(header ?? ''))

  beforeEach(() => {
    vi.stubGlobal('FileReader', MockFileReader)
  })

  it('detects export format from the real fixture headers', () => {
    expect(detectFormat(headers)).toBe('export')
  })

  it('parses the real fixture into 2 rows', async () => {
    const file = new File([fixtureBuffer], 'khai_bao_10052026.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const result = await parseCheckinExcel(file)

    expect(result.length).toBe(2)
  })
})
