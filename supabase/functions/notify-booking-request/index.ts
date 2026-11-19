import { createClient } from "jsr:@supabase/supabase-js@2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PMS_URL = "https://hello-dalat-hostel-pms.vercel.app";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function fmtVnd(n: number): string {
  return `${n.toLocaleString("vi-VN")}đ`;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const d1 = new Date(`${checkIn}T00:00:00Z`);
  const d2 = new Date(`${checkOut}T00:00:00Z`);
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

// So sanh secret khong som thoat som (tranh timing leak ve ly thuyet)
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

// Tra ve true neu Telegram nhan tin. Khong throw.
async function sendTelegram(text: string): Promise<boolean> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId) {
    console.error("[notify-booking-request] thieu TELEGRAM_BOT_TOKEN hoac TELEGRAM_CHAT_ID");
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      // Ngan hon timeout 5s cua pg_net trong trigger, chua cho boot + cac query DB,
      // de pg_net nhan duoc 502 thay vi tu timeout.
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.error(`[notify-booking-request] sendMessage that bai: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    console.error(`[notify-booking-request] fetch loi: ${raw.replaceAll(token, "***")}`);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Xac thuc: fail-closed neu thieu env
  const expected = Deno.env.get("BOOKING_NOTIFY_SECRET");
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!expected || !safeEqual(provided, expected)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let requestId: string | undefined;
  try {
    const body = await req.json();
    requestId = body?.request_id;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!requestId || !UUID_RE.test(requestId)) {
    return json({ error: "request_id khong hop le" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: reqRow, error: reqErr } = await supabase
    .from("booking_requests")
    .select("id, name, phone, email, room_id, check_in, check_out, note, status")
    .eq("id", requestId)
    .maybeSingle();

  if (reqErr) {
    console.error("[notify-booking-request] doc booking_requests loi:", reqErr.message);
    return json({ error: "DB error" }, 500);
  }
  if (!reqRow) return json({ error: "Not found" }, 404);
  if (reqRow.status !== "pending") return json({ ok: true, skipped: "not pending" });

  const { data: room } = await supabase
    .from("rooms")
    .select("id, name")
    .eq("id", reqRow.room_id)
    .maybeSingle();

  // Canh bao trung phong (soft): cung pham vi voi check_room_availability (luc xac nhan)
  // = booking chua huy (ke ca checked-out) + room_blocks; loc is_deleted o CA bookings va groups.
  // Quan he bookings.group_id -> groups.id (bookings_group_id_fkey) da xac minh.
  // Neu query loi -> bao "khong kiem tra duoc" thay vi im lang.
  let conflictLine: string | null = null;
  const [{ data: conflicts, error: confErr }, { data: blocks, error: blockErr }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, groups!inner(is_deleted)")
      .eq("room_id", reqRow.room_id)
      .neq("status", "cancelled")
      .eq("is_deleted", false)
      .eq("groups.is_deleted", false)
      .lt("check_in", reqRow.check_out)
      .gt("check_out", reqRow.check_in)
      .limit(1),
    supabase
      .from("room_blocks")
      .select("id")
      .eq("room_id", reqRow.room_id)
      .lt("start_date", reqRow.check_out)
      .gt("end_date", reqRow.check_in)
      .limit(1),
  ]);
  if (confErr || blockErr) {
    console.error("[notify-booking-request] check conflict loi:", (confErr ?? blockErr)!.message);
    conflictLine = "⚠️ Không kiểm tra được trùng phòng, hãy xem lịch phòng trước khi xác nhận";
  } else if ((conflicts?.length ?? 0) > 0) {
    conflictLine = "⚠️ Phòng này đã có booking trùng ngày, kiểm tra trước khi xác nhận";
  } else if ((blocks?.length ?? 0) > 0) {
    conflictLine = "⚠️ Phòng này đang bị khoá (room block) trùng ngày, kiểm tra trước khi xác nhận";
  }

  // Coc goi y = gia dem dau (get_suggested_price tra INTEGER)
  const { data: price, error: priceErr } = await supabase.rpc("get_suggested_price", {
    p_room_id: reqRow.room_id,
    p_date: reqRow.check_in,
  });
  const deposit = (!priceErr && typeof price === "number" && price > 0) ? price : 0;

  const nights = nightsBetween(reqRow.check_in, reqRow.check_out);
  const roomLabel = room
    ? `${escapeHtml(room.id)} (${escapeHtml(room.name)})`
    : escapeHtml(reqRow.room_id);

  const lines = [
    "🔔 <b>Yêu cầu đặt phòng mới</b> (landing page)",
    "",
    `Khách: ${escapeHtml(reqRow.name)}`,
    `SĐT: ${escapeHtml(reqRow.phone)}`,
  ];
  if (reqRow.email) lines.push(`Email: ${escapeHtml(reqRow.email)}`);
  lines.push(
    `Phòng: ${roomLabel}`,
    `Ngày: ${fmtDate(reqRow.check_in)} → ${fmtDate(reqRow.check_out)} (${nights} đêm)`,
    `Cọc gợi ý: ${deposit > 0 ? fmtVnd(deposit) : "chưa có giá"}`,
  );
  if (conflictLine) lines.push("", conflictLine);
  if (reqRow.note) lines.push("", `Ghi chú: ${escapeHtml(reqRow.note)}`);
  lines.push("", `Mở PMS để xác nhận hoặc từ chối: ${PMS_URL}`);

  const sent = await sendTelegram(lines.join("\n"));
  // 502 de net._http_response cho thay that bai (trigger khong retry)
  return sent ? json({ ok: true }) : json({ error: "Telegram send failed" }, 502);
});
