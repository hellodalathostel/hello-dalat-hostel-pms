import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Auth check — cho phép trigger thủ công và cron
  const authHeader = req.headers.get('Authorization')
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Xác định ngày target (mặc định: hôm qua theo ICT)
  // Cho phép override qua query param: ?date=2026-05-09
  const url = new URL(req.url)
  const dateParam = url.searchParams.get('date')

  let targetDate: string
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    targetDate = dateParam
  } else {
    const nowICT = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })
    )
    nowICT.setDate(nowICT.getDate() - 1)
    targetDate = nowICT.toISOString().split('T')[0]
  }

  // ── 1. PAYMENTS trong ngày ──────────────────────────────────────────────
  const { data: payments, error: pmError } = await supabase
    .from('payment_history')
    .select('amount, method, group_id')
    .eq('date', targetDate)

  if (pmError) {
    return new Response(JSON.stringify({ error: 'payment_history: ' + pmError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const totalRevenue = payments?.reduce((sum, p) => sum + (p.amount ?? 0), 0) ?? 0
  const revenueByMethod: Record<string, number> = {}
  for (const p of payments ?? []) {
    revenueByMethod[p.method] = (revenueByMethod[p.method] || 0) + p.amount
  }

  // ── 2. CHECK-INS ngày target ────────────────────────────────────────────
  const { data: checkIns, error: ciError } = await supabase
    .from('bookings')
    .select('id, room_id, grand_total, group_id, status')
    .eq('check_in', targetDate)
    .eq('is_deleted', false)
    .neq('status', 'cancelled')

  if (ciError) {
    return new Response(JSON.stringify({ error: 'bookings check_in: ' + ciError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── 3. STAYOVERS (đang ở): check_in < target < check_out ───────────────
  const { data: stayovers, error: soError } = await supabase
    .from('bookings')
    .select('id, room_id')
    .lt('check_in', targetDate)
    .gt('check_out', targetDate)
    .eq('is_deleted', false)
    .neq('status', 'cancelled')

  if (soError) {
    return new Response(JSON.stringify({ error: 'bookings stayover: ' + soError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── 4. SOURCE breakdown từ groups ───────────────────────────────────────
  const groupIds = [...new Set((checkIns ?? []).map((b) => b.group_id).filter(Boolean))]
  let sourceBreakdown: Record<string, number> = {}

  if (groupIds.length > 0) {
    const { data: groups } = await supabase
      .from('groups')
      .select('id, source')
      .in('id', groupIds)

    for (const g of groups ?? []) {
      const src = g.source ?? 'unknown'
      sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1
    }
  }

  // ── 5. Tổng hợp ─────────────────────────────────────────────────────────
  const occupiedRooms = (checkIns?.length ?? 0) + (stayovers?.length ?? 0)
  const TOTAL_ROOMS = 8

  const summary = {
    date: targetDate,
    total_revenue: totalRevenue,
    revenue_by_method: revenueByMethod,
    num_transactions: payments?.length ?? 0,
    num_check_ins: checkIns?.length ?? 0,
    num_stayovers: stayovers?.length ?? 0,
    occupied_rooms: occupiedRooms,
    occupancy_rate: Math.round((occupiedRooms / TOTAL_ROOMS) * 100),
    check_in_sources: sourceBreakdown,
    generated_at: new Date().toISOString(),
  }

  // ── 6. Ghi brain.daily_log (delete-then-insert để idempotent) ───────────
  const { error: delError } = await supabase
    .schema('brain')
    .from('daily_log')
    .delete()
    .eq('log_date', targetDate)
    .eq('category', 'revenue_summary')

  if (delError) {
    return new Response(JSON.stringify({ error: 'delete old log: ' + delError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { error: logError } = await supabase
    .schema('brain')
    .from('daily_log')
    .insert({
      log_date: targetDate,
      category: 'revenue_summary',
      content: JSON.stringify(summary),
      source: 'edge-function',
    })

  if (logError) {
    return new Response(JSON.stringify({ error: 'insert log: ' + logError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
