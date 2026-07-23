// ops-task-creator v2 - thay the notion-task-creator. Insert truc tiep vao public.ops_tasks
// Trigger: Supabase DB Webhook INSERT bookings (giu nguyen config webhook cu, doi URL function)
// v2: bo dayBefore() - task don phong nay cung ngay check-in (theo yeu cau Hieu 18/06/2026)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Format ngay hien thi dd/mm/yyyy
function fmt(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

Deno.serve(async (req: Request) => {
  try {
    // Xac thuc webhook secret neu co set (giu nguyen tu function cu)
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
    if (webhookSecret) {
      const incoming = req.headers.get('x-webhook-secret');
      if (incoming !== webhookSecret) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    const payload = await req.json();
    const { type, record } = payload;

    // Chi xu ly INSERT booking moi
    if (type !== 'INSERT') {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'not INSERT' }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (record.status === 'cancelled' || record.is_deleted) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'cancelled or deleted' }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    const roomId = String(record.room_id);
    const guestName: string = record.guest_name ?? 'Khach';
    const checkIn: string = record.check_in;
    const checkOut: string = record.check_out;
    const bookingCode: string = record.code ?? record.id?.slice(0, 8) ?? '?';

    // Lay ten phong tu Supabase
    const { data: roomData } = await supabase
      .from('rooms')
      .select('name')
      .eq('id', roomId)
      .single();
    const roomName: string = roomData?.name ?? `Phong ${roomId}`;

    // v2: don phong cung ngay check-in (truoc day la dayBefore(checkIn) - da bo)
    const ngayDon = checkIn;

    // Insert 2 tasks vao ops_tasks - mot lan insert (batch)
    const { data: inserted, error } = await supabase.from('ops_tasks').insert([
      {
        task_name: `Don phong chuan bi - ${roomName} - ${fmt(checkIn)}`,
        task_date: ngayDon,
        loai: 'Don Phong',
        priority: 'Cao',
        status: 'Can Lam',
        room_id: roomId,
        nguoi_thuc_hien: 'Loi',
        ghi_chu: `Chuan bi don khach ${guestName} check-in ngay ${fmt(checkIn)}. Ma booking: ${bookingCode}.`,
        created_by: 'ops-task-creator',
      },
      {
        task_name: `Check-in - ${roomName} - ${guestName}`,
        task_date: checkIn,
        loai: 'Check-in/out',
        priority: 'Cao',
        status: 'Can Lam',
        room_id: roomId,
        nguoi_thuc_hien: 'Loi',
        ghi_chu: `Check-in ${fmt(checkIn)} -> ${fmt(checkOut)}. Ma booking: ${bookingCode}.`,
        created_by: 'ops-task-creator',
      },
    ]).select('id');

    if (error) throw new Error(`ops_tasks insert error: ${error.message}`);

    console.log(
      `[ops-task-creator] OK - ${bookingCode} / ${roomName} / 2 tasks created`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        booking_code: bookingCode,
        room: roomName,
        task_ids: (inserted ?? []).map((t) => t.id),
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[ops-task-creator] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
