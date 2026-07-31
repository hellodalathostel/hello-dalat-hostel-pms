// supabase/functions/ical-import/index.ts
// DEPRECATED 2026-06-22: Đã chuyển sang sync 1 chiều PMS → Booking.com (qua ical-feed).
// Chiều OTA → PMS (function này) đã bị bỏ theo quyết định của Hiếu.
// Cron job 'ical-import-daily' (jobid 21) đã unschedule. Function giữ lại dưới dạng
// stub vô hại để URL cũ không bị lỗi 404 nếu còn ai gọi nhầm — không còn ghi dữ liệu.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://pms.hellodalathostel.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  return new Response(
    JSON.stringify({
      error: 'Gone',
      message:
        'ical-import đã bị deprecated 2026-06-22. PMS chỉ còn sync 1 chiều PMS → Booking.com qua ical-feed. Function này không còn import dữ liệu nào.',
    }),
    {
      status: 410,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    }
  )
})
