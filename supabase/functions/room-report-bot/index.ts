// @ts-nocheck
const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
const TOTAL_ROOMS_FALLBACK = 8;

Deno.serve(async () => {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const yd = new Date();
  yd.setDate(yd.getDate() - 1);
  const yesterday = yd.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

  const sel = "room_id, check_in, check_out, status, guests_count, guest_name, groups ( source ), rooms ( name )";

  // occupied: MOI phong co khach hom nay. Gop 2 nhanh cu (staying + check-in)
  // thanh 1 query. Ban cu tach check_in<today+checked-in va check_in=today+booked
  // -> walk-in check_in=today nhung status da checked-in lot khoi ca 2 nhanh,
  // gay undercount occupancy va an mat khach khoi muc CHECK-IN.
  // Phat hien 30/07/2026 (bao 4/8 trong khi thuc te 6/8). Xem brain.decisions.
  const [occ_, co, pay, roomsRes] = await Promise.all([
    supabase.from("bookings").select(sel).lte("check_in", today).gt("check_out", today).in("status", ["booked", "checked-in"]).eq("is_deleted", false).order("room_id"),
    supabase.from("bookings").select(sel).eq("check_out", today).eq("status", "checked-in").eq("is_deleted", false).order("room_id"),
    supabase.from("payment_history").select("amount, method").eq("date", yesterday).eq("is_void", false),
    supabase.from("rooms").select("id").eq("is_active", true),
  ]);

  if (occ_.error || co.error || pay.error || roomsRes.error) {
    const e = occ_.error ?? co.error ?? pay.error ?? roomsRes.error;
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }

  const occupiedRows = occ_.data ?? [];
  // Arrivals hom nay: con cua occupiedRows, du booked hay da checked-in
  const ci = occupiedRows.filter((b) => b.check_in === today);
  // Dang luu tru = da o tu hom truoc
  const st = occupiedRows.filter((b) => b.check_in < today);

  const fmt = (b) => {
    const room = b.rooms?.name ?? b.room_id;
    const name = b.guest_name ?? "Chua dat ten";
    const guests = b.guests_count ?? 1;
    const src = b.groups?.source ?? "";
    const sp = src ? " [" + src + "]" : "";
    return "  \u2022 " + room + " \u2014 " + name + " (" + guests + " kh\u00e1ch)" + sp;
  };

  const payData = pay.data ?? [];
  const totalRev = payData.reduce((s, p) => s + (p.amount ?? 0), 0);
  const byMethod = {};
  for (const p of payData) byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;

  const fmtVND = (n) => n.toLocaleString("vi-VN") + "\u0111";
  const mLines = Object.entries(byMethod).map(([m, a]) => "  \u2022 " + m + ": " + fmtVND(a));

  const TOTAL_ROOMS = roomsRes.data?.length ?? TOTAL_ROOMS_FALLBACK;
  const occSet = new Set(occupiedRows.map((b) => b.room_id));
  const occ = occSet.size;
  const pct = TOTAL_ROOMS > 0 ? Math.round((occ / TOTAL_ROOMS) * 100) : 0;

  const dLabel = new Date().toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  const ydLabel = new Date(yesterday + "T12:00:00+07:00").toLocaleDateString("vi-VN", {
    day: "2-digit", month: "2-digit",
  });

  const lines = [
    "\ud83d\udccb <b>B\u00e1o c\u00e1o \u2014 " + dLabel + "</b>",
    "",
    "\ud83d\udfe2 <b>CHECK-IN h\u00f4m nay (" + ci.length + ")</b>",
    ...(ci.length > 0 ? ci.map(fmt) : ["  <i>Kh\u00f4ng c\u00f3</i>"]),
    "",
    "\ud83d\udd34 <b>CHECK-OUT h\u00f4m nay (" + (co.data?.length ?? 0) + ")</b>",
    ...((co.data?.length ?? 0) > 0 ? co.data.map(fmt) : ["  <i>Kh\u00f4ng c\u00f3</i>"]),
    "",
    "\ud83c\udfe0 <b>\u0110ANG L\u01afU TR\u00da (" + st.length + ")</b>",
    ...(st.length > 0 ? st.map(fmt) : ["  <i>Kh\u00f4ng c\u00f3</i>"]),
    "",
    "\ud83d\udcb0 <b>DOANH THU " + ydLabel + "</b>",
    "  \u2022 T\u1ed5ng: <b>" + fmtVND(totalRev) + "</b>",
    ...(mLines.length > 0 ? mLines : ["  \u2022 <i>Ch\u01b0a c\u00f3 giao d\u1ecbch</i>"]),
    "",
    "\ud83d\udcca C\u00f4ng su\u1ea5t h\u00f4m nay: " + occ + "/" + TOTAL_ROOMS + " ph\u00f2ng (" + pct + "%)",
  ];

  const tgRes = await fetch(
    "https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text: lines.join("\n"), parse_mode: "HTML" }),
    },
  );

  if (!tgRes.ok) {
    const err = await tgRes.text();
    return new Response(JSON.stringify({ error: err }), { status: 500 });
  }

  return new Response(
    JSON.stringify({ ok: true, date: today, revenue: totalRev, occupancy: pct, check_ins: ci.length, staying: st.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});
