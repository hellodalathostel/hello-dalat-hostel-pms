import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)

type FileType = 'VN' | 'NNN' | 'UNKNOWN'

export interface GuestImportRow {
  roomId: string
  checkInDate: string
  fullName: string
  dateOfBirth: string | null
  gender: string | null
  documentType: 'CCCD' | 'Hộ chiếu' | 'Giấy tờ khác' | null
  documentNumber: string | null
  nationality: string | null
  residencyType: 'Thường trú' | 'Tạm trú' | 'Địa chỉ khác' | null
  province: string | null
  ward: string | null
  addressDetail: string | null
  country: string
  rowIndex: number
  fileType: 'VN' | 'NNN'
}

function parseDate(raw: unknown): string | null {
  if (!raw) return null

  if (typeof raw === 'number') {
    const parsedSerial = XLSX.SSF.parse_date_code(raw)
    if (!parsedSerial) return null

    return dayjs(`${parsedSerial.y}-${parsedSerial.m}-${parsedSerial.d}`).format('YYYY-MM-DD')
  }

  const value = String(raw).trim()
  if (!value) return null

  if (/^\d+$/.test(value)) {
    const parsedSerial = XLSX.SSF.parse_date_code(Number.parseInt(value, 10))
    if (!parsedSerial) return null

    return dayjs(`${parsedSerial.y}-${parsedSerial.m}-${parsedSerial.d}`).format('YYYY-MM-DD')
  }

  const parsed = dayjs(value, ['DD/MM/YYYY', 'D/M/YYYY', 'YYYY-MM-DD'], true)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null
}

function mapDocumentType(raw: string | null): GuestImportRow['documentType'] {
  if (!raw) return null

  const value = raw.trim().toLowerCase()
  if (value.includes('cccd') || value.includes('căn cước')) return 'CCCD'
  if (value.includes('hộ chiếu') || value.includes('passport')) return 'Hộ chiếu'

  return 'Giấy tờ khác'
}

function mapResidencyType(raw: string | null): GuestImportRow['residencyType'] {
  if (!raw) return null

  const value = raw.trim()
  if (value.includes('Thường trú')) return 'Thường trú'
  if (value.includes('Tạm trú')) return 'Tạm trú'

  return 'Địa chỉ khác'
}

function detectFileType(headers: string[]): FileType {
  if (headers.some((header) => header.includes('QT') || header.includes('Hộ chiếu'))) return 'NNN'
  if (headers.some((header) => header.includes('Loại giấy tờ'))) return 'VN'

  return 'UNKNOWN'
}

export function parseCheckinExcel(file: File): Promise<GuestImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array', cellDates: false })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: null,
          raw: true,
        })

        const headerRowIndex = rows.findIndex(
          (row) => Array.isArray(row) && String(row[0] ?? '').trim() === 'STT',
        )

        if (headerRowIndex === -1) {
          reject(new Error('Không tìm thấy header "STT" trong file.'))
          return
        }

        const headers = (rows[headerRowIndex] as unknown[]).map((header) => String(header ?? '').trim())
        const fileType = detectFileType(headers)

        if (fileType === 'UNKNOWN') {
          reject(
            new Error('File không đúng format. Cần có cột "Loại giấy tờ" (VN) hoặc "QT"/"Hộ chiếu" (NNN).'),
          )
          return
        }

        const result: GuestImportRow[] = []
        const dataRows = rows.slice(headerRowIndex + 1)

        dataRows.forEach((row, index) => {
          if (!Array.isArray(row) || !row[1]) {
            return
          }

          const cell = (columnIndex: number) => {
            const value = row[columnIndex]
            return value != null ? String(value).trim() : null
          }

          if (fileType === 'VN') {
            result.push({
              rowIndex: index + 1,
              fileType: 'VN',
              roomId: cell(9) ?? '',
              checkInDate: parseDate(row[6]) ?? '',
              fullName: cell(1) ?? '',
              dateOfBirth: parseDate(row[2]),
              gender: cell(3),
              documentType: mapDocumentType(cell(4)),
              documentNumber: cell(5),
              nationality: null,
              residencyType: mapResidencyType(cell(10)),
              province: null,
              ward: null,
              addressDetail: null,
              country: 'VNM',
            })
            return
          }

          result.push({
            rowIndex: index + 1,
            fileType: 'NNN',
            roomId: cell(9) ?? '',
            checkInDate: parseDate(row[6]) ?? '',
            fullName: cell(1) ?? '',
            dateOfBirth: parseDate(row[2]),
            gender: cell(3),
            documentType: 'Hộ chiếu',
            documentNumber: cell(5),
            nationality: cell(4),
            residencyType: null,
            province: null,
            ward: null,
            addressDetail: null,
            country: cell(4) ?? 'XXX',
          })
        })

        if (result.length === 0) {
          reject(new Error('File không có dữ liệu khách.'))
          return
        }

        resolve(result)
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = () => reject(new Error('Không đọc được file.'))
    reader.readAsArrayBuffer(file)
  })
}