import { useState } from 'react';
import { supabase } from '@/api/supabase';
import { groupByRoomAndDate, parseCheckinExcel } from '@/shared/utils/parseCheckinExcel';
import type { ImportGroup, ImportResult } from '@/types/checkin';

export function useCheckinImport() {
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<ImportGroup[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);

  // Bước 1: Parse file + match booking -> hiện preview
  async function loadPreview(file: File): Promise<void> {
    const rows = await parseCheckinExcel(file);
    const groups = groupByRoomAndDate(rows);
    const result: ImportGroup[] = [];

    for (const [key, guests] of groups) {
      const [room_number, check_in_date] = key.split('__');

      // Tìm room theo mã phòng trong hệ thống
      const { data: room } = await supabase
        .from('rooms')
        .select('id')
        .eq('id', room_number)
        .single();

      if (!room) {
        result.push({
          room_number,
          check_in_date,
          booking_id: null,
          booking_status: null,
          guests,
          error: `Không tìm thấy phòng ${room_number}`,
        });
        continue;
      }

      // Tìm booking cùng phòng + ngày check-in
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, status')
        .eq('room_id', room.id)
        .eq('check_in', check_in_date)
        .in('status', ['booked', 'checked-in'])
        .limit(1)
        .single();

      result.push({
        room_number,
        check_in_date,
        booking_id: booking?.id ?? null,
        booking_status: booking?.status ?? null,
        guests,
        error: !booking
          ? `Không tìm thấy booking phòng ${room_number} ngày ${check_in_date}`
          : undefined,
      });
    }

    setPreview(result);
  }

  // Bước 2: Confirm -> thực hiện import
  async function confirmImport(): Promise<void> {
    setImporting(true);
    const importResults: ImportResult[] = [];

    try {
      for (const group of preview) {
        if (!group.booking_id || group.error) {
          importResults.push({
            room_number: group.room_number,
            success: false,
            guests_upserted: 0,
            error: group.error ?? 'Không có booking hợp lệ',
          });
          continue;
        }

        try {
          const guestIds: string[] = [];

          for (const row of group.guests) {
            // Upsert guest theo id_number để tránh duplicate
            const { data: guest, error: guestErr } = await supabase
              .from('guests')
              .upsert(
                {
                  full_name: row.full_name,
                  date_of_birth: row.date_of_birth || null,
                  gender: row.gender,
                  nationality: row.nationality,
                  id_type: row.id_type,
                  id_number: row.id_number,
                  phone: row.phone || null,
                  address: row.address || null,
                },
                { onConflict: 'id_number', ignoreDuplicates: false }
              )
              .select('id')
              .single();

            if (guestErr || !guest) {
              throw new Error(`Lỗi upsert guest: ${row.full_name}`);
            }

            guestIds.push(String(guest.id));
          }

          const leadGuestId = guestIds[0];

          // Update booking: lead guest + status checked-in
          const { error: bookingErr } = await supabase
            .from('bookings')
            .update({
              guest_id: leadGuestId,
              status: 'checked-in',
            })
            .eq('id', group.booking_id);

          if (bookingErr) {
            throw new Error('Lỗi update booking');
          }

          const bookingGuestsRows = guestIds.map((gid, idx) => ({
            booking_id: group.booking_id,
            guest_id: gid,
            is_primary: idx === 0,
          }));

          const { error: bgErr } = await supabase
            .from('booking_guests')
            .upsert(bookingGuestsRows, { onConflict: 'booking_id,guest_id' });

          if (bgErr) {
            throw new Error('Lỗi ghi booking_guests');
          }

          importResults.push({
            room_number: group.room_number,
            success: true,
            guests_upserted: guestIds.length,
          });
        } catch (err: unknown) {
          importResults.push({
            room_number: group.room_number,
            success: false,
            guests_upserted: 0,
            error: err instanceof Error ? err.message : 'Lỗi không xác định',
          });
        }
      }
    } finally {
      setResults(importResults);
      setImporting(false);
    }
  }

  function reset() {
    setPreview([]);
    setResults([]);
  }

  return { importing, preview, results, loadPreview, confirmImport, reset };
}
