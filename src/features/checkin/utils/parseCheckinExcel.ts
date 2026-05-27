import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)

type FileType = 'VN' | 'NNN' | 'UNKNOWN'
type ExcelFormat = 'template' | 'export' | 'unknown'

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

const HEADER_ALIASES = {
  common: {
    stt: ['stt'],
  },
  template: {
    fullName: ['họ và tên (*)', 'họ và tên'],
    dateOfBirth: ['ngày, tháng, năm sinh (*)', 'ngày, tháng, năm sinh', 'ngày sinh'],
    gender: ['giới tính (*)', 'giới tính'],
    documentType: ['loại giấy tờ (*)', 'loại giấy tờ'],
    documentNumber: ['số giấy tờ (*)', 'số giấy tờ'],
    nationality: ['quốc tịch (*)', 'quốc tịch'],
    checkIn: ['thời gian lưu trú (từ ngày) (*)', 'thời gian lưu trú  (từ ngày) (*)', 'thời gian lưu trú (từ ngày)'],
    checkOut: ['thời gian lưu trú (đến ngày)', 'thời gian lưu trú  (đến ngày)', 'thời gian lưu trú  (đến ngày) (*)', 'thời gian lưu trú (đến ngày) (*)'],
    roomNumber: ['tên phòng / khoa (*)', 'tên phòng / khoa', 'số phòng'],
    residencyType: ['loại cư trú', 'loại cư trú (*)'],
    province: ['tỉnh/tp (*)', 'tỉnh/tp'],
    ward: ['phường/xã/ đặc khu (*)', 'phường/xã/đặc khu (*)', 'phường/xã'],
    addressDetail: ['địa chỉ chi tiết (*)', 'địa chỉ chi tiết'],
  },
  export: {
    fullName: ['họ tên', 'họ và tên'],
    dateOfBirth: ['ngày sinh', 'ngày, tháng, năm sinh'],
    gender: ['gt', 'giới tính'],
    nationality: ['qt', 'quốc tịch'],
    passportNumber: ['số hộ chiếu'],
    documentNumber: ['số cmnd/cccd', 'số giấy tờ'],
    documentType: ['loại giấy tờ', 'loại giấy tờ (*)'],
    checkIn: ['ngày đến'],
    checkOut: ['ngày đi dự kiến', 'ngày đi thực tế', 'ngày đi'],
    roomNumber: ['số phòng', 'tên phòng / khoa'],
    residencyType: ['loại cư trú'],
    province: ['tỉnh/tp'],
    ward: ['phường/xã'],
    addressDetail: ['địa chỉ', 'địa chỉ chi tiết'],
  },
} as const

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function hasAnyHeader(headers: string[], aliases: readonly string[]): boolean {
  const normalizedHeaders = headers.map(normalizeHeader)
  const normalizedAliases = aliases.map(normalizeHeader)
  return normalizedHeaders.some((header) => normalizedAliases.includes(header))
}

function findHeaderIndex(headers: string[], aliases: readonly string[]): number {
  const normalizedHeaders = headers.map(normalizeHeader)
  const normalizedAliases = aliases.map(normalizeHeader)
  return normalizedHeaders.findIndex((header) => normalizedAliases.includes(header))
}

