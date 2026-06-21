// supabase/functions/ical-import/index.ts
// Edge Function: parse iCal feed từ Booking.com, dedup, upsert vào ota_calendar_feed
// Trigger: pg_cron mỗi 15 phút HOẶC HTTP POST từ UI "Sync Now"
// Không auto-create booking — chỉ staging + flag conflict

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Room {
  id: string
  name: string
  ota_feed_url: string
  ota_import_hash: string | null
}

interface VEvent {
  uid: string
  dtstart: string   // 'YYYYMMDD' hoặc 'YYYYMMDDTHHMMSSZ'
  dtend: string
  summary: string | null
  otaBookingNum: string | null
}

interface SyncResult {
  room_id: string
  room_name: string
  upserted: number
  conflicts: number
  skipped: boolean    // true nếu hash không đổi
  error: string | null
}

// ─── iCal Parser ─────────────────────────────────────────────────────────────

function parseIcal(raw: string): VEvent[] {
  const events: VEvent[] = []
  // Split theo VEVENT blocks
  const blocks = raw.split('BEGIN:VEVENT')
  blocks.shift() // bỏ phần header trước VEVENT đầu tiên

  for (const block of blocks) {
    const end = block.indexOf('END:VEVENT')
    if (end === -1) continue
    const content = block.substring(0, end)

    // Helper: lấy value của 1 property, handle line folding (RFC 5545)
    const get = (key: string): string | null => {
      // Unfold lines trước (CRLF + SPACE/TAB = continuation)
      const unfolded = content.replace(/\r?\n[ \t]/g, '')
      const regex = new RegExp(`^${key}(?:;[^:]*)?:(.*)$`, 'm')
      const match = unfolded.match(regex)
      return match ? match[1].trim() : null
    }

    const uid = get('UID')
    const dtstart = get('DTSTART')
    const dtend = get('DTEND')

    // UID và ngày là bắt buộc — skip VEVENT thiếu
    if (!uid || !dtstart || !dtend) continue

    // Extract OTA booking number từ SUMMARY (vd: "CLOSED - BDC-1234567890")
    const summary = get('SUMMARY')
    const bookingNumMatch = summary?.match(/BDC-\d+|AGD-\d+/) ?? null

    events.push({
      uid,
      dtstart,
      dtend,
      summary,
      otaBookingNum: bookingNumMatch ? bookingNumMatch[0] : null,
    })
  }

  return events
}

// ─── Date Parser ─────────────────────────────────────────────────────────────

// iCal date: 'YYYYMMDD' → 'YYYY-MM-DD' (date only, không có timezone issue)
function parseIcalDate(val: string): string {
  const d = val.replace(/T.*$/, '') // bỏ time component nếu có
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}

// ─── Hash helper ─────────────────────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://pms.hellodalathostel.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Preflight CORS — browser gửi OPTIONS trước khi POST
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  // Chỉ chấp nhận POST (từ pg_net cron hoặc UI "Sync Now")
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
  }

  // Chặn truy cập không có CRON_SECRET — function này chỉ được gọi từ pg_cron/UI nội bộ
  const CRON_SECRET = Deno.env.get('CRON_SECRET')
  const authHeader = req.headers.get('Authorization')
  const expectedAuth = `Bearer ${CRON_SECRET}`
  if (!CRON_SECRET || authHeader !== expectedAuth) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  // Dùng service_role để bypass RLS — function này chỉ chạy server-side
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // ── 1. Lấy danh sách phòng có OTA feed ──────────────────────────────────
  const { data: rooms, error: roomsError } = await supabase
    .from('rooms')
    .select('id, name, ota_feed_url, ota_import_hash')
    .not('ota_feed_url', 'is', null)
    .eq('is_active', true)

  if (roomsError) {
    return new Response(JSON.stringify({ error: roomsError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }

  if (!rooms || rooms.length === 0) {
    return new Response(JSON.stringify({ message: 'Không có phòng nào có OTA feed', results: [] }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }

  const results: SyncResult[] = []

  // ── 2. Xử lý từng phòng ─────────────────────────────────────────────────
  for (const room of rooms as Room[]) {
    const result: SyncResult = {
      room_id: room.id,
      room_name: room.name,
      upserted: 0,
      conflicts: 0,
      skipped: false,
      error: null,
    }

    try {
      // 2a. Fetch iCal feed với timeout 10s
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)

      let raw: string
      try {
        const resp = await fetch(room.ota_feed_url, { signal: controller.signal })
        clearTimeout(timeout)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        raw = await resp.text()
      } catch (fetchErr) {
        result.error = `Fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`
        results.push(result)
        continue
      }

      // 2b. So sánh hash — skip nếu feed không đổi
      const hash = await sha256(raw)
      if (hash === room.ota_import_hash) {
        result.skipped = true
        results.push(result)
        continue
      }

      // 2c. Parse VEVENT
      const events = parseIcal(raw)

      // 2d. Lấy bookings nội bộ của phòng này để detect conflict
      // Booking nội bộ = external_ical_uid IS NULL (tự tạo trong PMS)
      const { data: internalBookings } = await supabase
        .from('bookings')
        .select('check_in, check_out, external_ical_uid')
        .eq('room_id', room.id)
        .in('status', ['booked', 'checked-in'])  // FIX 2026-06-18: enum booking_status không có 'confirmed', đúng là booked|checked-in|checked-out|cancelled
        .is('external_ical_uid', null)  // chỉ booking nội bộ

      // 2e. Upsert từng VEVENT
      for (const ev of events) {
        const checkIn = parseIcalDate(ev.dtstart)
        const checkOut = parseIcalDate(ev.dtend)

        // Detect conflict: overlap với booking nội bộ
        const hasConflict = (internalBookings ?? []).some(b =>
          b.check_out > checkIn && b.check_in < checkOut
        )

        const status = hasConflict ? 'conflict' : 'pending'
        if (hasConflict) result.conflicts++

        const { error: upsertError } = await supabase
          .from('ota_calendar_feed')
          .upsert({
            room_id: room.id,
            ical_uid: ev.uid,
            ota_source: 'Booking.com',
            check_in: checkIn,
            check_out: checkOut,
            summary: ev.summary,
            status,
            ota_booking_num: ev.otaBookingNum,
            last_synced_at: new Date().toISOString(),
          }, {
            onConflict: 'room_id,ical_uid',  // unique constraint uq_ota_uid
          })

        if (upsertError) {
          // Log lỗi per-VEVENT nhưng tiếp tục — không block cả room
          console.error(`[ical-import] upsert error room=${room.id} uid=${ev.uid}:`, upsertError.message)
        } else {
          result.upserted++
        }
      }

      // 2f. Cập nhật hash + timestamp sau khi xử lý xong
      await supabase
        .from('rooms')
        .update({
          ota_import_hash: hash,
          ota_last_synced_at: new Date().toISOString(),
        })
        .eq('id', room.id)

    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err)
    }

    results.push(result)
  }

  // ── 3. Summary response ──────────────────────────────────────────────────
  const totalConflicts = results.reduce((s, r) => s + r.conflicts, 0)
  const totalUpserted = results.reduce((s, r) => s + r.upserted, 0)
  const totalSkipped = results.filter(r => r.skipped).length
  const errors = results.filter(r => r.error)

  console.log(
    `[ical-import] done — upserted=${totalUpserted} conflicts=${totalConflicts} ` +
    `skipped=${totalSkipped} errors=${errors.length}`
  )

  return new Response(
    JSON.stringify({ totalUpserted, totalConflicts, totalSkipped, errors: errors.length, results }),
    { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
  )
})
