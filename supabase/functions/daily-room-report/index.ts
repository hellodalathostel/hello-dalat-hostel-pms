// @ts-nocheck: Edge Function chạy trên Deno runtime, TS server của web app không có Deno libs.
/// <reference lib="deno.ns" />

// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

interface BookingRow {
  room_id: string;
  check_in: string;
  check_out: string;
  guests_count: number;
  guest_name: string | null;
  groups: Array<{ source: string | null }> | null;
  rooms: Array<{ name: string | null }> | null;
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Ngày hôm nay theo múi giờ Việt Nam
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }); // → "2026-05-12"

  const select = `
    room_id,
    check_in,
    check_out,
    guests_count,
    guest_name,
    groups ( source ),
    rooms ( name )
  `;

  // Chạy song song 3 query
  const [checkIns, checkOuts, staying] = await Promise.all([
    // Khách check-in hôm nay (status = 'booked')
    supabase
      .from("bookings")
      .select(select)
      .eq("check_in", today)
      .eq("status", "booked")
      .eq("is_deleted", false)
      .order("room_id"),

    // Khách check-out hôm nay (status = 'checked-in')
    supabase
      .from("bookings")
      .select(select)
      .eq("check_out", today)
      .eq("status", "checked-in")
      .eq("is_deleted", false)
      .order("room_id"),

    // Khách ĐANG LƯU TRÚ (status = 'checked-in')
    supabase
      .from("bookings")
      .select(select)
      .lt("check_in", today)
      .gt("check_out", today)
      .eq("status", "checked-in")
      .eq("is_deleted", false)
      .order("room_id"),
  ]);

  if (checkIns.error || checkOuts.error || staying.error) {
    const err = checkIns.error ?? checkOuts.error ?? staying.error;
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }

  // Format mỗi dòng booking
  const fmt = (b: BookingRow) => {
    const room = b.rooms?.[0]?.name ?? b.room_id;
    const name = b.guest_name ?? "Chưa đặt tên";
    const guests = b.guests_count ?? 1;
    const source = b.groups?.[0]?.source ?? "";
    return `  • ${room} — ${name} (${guests} khách)${source ? ` [${source}]` : ""}`;
  };

  const dateLabel = new Date().toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const lines: string[] = [
    `📋 <b>Báo cáo phòng — ${dateLabel}</b>`,
    "",
    `🟢 <b>CHECK-IN hôm nay (${checkIns.data!.length})</b>`,
    ...(checkIns.data!.length > 0
      ? checkIns.data!.map(fmt)
      : ["  <i>Không có</i>"]),
    "",
    `🔴 <b>CHECK-OUT hôm nay (${checkOuts.data!.length})</b>`,
    ...(checkOuts.data!.length > 0
      ? checkOuts.data!.map(fmt)
      : ["  <i>Không có</i>"]),
    "",
    `🏠 <b>ĐANG LƯU TRÚ (${staying.data!.length})</b>`,
    ...(staying.data!.length > 0
      ? staying.data!.map(fmt)
      : ["  <i>Không có</i>"]),
  ];

  const message = lines.join("\n");

  const tgRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    },
  );

  if (!tgRes.ok) {
    const err = await tgRes.text();
    return new Response(JSON.stringify({ error: err }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, date: today }), {
    headers: { "Content-Type": "application/json" },
  });
});
