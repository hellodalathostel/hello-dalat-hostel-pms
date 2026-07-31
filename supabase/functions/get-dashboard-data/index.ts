// get-dashboard-data — v33 (30/07/2026)
//
// FIX 1 (P0 security): v32 la public endpoint (verify_jwt=false, CORS "*", khong
//   auth layer) dung service_role key -> bat ky ai biet URL deu doc duoc guest_name,
//   grand_total, note, ota_booking_number. v33 bat buoc Authorization: Bearer <user JWT>
//   va validate qua auth.getUser() truoc khi query. Anon key KHONG qua duoc cua nay.
// FIX 2 (date): v32 dung new Date().toISOString() = UTC -> tu 00:00-07:00 ICT tra
//   ngay hom truoc, lam checkin_today/checkout_tomorrow/monthStart sai dung ca sang.
//   v33 tinh ngay theo Asia/Ho_Chi_Minh.
// THEM (additive, khong pha client): block `occupancy` tinh theo query gop chuan —
//   check_in <= today AND check_out > today AND status IN (booked, checked-in),
//   COUNT(DISTINCT room_id). Xem brain.decisions 30/07/2026.
//
// Payload shape giu nguyen so voi v32: fetched_at, today, rooms, bookings, stats,
// checkout_tomorrow, checkin_today. Chi them key moi `occupancy`.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_ORIGINS = [
  "https://hello-dalat-hostel-pms.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ORIGINS = ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : DEFAULT_ORIGINS;

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && ORIGINS.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Credentials"] = "true";
  }
  return h;
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function todayICT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return json({ error: "Missing Authorization header" }, 401, origin);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
      console.warn("Unauthorized request:", authError?.message ?? "no user for token");
      return json({ error: "Unauthorized" }, 401, origin);
    }

    const now = new Date();
    const today = todayICT();
    const tomorrow = shiftDate(today, 1);
    const monthStart = today.slice(0, 7) + "-01";
    const windowStart = shiftDate(today, -7);
    const windowEnd = shiftDate(today, 7);

    const [roomsRes, bookingsRes, statsRes, occRes] = await Promise.all([
      supabase
        .from("rooms")
        .select("id, name, type, capacity, base_price, floor, housekeeping_status")
        .eq("is_active", true)
        .order("id"),

      supabase
        .from("bookings")
        .select(
          "id, guest_name, check_in, check_out, nights, room_subtotal, grand_total, status, room_id, guests_count, note, ota_booking_number",
        )
        .lte("check_in", windowEnd)
        .gte("check_out", windowStart)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .order("check_in"),

      supabase
        .from("bookings")
        .select("grand_total, status")
        .gte("check_in", monthStart)
        .or("is_deleted.is.null,is_deleted.eq.false"),

      supabase
        .from("bookings")
        .select("room_id, check_in, status")
        .lte("check_in", today)
        .gt("check_out", today)
        .in("status", ["booked", "checked-in"])
        .or("is_deleted.is.null,is_deleted.eq.false"),
    ]);

    if (roomsRes.error) throw roomsRes.error;
    if (bookingsRes.error) throw bookingsRes.error;
    if (statsRes.error) throw statsRes.error;
    if (occRes.error) throw occRes.error;

    const statsRows = statsRes.data ?? [];
    const bookings = bookingsRes.data ?? [];
    const rooms = roomsRes.data ?? [];
    const occRows = occRes.data ?? [];

    const stats = {
      total_revenue: statsRows.reduce((s, r) => s + (r.grand_total || 0), 0),
      total_bookings: statsRows.length,
      active_stays: statsRows.filter((r) => r.status === "checked-in").length,
      upcoming: statsRows.filter((r) => r.status === "booked").length,
      completed: statsRows.filter((r) => r.status === "checked-out").length,
    };

    const occupiedRoomIds = [...new Set(occRows.map((b) => b.room_id))];
    const totalRooms = rooms.length;
    const occupancy = {
      occupied_rooms: occupiedRoomIds.length,
      total_rooms: totalRooms,
      percent: totalRooms > 0 ? Math.round((occupiedRoomIds.length / totalRooms) * 100) : 0,
      occupied_room_ids: occupiedRoomIds,
      arrivals_today: occRows.filter((b) => b.check_in === today).length,
      arrivals_pending_checkin: occRows.filter(
        (b) => b.check_in === today && b.status === "booked",
      ).length,
    };

    const payload = {
      fetched_at: now.toISOString(),
      today,
      rooms,
      bookings,
      stats,
      checkout_tomorrow: bookings.filter(
        (b) => b.check_out === tomorrow && b.status === "checked-in",
      ),
      checkin_today: bookings.filter(
        (b) => b.check_in === today && (b.status === "booked" || b.status === "checked-in"),
      ),
      occupancy,
    };

    return json(payload, 200, origin);
  } catch (err) {
    console.error("get-dashboard-data error:", err instanceof Error ? err.stack : String(err));
    return json({ error: "Internal error" }, 500, origin);
  }
});
