import { useState } from 'react'
import { supabase } from '@/api/supabase'
import type { CheckinGuestPayload } from '@/features/checkin/hooks/useCheckIn'
import { groupByRoomAndDate, parseCheckinExcel } from '@/shared/utils/parseCheckinExcel'
import type { ImportGroup, ImportResult } from '@/types/checkin'
import { mapExcelIdTypeToDatabaseFormat } from '@/types/checkin'

function toCheckinGuestPayload(row: ImportGroup['guests'][number]): CheckinGuestPayload {
  return {
    full_name: row.full_name,
    document_type: mapExcelIdTypeToDatabaseFormat(row.id_type), // Mapping từ Excel -> DB format
    document_number: row.id_number,
    nationality: row.nationality,
    date_of_birth: row.date_of_birth || undefined,
    gender: row.gender === 'male' ? 'Nam' : row.gender === 'female' ? 'Nữ' : undefined,
    address_detail: row.address || undefined,
  }
}

export function useCheckinImport() {
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState<ImportGroup[]>([])
  const [results, setResults] = useState<ImportResult[]>([])

  // Bước 1: Parse file + match booking -> hiện preview
  async function loadPreview(file: File): Promise<void> {
    const rows = await parseCheckinExcel(file)
    const groups = groupByRoomAndDate(rows)
    const result: ImportGroup[] = []

    for (const [key, guests] of groups) {
      const [room_number, check_in_date] = key.split('__')

      // Tìm room theo mã phòng trong hệ thống
      const { data: room } = await supabase
        .from('rooms')
        .select('id')
        .eq('id', room_number)
        .single()

      if (!room) {
        result.push({
          room_number,
          check_in_date,
          booking_id: null,
          booking_status: null,
          guests,
          error: `Không tìm thấy phòng ${room_number}`,
        })
        continue
      }

      // Tìm booking cùng phòng + ngày check-in
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, status')
        .eq('room_id', room.id)
        .eq('check_in', check_in_date)
        .in('status', ['booked', 'checked-in'])
        .limit(1)
        .single()

      result.push({
        room_number,
        check_in_date,
        booking_id: booking?.id ?? null,
        booking_status: booking?.status ?? null,
        guests,
        error: !booking
          ? `Không tìm thấy booking phòng ${room_number} ngày ${check_in_date}`
          : undefined,
      })
    }

    setPreview(result)
  }

  // Bước 2: Confirm -> thực hiện import
  async function confirmImport(): Promise<void> {
    setImporting(true)
    const importResults: ImportResult[] = []

    try {
      for (const group of preview) {
        if (!group.booking_id || group.error) {
          importResults.push({
            room_number: group.room_number,
            success: false,
            guests_upserted: 0,
            error: group.error ?? 'Không có booking hợp lệ',
          })
          continue
        }

        try {
          const { error } = await supabase.rpc('checkin_booking_txn', {
            p_booking_id: group.booking_id,
            p_guests: group.guests.map(toCheckinGuestPayload),
          })

          if (error) {
            throw error
          }

          importResults.push({
            room_number: group.room_number,
            success: true,
            guests_upserted: group.guests.length,
          })
        } catch (err: unknown) {
          importResults.push({
            room_number: group.room_number,
            success: false,
            guests_upserted: 0,
            error: err instanceof Error ? err.message : 'Lỗi không xác định',
          })
        }
      }
    } finally {
      setResults(importResults)
      setImporting(false)
    }
  }

  function reset() {
    setPreview([])
    setResults([])
  }

  return { importing, preview, results, loadPreview, confirmImport, reset }
}
