import "@supabase/functions-js/edge-runtime.d.ts";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const ALLOWED_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;
const TOTAL_ROOMS = 8;

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
  };
}

async function sendMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

function parseDate(input: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const match = input.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!match) return null;
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3] ?? new Date().getFullYear().toString();
  const d = parseInt(day), m = parseInt(month), y = parseInt(year);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2020) return null;
  return `${year}-${month}-${day}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("OK", { status: 200 });

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const msg = update.message;
  if (!msg?.text) return new Response("OK", { status: 200 });

  const chatId = msg.chat.id;
  if (chatId.toString() !== ALLOWED_CHAT_ID) {
    await sendMessage(chatId, "⛔ Không có quyền truy cập.");
    return new Response("OK", { status: 200 });
  }

  const text = msg.text.trim();

  if (text === "/start" || text === "/help") {
    await sendMessage(
      chatId,
      `🏨 <b>Hello Dalat Internal Bot</b>\n\nCác lệnh:\n• <code>/availability dd/mm</code> — xem phòng trống\n• <code>/availability dd/mm/yyyy</code> — cụ thể năm\n• <code>/help</code> — hiện menu này`,
    );
    return new Response("OK", { status: 200 });
  }

  if (text.startsWith("/availability")) {
    const parts = text.split(/\s+/);
    const rawDate = parts[1];

    if (!rawDate) {
      await sendMessage(chatId, "❌ Thiếu ngày. Ví dụ: <code>/availability 3/6</code>");
      return new Response("OK", { status: 200 });
    }

    const targetDate = parseDate(rawDate);
    if (!targetDate) {
      await sendMessage(
        chatId,
        `❌ Ngày không hợp lệ: <code>${rawDate}</code>\nDùng định dạng: <code>dd/mm</code> hoặc <code>dd/mm/yyyy</code>`,
      );
      return new Response("OK", { status: 200 });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // OTA query: use check_in/check_out per schema
    const [bookingsRes, otaRes, roomsRes] = await Promise.all([
      supabase
        .from("bookings")
        .select("room_id, rooms ( name )")
        .lte("check_in", targetDate)
        .gt("check_out", targetDate)
        .eq("is_deleted", false)
        .neq("status", "cancelled"),
      supabase
        .from("ota_calendar_feed")
        .select("room_id")
        .lte("check_in", targetDate)   // ← đúng
        .gt("check_out", targetDate)   // ← đúng
        .eq("is_cancelled", false),
      supabase
        .from("rooms")
        .select("id, name")
        .order("name"),
    ]);

    if (bookingsRes.error || otaRes.error || roomsRes.error) {
      await sendMessage(chatId, "❌ Hệ thống đang gặp lỗi truy vấn dữ liệu phòng.");
      return new Response("OK", { status: 200 });
    }

    const occupiedRoomIds = new Set([
      ...(bookingsRes.data ?? []).map((b: { room_id: string }) => b.room_id),
      ...(otaRes.data ?? []).map((o: { room_id: string }) => o.room_id),
    ]);

    const freeRooms = (roomsRes.data ?? []).filter((r: { id: string }) => !occupiedRoomIds.has(r.id));
    const occupiedCount = occupiedRoomIds.size;
    const freeCount = freeRooms.length;

    const displayDate = new Date(targetDate + "T12:00:00+07:00").toLocaleDateString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });

    const lines: string[] = [
      `📅 <b>Phòng trống — ${displayDate}</b>`,
      "",
      `✅ Còn trống: <b>${freeCount}/${TOTAL_ROOMS} phòng</b>`,
      ...(freeRooms.length > 0
        ? freeRooms.map((r: { name: string | null; id: string }) => `  • ${r.name ?? r.id}`)
        : ["  <i>Hết phòng</i>"]),
      ...(occupiedCount > 0 ? ["", `🔒 Đã có booking: ${occupiedCount} phòng`] : []),
    ];

    await sendMessage(chatId, lines.join("\n"));
    return new Response("OK", { status: 200 });
  }

  await sendMessage(chatId, `❓ Lệnh không nhận ra.\nGõ <code>/help</code> để xem danh sách.`);
  return new Response("OK", { status: 200 });
});
