// src/features/documents/documentDataFetchers.ts
// Query helpers lấy data từ Supabase để build DocumentData/GroupDocumentData
// cho việc render template document. Tách từ useDocumentGenerator.ts (M4 — file
// splitting, không đổi logic).

import { supabase } from '@/api/supabase';
import type {
  DocumentData,
  GroupBookingRow,
  GroupDocumentData,
} from './documentTemplates';

interface DocPayment {
  id: string;
  amount: number;
  method: string | null;
  date: string;
  note: string | null;
}

export interface DocumentPreviewData extends DocumentData {
  group: {
    guest_name: string | null;
  };
  bookings: Array<Record<string, unknown>>;
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
  card: 'Thẻ',
  momo: 'MoMo',
  zalopay: 'ZaloPay',
  other: 'Khác',
};

// ─── Query helpers ─────────────────────────────────────────────────────────────

/** Query toàn bộ data cần thiết cho 1 booking */
export async function fetchDocumentData(
  bookingId: string,
  groupId: string
): Promise<DocumentPreviewData> {
  // M2 fix: bookings và groups độc lập với nhau (cả 2 chỉ cần tham số đầu vào),
  // chạy song song để giảm 1 round-trip tuần tự. rooms phải đợi vì cần booking.room_id
  // vừa nhận được (không có foreign key tới rooms table để JOIN trực tiếp).
  const [bookingRes, groupRes] = await Promise.all([
    supabase
      .from('bookings')
      .select(`
        id, group_id, room_id, check_in, check_out, nights,
        price_per_night, room_subtotal, surcharge, grand_total, tax_rate, tax_amount,
        has_early_check_in, has_late_check_out,
        guest_name, guests_count, status, note
      `)
      .eq('id', bookingId)
      .single(),
    supabase
      .from('groups')
      .select('id, customer_name, customer_phone, source, ota_booking_number, paid, deposit_method')
      .eq('id', groupId)
      .single(),
  ]);

  const { data: booking, error: bErr } = bookingRes;
  if (bErr || !booking) throw new Error('Không tìm thấy booking: ' + bErr?.message);

  const { data: group, error: gErr } = groupRes;
  if (gErr || !group) throw new Error('Không tìm thấy group: ' + gErr?.message);

  // Room info + services/discounts/payments — tất cả độc lập với nhau,
  // chỉ phụ thuộc booking.room_id/bookingId/groupId đã có sẵn → chạy song song.
  const [roomRes, servicesRes, discountsRes, paymentsRes] = await Promise.all([
    supabase
      .from('rooms')
      .select('id, name, type')
      .eq('id', booking.room_id)
      .single(),
    supabase
      .from('booking_services')
      .select('name, price, qty')
      .eq('booking_id', bookingId),
    supabase
      .from('booking_discounts')
      .select('description, amount')
      .eq('booking_id', bookingId),
    supabase
      .from('payment_history')
      .select('id, amount, method, date, note')
      .eq('group_id', groupId)
      .order('date', { ascending: true }),
  ]);

  const { data: room, error: rErr } = roomRes;
  if (rErr || !room) throw new Error('Không tìm thấy phòng: ' + rErr?.message);

  if (servicesRes.error) throw servicesRes.error;
  if (discountsRes.error) throw discountsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  const services = servicesRes.data ?? [];
  const discounts = discountsRes.data ?? [];
  const payments = (paymentsRes.data ?? []) as DocPayment[];

  return {
    bookingId: booking.id,
    groupId: group.id,
    roomName: room.name,
    roomType: room.type,
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    nights: booking.nights,
    guestsCount: booking.guests_count,
    hasEarlyCheckIn: booking.has_early_check_in ?? false,
    hasLateCheckOut: booking.has_late_check_out ?? false,
    guestName: group.customer_name ?? booking.guest_name,
    guestPhone: group.customer_phone ?? '',
    source: group.source,
    otaBookingNumber: group.ota_booking_number ?? undefined,
    pricePerNight: booking.price_per_night,
    roomSubtotal: booking.room_subtotal ?? 0,
    surcharge: booking.surcharge ?? 0,
    grandTotal: booking.grand_total,
    services: (services ?? []).map(s => ({
      name: s.name,
      price: s.price,
      qty: Number(s.qty),
    })),
    discounts: discounts.map(d => ({
      description: d.description,
      amount: d.amount,
    })),
    paid: group.paid ?? 0,
    payments: payments.map(p => {
      const methodKey = (p.method ?? 'other').toLowerCase();
      const normalizedMethod = PAYMENT_METHOD_LABEL[methodKey] ? methodKey : 'other';
      return {
        id: p.id,
        amount: p.amount,
        method: normalizedMethod,
        date: p.date,
        note: p.note,
      };
    }),
    generatedAt: new Date().toISOString(),
    group: {
      guest_name: group.customer_name ?? booking.guest_name ?? null,
    },
    bookings: [
      {
        room_id: booking.room_id,
      },
    ],
  };
}



