import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Tạo DTSTAMP đúng chuẩn RFC 5545 — suffix Z, không phải ZZ
function toICalDate(dateStr: string): string {
  // dateStr từ DB là 'YYYY-MM-DD' (date type, không có time)
  // Booking.com cần DATE-only format: VALUE=DATE:YYYYMMDD
  return dateStr.replace(/-/g, '')
}

function toICalTimestamp(date: Date): string {
  // Format: YYYYMMDDTHHMMSSZ — chỉ 1 chữ Z (UTC)
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeICalText(text: string): string {
  // RFC 5545: escape dấu phẩy, chấm phẩy, backslash
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

// Fold long lines theo RFC 5545 (max 75 octets per line)
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const chunks: string[] = []
  chunks.push(line.slice(0, 75))
  let i = 75
  while (i < line.length) {
    chunks.push(' ' + line.slice(i, i + 74))
    i += 74
  }
  return chunks.join('\r\n')
}

serve(async (req: Request) => {
  // CORS headers — Booking.com cần GET không có credentials
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  // Parse room_id từ query string
  const url = new URL(req.url)
  const roomId = url.searchParams.get('room_id')

  if (!roomId) {
    return new Response(
      'Missing required parameter: room_id',
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
    )
  }

  // Validate room_id: không rỗng, không có ký tự nguy hiểm (SQL injection phòng thủ thêm)
  if (roomId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(roomId)) {
    return new Response(
      'Invalid room_id format',
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
    )
  }

  // Dùng service role để bypass RLS — feed này public, không cần user auth
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Query room info
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, name')
    .eq('id', roomId)
    .single()

  if (roomError || !room) {
    return new Response(
      'Room not found',
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
    )
  }

  // Query bookings active — chỉ confirmed + checked_in
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, check_in, check_out, status')
    .eq('room_id', roomId)
    .in('status', ['booked', 'checked-in'])
    .order('check_in', { ascending: true })

  if (bookingsError) {
    console.error('Error fetching bookings:', bookingsError)
    return new Response(
      'Internal Server Error',
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
    )
  }

  // Build iCal string theo RFC 5545
  const now = toICalTimestamp(new Date())
  const calName = escapeICalText(`Hello Dalat Hostel - Room ${room.name}`)
  const prodId = '-//Hello Dalat Hostel//PMS v1//VI'

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    foldLine(`PRODID:${prodId}`),
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${calName}`),
    'X-WR-TIMEZONE:Asia/Ho_Chi_Minh',
    'X-WR-CALDESC:Availability calendar for OTA sync',
  ]

  // Mỗi booking = 1 VEVENT
  for (const booking of bookings ?? []) {
    // UID unique per booking
    const uid = `booking-${booking.id}@hellodalathostel`
    const summary = escapeICalText(`BLOCKED - Room ${room.name}`)

    // Dùng DATE format (không có time) cho all-day events
    // Booking.com hiểu check_out date là ngày trả phòng (exclusive end)
    const dtStart = `DTSTART;VALUE=DATE:${toICalDate(booking.check_in)}`
    const dtEnd = `DTEND;VALUE=DATE:${toICalDate(booking.check_out)}`

    lines.push('BEGIN:VEVENT')
    lines.push(foldLine(`UID:${uid}`))
    lines.push(`DTSTAMP:${now}`)  // Timestamp sinh file — phải có Z ở cuối, 1 chữ
    lines.push(dtStart)
    lines.push(dtEnd)
    lines.push(foldLine(`SUMMARY:${summary}`))
    lines.push('TRANSP:OPAQUE')   // Báo cho calendar clients là thời gian này bị block
    lines.push('STATUS:CONFIRMED')
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  // RFC 5545 yêu cầu CRLF line endings
  const icsContent = lines.join('\r\n') + '\r\n'

  return new Response(icsContent, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/calendar; charset=utf-8',
      // Filename gợi ý khi user download thủ công
      'Content-Disposition': `inline; filename="room-${room.id}.ics"`,
      // Cache 15 phút — Booking.com poll ~1 lần/giờ, không cần fresh hơn
      'Cache-Control': 'public, max-age=900',
    },
  })
})