import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { parseCheckinExcel, type GuestImportRow } from '../utils/parseCheckinExcel'

type ImportStatus = 'success' | 'no_booking' | 'error'

export interface ImportRowResult extends GuestImportRow {
  status: ImportStatus
  message: string
}

interface CheckinImportGuestPayload {
  full_name: string
  date_of_birth?: string
  gender?: string
  document_type: 'CCCD' | 'Hộ chiếu' | 'Giấy tờ khác'
  document_number: string
  nationality: string
  residency_type?: 'Thường trú' | 'Tạm trú' | 'Địa chỉ khác'
  province?: string
  ward?: string
  address_detail?: string
  country: string
  is_primary: boolean
}

function getGroupKey(row: GuestImportRow): string {
  return `${row.roomId}__${row.checkInDate}`
}

function getRowValidationMessage(row: GuestImportRow): string | null {
  if (!row.fullName) return 'Thiếu họ tên khách.'
  if (!row.roomId) return 'Thiếu số phòng.'
  if (!row.checkInDate) return 'Ngày đến không hợp lệ.'
  if (!row.documentType) return 'Thiếu loại giấy tờ.'
  if (!row.documentNumber) return 'Thiếu số giấy tờ.'

  return null
}

function toGuestPayload(row: GuestImportRow, isPrimary: boolean): CheckinImportGuestPayload {
  return {
    full_name: row.fullName,
    date_of_birth: row.dateOfBirth ?? undefined,
    gender: row.gender ?? undefined,
    document_type: row.documentType ?? 'Giấy tờ khác',
    document_number: row.documentNumber ?? '',
    nationality: row.nationality ?? row.country,
    residency_type: row.residencyType ?? undefined,
    province: row.province ?? undefined,
    ward: row.ward ?? undefined,
    address_detail: row.addressDetail ?? undefined,
    country: row.country,
    is_primary: isPrimary,
  }
}

export function useCheckinImport() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()
  const [parsing, setParsing] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [rows, setRows] = useState<GuestImportRow[]>([])
  const [results, setResults] = useState<ImportRowResult[]>([])

  async function parseFile(file: File): Promise<GuestImportRow[]> {
    setParsing(true)

    try {
      const parsedRows = await parseCheckinExcel(file)
      setRows(parsedRows)
      setResults([])
      return parsedRows
    } catch (error) {
      setRows([])
      setResults([])
      throw error
    } finally {
      setParsing(false)
    }
  }

  async function runImport(sourceRows: GuestImportRow[]): Promise<ImportRowResult[]> {
    setProcessing(true)

    const nextResults: ImportRowResult[] = []
    const validGroups = new Map<string, GuestImportRow[]>()

    try {
      for (const row of sourceRows) {
        const validationMessage = getRowValidationMessage(row)

        if (validationMessage) {
          nextResults.push({
            ...row,
            status: 'error',
            message: validationMessage,
          })
          continue
        }

        const groupKey = getGroupKey(row)
        const currentRows = validGroups.get(groupKey) ?? []
        currentRows.push(row)
        validGroups.set(groupKey, currentRows)
      }

      for (const [groupKey, groupRows] of validGroups.entries()) {
        const [roomId, checkInDate] = groupKey.split('__')
        const { data: booking, error: bookingError } = await supabase
          .from('bookings')
          .select('id, status')
          .eq('room_id', roomId)
          .eq('check_in', checkInDate)
          .in('status', ['booked', 'checked-in'])
          .order('id', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (bookingError) {
          groupRows.forEach((row) => {
            nextResults.push({
              ...row,
              status: 'error',
              message: bookingError.message,
            })
          })
          continue
        }

        if (!booking) {
          groupRows.forEach((row) => {
            nextResults.push({
              ...row,
              status: 'no_booking',
              message: `Không tìm thấy booking phòng ${roomId} ngày ${checkInDate}.`,
            })
          })
          continue
        }

        try {
          const { error } = await supabase.rpc('checkin_booking_txn', {
            p_booking_id: booking.id,
            p_guests: groupRows.map((row, index) => toGuestPayload(row, index === 0)),
          })

          if (error) {
            throw new Error(error.message)
          }

          groupRows.forEach((row) => {
            nextResults.push({
              ...row,
              status: 'success',
              message: '',
            })
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Lỗi không xác định'
          groupRows.forEach((row) => {
            nextResults.push({
              ...row,
              status: 'error',
              message: errorMessage,
            })
          })
        }
      }

      nextResults.sort((leftRow, rightRow) => leftRow.rowIndex - rightRow.rowIndex)
      setResults(nextResults)

      if (nextResults.some((row) => row.status === 'success')) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
          queryClient.invalidateQueries({ queryKey: ['bookings'] }),
          queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
        ])
      }

      return nextResults
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Import thất bại'
      message.error(errorMessage)
      throw error
    } finally {
      setProcessing(false)
    }
  }

  function reset() {
    setRows([])
    setResults([])
  }

  return {
    parsing,
    processing,
    rows,
    results,
    parseFile,
    runImport,
    reset,
  }
}