// ─── fetchGroupDocumentData ──────────────────────────────────────────────────
// Query tất cả bookings của group để render group_invoice
// grandTotal = SUM(booking.grand_total) — đọc từ DB, không tính frontend
export async function fetchGroupDocumentData(
  groupId: string
): Promise<GroupDocumentData> {
  // 1. Lấy thông tin group
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, customer_name, customer_phone, source, ota_booking_number, paid')
    .eq('id', groupId)
    .single();

  if (groupError || !group) {
    throw new Error(`Không tìm thấy group: ${groupError?.message ?? 'unknown'}`);
  }

  // 2. Lấy tất cả bookings thuộc group (chỉ active — không lấy cancelled)
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select(`
      id,
      room_id,
      check_in,
      check_out,
      nights,
      price_per_night,
      room_subtotal,
      surcharge,
      grand_total,
      status,
      booking_services (
        name,
        price,
        qty
      ),
      booking_discounts (
        description,
        amount
      ),
      rooms (
        id,
        name,
        type
      )
    `)
    .eq('group_id', groupId)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .neq('status', 'cancelled')
    .order('check_in', { ascending: true });

  if (bookingsError) {
    throw new Error(`Lỗi query bookings: ${bookingsError.message}`);
  }

  if (!bookings || bookings.length === 0) {
    throw new Error('Group không có booking nào hợp lệ.');
  }

  // 3. Map sang GroupBookingRow[]
  const rows: GroupBookingRow[] = bookings.map((b) => {
    const roomArr = b.rooms as unknown as { id: string; name: string; type: string }[] | null;
    const room = Array.isArray(roomArr) ? roomArr[0] ?? null : roomArr;
    return {
      bookingId: b.id,
      roomName: room?.name ?? b.room_id,
      roomType: room?.type ?? '',
      checkIn: b.check_in,
      checkOut: b.check_out,
      nights: b.nights ?? 0,
      pricePerNight: b.price_per_night ?? 0,
      roomSubtotal: b.room_subtotal ?? 0,
      surcharge: b.surcharge ?? 0,
      services: (b.booking_services ?? []).map((s: {
        name: string;
        price: number;
        qty: number;
      }) => ({
        name: s.name,
        price: s.price,
        qty: Number(s.qty),
      })),
      discounts: (b.booking_discounts ?? []).map((d: {
        description: string | null;
        amount: number;
      }) => ({
        description: d.description,
        amount: d.amount,
      })),
      grandTotal: b.grand_total ?? 0,
    };
  });

  // 4. Tính tổng từ DB values — KHÔNG tính frontend
  const totalGrandTotal = rows.reduce((sum, r) => sum + r.grandTotal, 0);
  const totalPaid = group.paid ?? 0;

  // 5. Lấy ngày check-in sớm nhất và check-out muộn nhất của group
  const checkInDates = bookings.map((b) => b.check_in).sort();
  const checkOutDates = bookings.map((b) => b.check_out).sort();

  // Chỉ lấy payments hợp lệ — loại bỏ các khoản đã void
  const { data: payments, error: paymentsError } = await supabase
    .from('payment_history')
    .select('id, amount, method, date, note')
    .eq('group_id', groupId)
    .eq('is_void', false)
    .order('date', { ascending: true });

  if (paymentsError) {
    throw new Error(`Lỗi query payments: ${paymentsError.message}`);
  }

  return {
    groupId: group.id,
    guestName: group.customer_name ?? '',
    guestPhone: group.customer_phone ?? '',
    source: group.source ?? '',
    otaBookingNumber: group.ota_booking_number ?? undefined,
    checkIn: checkInDates[0],
    checkOut: checkOutDates[checkOutDates.length - 1],
    bookings: rows,
    totalGrandTotal,
    totalPaid,
    payments: (payments ?? []).map((p) => {
      const methodKey = (p.method ?? 'other').toLowerCase();
      const normalizedMethod = PAYMENT_METHOD_LABEL[methodKey] ? methodKey : 'other';
      return {
        id: p.id,
        amount: p.amount,
        method: normalizedMethod,
        date: p.date,
        note: p.note,
      };
    }),
    generatedAt: new Date().toISOString(),
  };
}

