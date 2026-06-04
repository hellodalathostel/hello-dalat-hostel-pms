import "@supabase/functions-js/edge-runtime.d.ts";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;
const TOTAL_ROOMS = 8;

interface BookingRow {
  room_id: string;
  check_in: string;
  check_out: string;
  guests_count: number | null;
  guest_name: string | null;
  groups: { source: string | null } | { source: string | null }[] | null;
  rooms: { name: string | null } | { name: string | null }[] | null;
}

interface PaymentRow {
  amount: number | null;
  method: string | null;
}

function pickRoomName(row: BookingRow): string {
  if (Array.isArray(row.rooms)) {
    return row.rooms[0]?.name ?? row.room_id;
  }
  return row.rooms?.name ?? row.room_id;
}

function pickSource(row: BookingRow): string {
  if (Array.isArray(row.groups)) {
    return row.groups[0]?.source ?? "";
  }
  return row.groups?.source ?? "";
}

function formatBooking(row: BookingRow): string {
  const room = pickRoomName(row);
  const name = row.guest_name ?? "Chua dat ten";
  const guests = row.guests_count ?? 1;
  const source = pickSource(row);
  const sourcePart = source ? ` [${source}]` : "";
  return `  - ${room} - ${name} (${guests} khach)${sourcePart}`;
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
}

async function sendTelegram(message: string) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram sendMessage failed: ${err}`);
  }
}

Deno.serve(async () => {
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

    const bookingSelect = `
      room_id, check_in, check_out, guests_count, guest_name,
      groups ( source ),
      rooms ( name )
    `;

    const [checkIns, checkOuts, staying, payments] = await Promise.all([
      supabase
        .from("bookings")
        .select(bookingSelect)
        .eq("check_in", today)
        .eq("status", "booked")
        .eq("is_deleted", false)
        .order("room_id"),
      supabase
        .from("bookings")
        .select(bookingSelect)
        .eq("check_out", today)
        .eq("status", "checked-in")
        .eq("is_deleted", false)
        .order("room_id"),
      supabase
        .from("bookings")
        .select(bookingSelect)
        .lt("check_in", today)
        .gt("check_out", today)
        .eq("status", "checked-in")
        .eq("is_deleted", false)
        .order("room_id"),
      supabase
        .from("payment_history")
        .select("amount, method")
        .eq("date", yesterday)
        .eq("is_void", false),
    ]);

    if (checkIns.error || checkOuts.error || staying.error || payments.error) {
      const err = checkIns.error ?? checkOuts.error ?? staying.error ?? payments.error;
      return new Response(JSON.stringify({ error: err?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const checkInRows = (checkIns.data ?? []) as BookingRow[];
    const checkOutRows = (checkOuts.data ?? []) as BookingRow[];
    const stayingRows = (staying.data ?? []) as BookingRow[];

    const paymentRows = (payments.data ?? []) as PaymentRow[];
    const totalRevenue = paymentRows.reduce((sum, row) => sum + (row.amount ?? 0), 0);

    const revenueByMethod: Record<string, number> = {};
    for (const row of paymentRows) {
      const method = row.method ?? "other";
      revenueByMethod[method] = (revenueByMethod[method] ?? 0) + (row.amount ?? 0);
    }

    const methodLines = Object.entries(revenueByMethod).map(
      ([method, amount]) => `  - ${method}: ${formatVND(amount)}`,
    );

    const occupiedSet = new Set<string>([
      ...stayingRows.map((row) => row.room_id),
      ...checkInRows.map((row) => row.room_id),
    ]);
    const occupied = occupiedSet.size;
    const occupancyPct = Math.round((occupied / TOTAL_ROOMS) * 100);

    const dateLabel = new Date(`${today}T12:00:00+07:00`).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const yesterdayLabel = new Date(`${yesterday}T12:00:00+07:00`).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
    });

    const lines: string[] = [
      `<b>BAO CAO - ${dateLabel}</b>`,
      "",
      `<b>CHECK-IN hom nay (${checkInRows.length})</b>`,
      ...(checkInRows.length > 0 ? checkInRows.map(formatBooking) : ["  <i>Khong co</i>"]),
      "",
      `<b>CHECK-OUT hom nay (${checkOutRows.length})</b>`,
      ...(checkOutRows.length > 0 ? checkOutRows.map(formatBooking) : ["  <i>Khong co</i>"]),
      "",
      `<b>DANG LUU TRU (${stayingRows.length})</b>`,
      ...(stayingRows.length > 0 ? stayingRows.map(formatBooking) : ["  <i>Khong co</i>"]),
      "",
      `<b>DOANH THU ${yesterdayLabel}</b>`,
      `  - Tong: <b>${formatVND(totalRevenue)}</b>`,
      ...(methodLines.length > 0 ? methodLines : ["  - <i>Chua co giao dich</i>"]),
      "",
      `Cong suat hom nay: ${occupied}/${TOTAL_ROOMS} phong (${occupancyPct}%)`,
    ];

    await sendTelegram(lines.join("\n"));

    return new Response(JSON.stringify({ ok: true, date: today, revenue: totalRevenue }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
