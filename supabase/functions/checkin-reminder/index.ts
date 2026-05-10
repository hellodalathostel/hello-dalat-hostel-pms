import "@supabase/functions-js/edge-runtime.d.ts";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

async function sendTelegram(message: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: "HTML" }),
  });
}

Deno.serve(async () => {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date().toISOString().split("T")[0];

  const { data: checkIns } = await supabase
    .from("bookings")
    .select("guest_name, room_id, guests_count")
    .eq("check_in", today)
    .in("status", ["booked", "checked-in"])
    .eq("is_deleted", false)
    .order("room_id");

  const { data: checkOuts } = await supabase
    .from("bookings")
    .select("guest_name, room_id")
    .eq("check_out", today)
    .in("status", ["checked-in"])
    .eq("is_deleted", false)
    .order("room_id");

  let msg = `🌅 <b>Hello Dalat — ${today}</b>\n\n`;

  if (checkIns && checkIns.length > 0) {
    msg += `📥 <b>CHECK-IN HÔM NAY (${checkIns.length})</b>\n`;
    for (const b of checkIns) {
      msg += `• Phòng ${b.room_id} — ${b.guest_name} (${b.guests_count} khách)\n`;
    }
    msg += "\n";
  } else {
    msg += "📥 Không có check-in hôm nay\n\n";
  }

  if (checkOuts && checkOuts.length > 0) {
    msg += `📤 <b>CHECK-OUT HÔM NAY (${checkOuts.length})</b>\n`;
    for (const b of checkOuts) {
      msg += `• Phòng ${b.room_id} — ${b.guest_name}\n`;
    }
  } else {
    msg += "📤 Không có check-out hôm nay";
  }

  await sendTelegram(msg);
  return new Response("OK", { status: 200 });
});