function findCellValue(row: unknown[], headers: string[], aliases: readonly string[]): unknown {
  const index = findHeaderIndex(headers, aliases)
  if (index === -1) return null
  return row[index]
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text ? text : null
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

export function detectFormat(headers: string[]): ExcelFormat {
  const isExport =
    hasAnyHeader(headers, HEADER_ALIASES.export.fullName) &&
    hasAnyHeader(headers, HEADER_ALIASES.export.gender) &&
    (hasAnyHeader(headers, HEADER_ALIASES.export.nationality) ||
      hasAnyHeader(headers, HEADER_ALIASES.export.passportNumber))

  if (isExport) return 'export'

  const isTemplate =
    hasAnyHeader(headers, HEADER_ALIASES.template.fullName) &&
    hasAnyHeader(headers, HEADER_ALIASES.template.gender) &&
    hasAnyHeader(headers, HEADER_ALIASES.template.documentType) &&
    hasAnyHeader(headers, HEADER_ALIASES.template.checkIn) &&
    hasAnyHeader(headers, HEADER_ALIASES.template.roomNumber)

  if (isTemplate) return 'template'

  return 'unknown'
}

function toFileType(format: ExcelFormat): FileType {
  if (format === 'export') return 'NNN'
  if (format === 'template') return 'VN'

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

        // Fix: KBTT export file có !ref sai (thiếu data rows) — decode_range + expand
        const range = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1:N10')
        // Scan toàn bộ cell thực tế để tìm row cuối cùng có data
        let maxRow = range.e.r
        Object.keys(worksheet).forEach((key) => {
          if (key.startsWith('!')) return
          const cellRef = XLSX.utils.decode_cell(key)
          if (cellRef.r > maxRow) maxRow = cellRef.r
        })
        if (maxRow > range.e.r) {
          range.e.r = maxRow
          worksheet['!ref'] = XLSX.utils.encode_range(range)
        }

        const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: null,
          raw: true,
        })

        const headerRowIndex = rows.findIndex(
          (row) => Array.isArray(row) && normalizeHeader(row[0]) === 'stt',
        )

        if (headerRowIndex === -1) {
          reject(new Error('Không tìm thấy header "STT" trong file.'))
          return
        }

        const headers = (rows[headerRowIndex] as unknown[]).map((header) => String(header ?? ''))
  console.log('[parseCheckin] headerRowIndex:', headerRowIndex)
  console.log('[parseCheckin] headers:', headers)
        const format = detectFormat(headers)
  console.log('[parseCheckin] format:', format)
        const fileType = toFileType(format)

        if (fileType === 'UNKNOWN') {
          reject(
            new Error('File không đúng format. Cần format export (Họ tên + GT + QT/Số hộ chiếu) hoặc format template nhập liệu.'),
          )
          return
        }

        const result: GuestImportRow[] = []
        const dataRows = rows.slice(headerRowIndex + 1)
  console.log('[parseCheckin] dataRows count:', dataRows.length)

        dataRows.forEach((row, index) => {
          if (!Array.isArray(row)) {
            return
          }

          const sttRaw = toNullableString(findCellValue(row, headers, HEADER_ALIASES.common.stt))
          const stt = Number.parseInt(sttRaw ?? '', 10)
          if (Number.isNaN(stt)) return

          if (format === 'template') {
            const nationality = toNullableString(findCellValue(row, headers, HEADER_ALIASES.template.nationality))
            result.push({
              rowIndex: index + 1,
              fileType: 'VN',
              roomId: toNullableString(findCellValue(row, headers, HEADER_ALIASES.template.roomNumber)) ?? '',
              checkInDate: parseDate(findCellValue(row, headers, HEADER_ALIASES.template.checkIn)) ?? '',
              fullName: toNullableString(findCellValue(row, headers, HEADER_ALIASES.template.fullName)) ?? '',
              dateOfBirth: parseDate(findCellValue(row, headers, HEADER_ALIASES.template.dateOfBirth)),
              gender: toNullableString(findCellValue(row, headers, HEADER_ALIASES.template.gender)),
              documentType: mapDocumentType(toNullableString(findCellValue(row, headers, HEADER_ALIASES.template.documentType))),
              documentNumber: toNullableString(findCellValue(row, headers, HEADER_ALIASES.template.documentNumber)),
              nationality,
              residencyType: mapResidencyType(toNullableString(findCellValue(row, headers, HEADER_ALIASES.template.residencyType))),
              province: toNullableString(findCellValue(row, headers, HEADER_ALIASES.template.province)),
              ward: toNullableString(findCellValue(row, headers, HEADER_ALIASES.template.ward)),
              addressDetail: toNullableString(findCellValue(row, headers, HEADER_ALIASES.template.addressDetail)),
              country: nationality ?? 'VNM',
            })
            return
          }

          const passportNumber = toNullableString(findCellValue(row, headers, HEADER_ALIASES.export.passportNumber))
          const idNumberFallback = toNullableString(findCellValue(row, headers, HEADER_ALIASES.export.documentNumber))
          const documentTypeRaw = toNullableString(findCellValue(row, headers, HEADER_ALIASES.export.documentType))
          const nationality = toNullableString(findCellValue(row, headers, HEADER_ALIASES.export.nationality))

          result.push({
            rowIndex: index + 1,
            fileType: 'NNN',
            roomId: toNullableString(findCellValue(row, headers, HEADER_ALIASES.export.roomNumber)) ?? '',
            checkInDate: parseDate(findCellValue(row, headers, HEADER_ALIASES.export.checkIn)) ?? '',
            fullName: toNullableString(findCellValue(row, headers, HEADER_ALIASES.export.fullName)) ?? '',
            dateOfBirth: parseDate(findCellValue(row, headers, HEADER_ALIASES.export.dateOfBirth)),
            gender: toNullableString(findCellValue(row, headers, HEADER_ALIASES.export.gender)),
            documentType: documentTypeRaw ? mapDocumentType(documentTypeRaw) : passportNumber ? 'Hộ chiếu' : 'Giấy tờ khác',
            documentNumber: passportNumber ?? idNumberFallback,
            nationality,
            residencyType: mapResidencyType(toNullableString(findCellValue(row, headers, HEADER_ALIASES.export.residencyType))),
            province: toNullableString(findCellValue(row, headers, HEADER_ALIASES.export.province)),
            ward: toNullableString(findCellValue(row, headers, HEADER_ALIASES.export.ward)),
            addressDetail: toNullableString(findCellValue(row, headers, HEADER_ALIASES.export.addressDetail)),
            country: nationality ?? 'XXX',
          })
        })

        console.log('[parseCheckin] result count:', result.length)

        if (result.length === 0) {
          resolve([])
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