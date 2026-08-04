import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { reportRun } from '../_shared/heartbeat.ts'

const JOB = 'daily-revenue-summary'

serve(async (req) => {
  const t0 = performance.now()

  // Auth check — cho phép trigger thủ công và cron
  const authHeader = req.headers.get('Authorization')
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    // 401 KHONG goi reportRun - tu choi truy cap, khong phai job that bai.
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabasePublic = createClient(
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

    // ── 0. TOTAL_ROOMS động — đếm phòng active thay vì hardcode ─────────────
    // (audit backlog #5 2026-06-26: hardcode=8 sẽ sai nếu mở rộng số phòng)
    const { count: activeRoomsCount, error: roomsError } = await supabasePublic
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
    if (roomsError) throw new Error('rooms count: ' + roomsError.message)

    const TOTAL_ROOMS = activeRoomsCount ?? 8 // fallback an toàn nếu count null bất thường

    // ── 1. PAYMENTS trong ngày ──────────────────────────────────────────────
    const { data: payments, error: pmError } = await supabasePublic
      .from('payment_history')
      .select('amount, method, group_id')
      .eq('date', targetDate)
    if (pmError) throw new Error('payment_history: ' + pmError.message)

    const totalRevenue = payments?.reduce((sum, p) => sum + (p.amount ?? 0), 0) ?? 0
    const revenueByMethod: Record<string, number> = {}
    for (const p of payments ?? []) {
      revenueByMethod[p.method] = (revenueByMethod[p.method] || 0) + p.amount
    }

    // ── 2. CHECK-INS ngày target ────────────────────────────────────────────
    const { data: checkIns, error: ciError } = await supabasePublic
      .from('bookings')
      .select('id, room_id, grand_total, group_id, status')
      .eq('check_in', targetDate)
      .eq('is_deleted', false)
      .neq('status', 'cancelled')
    if (ciError) throw new Error('bookings check_in: ' + ciError.message)

    // ── 3. STAYOVERS (đang ở): check_in < target < check_out ───────────────
    const { data: stayovers, error: soError } = await supabasePublic
      .from('bookings')
      .select('id, room_id')
      .lt('check_in', targetDate)
      .gt('check_out', targetDate)
      .eq('is_deleted', false)
      .neq('status', 'cancelled')
    if (soError) throw new Error('bookings stayover: ' + soError.message)

    // ── 4. SOURCE breakdown từ groups ───────────────────────────────────────
    const groupIds = [...new Set((checkIns ?? []).map((b) => b.group_id).filter(Boolean))]
    let sourceBreakdown: Record<string, number> = {}

    if (groupIds.length > 0) {
      const { data: groups } = await supabasePublic
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

    const summary = {
      date: targetDate,
      total_revenue: totalRevenue,
      revenue_by_method: revenueByMethod,
      num_transactions: payments?.length ?? 0,
      num_check_ins: checkIns?.length ?? 0,
      num_stayovers: stayovers?.length ?? 0,
      occupied_rooms: occupiedRooms,
      total_rooms: TOTAL_ROOMS,
      occupancy_rate: Math.round((occupiedRooms / TOTAL_ROOMS) * 100),
      check_in_sources: sourceBreakdown,
      generated_at: new Date().toISOString(),
    }

    // ── 6. Ghi brain.daily_log qua RPC ─────────────────────────────────────
    const { error: logError } = await supabasePublic.rpc('upsert_brain_daily_log', {
      p_log_date: targetDate,
      p_category: 'revenue_summary',
      p_content: JSON.stringify(summary),
      p_source: 'edge-function',
    })
    if (logError) throw new Error('insert log: ' + logError.message)

    await reportRun(JOB, 'ok', t0, {
      date: targetDate,
      total_revenue: totalRevenue,
      occupancy_rate: summary.occupancy_rate,
    })

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`${JOB} error:`, msg)
    await reportRun(JOB, 'error', t0, null, msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
})
