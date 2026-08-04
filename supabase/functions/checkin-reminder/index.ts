import "@supabase/functions-js/edge-runtime.d.ts";
import { reportRun } from "../_shared/heartbeat.ts";

const JOB = "checkin-reminder";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

async function sendTelegram(message: string) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    throw new Error(`Telegram sendMessage that bai: ${res.status} ${await res.text()}`);
  }
}

Deno.serve(async (_req) => {
  const t0 = performance.now();

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date().toISOString().split("T")[0];

    const { data: checkIns, error: errIn } = await supabase
      .from("bookings")
      .select("guest_name, room_id, guests_count")
      .eq("check_in", today)
      .in("status", ["booked", "checked-in"])
      .eq("is_deleted", false)
      .order("room_id");
    if (errIn) throw new Error(`Query check-in that bai: ${errIn.message}`);

    const { data: checkOuts, error: errOut } = await supabase
      .from("bookings")
      .select("guest_name, room_id")
      .eq("check_out", today)
      .in("status", ["checked-in"])
      .eq("is_deleted", false)
      .order("room_id");
    if (errOut) throw new Error(`Query check-out that bai: ${errOut.message}`);

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

    await reportRun(JOB, "ok", t0, {
      checkin_count: checkIns?.length ?? 0,
      checkout_count: checkOuts?.length ?? 0,
    });

    return new Response("OK", { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${JOB} error:`, msg);
    await reportRun(JOB, "error", t0, null, msg);
    return new Response(msg, { status: 500 });
  }
});
