## Task: Update telegram-webhook to v30



### Step 1 : Replace Edge Function

Replace entire file at:

  supabase/functions/telegram-webhook/index.ts

With the new v30 code 

// FILE: supabase/functions/telegram-webhook/index.ts

// Deploy: supabase functions deploy telegram-webhook --no-verify-jwt

// v30 — thêm /rooms, /clean, /cleaned, /issue. /stay /checkin /checkout đã có v29, giữ nguyên.



import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";



// ─── Config ────────────────────────────────────────────────────────────────

const TELEGRAM_TOKEN   = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

const ALLOWED_CHAT_ID  = Deno.env.get("ALLOWED_CHAT_ID")!;

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;

const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;



const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);



// ─── Helpers ────────────────────────────────────────────────────────────────

function todayVN(): string {

  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

}



function formatDateVN(dateStr: string): string {

  const d = new Date(dateStr + "T00:00:00+07:00");

  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

}



function formatVND(amount: number): string {

  return new Intl.NumberFormat("vi-VN").format(amount) + "đ";

}



// Icon trạng thái housekeeping

function hkIcon(status: string): string {

  const icons: Record<string, string> = {

    clean:        "✅",

    dirty:        "🧹",

    cleaning:     "🔄",

    out_of_order: "🚫",

  };

  return icons[status] ?? "❓";

}



// Icon trạng thái booking

function bookingIcon(status: string): string {

  const icons: Record<string, string> = {

    "checked-in":  "🏠",

    "booked":      "📋",

    "checked-out": "🚪",

    "cancelled":   "❌",

  };

  return icons[status] ?? "–";

}



async function sendMessage(chatId: string, text: string): Promise<void> {

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {

    method: "POST",

    headers: { "Content-Type": "application/json" },

    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),

  });

}



// ─── Command Handlers ────────────────────────────────────────────────────────



/** /today — check-in + check-out hôm nay */

async function handleToday(chatId: string) {

  const today = todayVN();

  const { data, error } = await supabase

    .from("bookings")

    .select("room_id, guest_name, check_in, check_out, status, groups(paid, grand_total)")

    .or(`check_in.eq.${today},check_out.eq.${today}`)

    .neq("status", "cancelled")

    .order("check_in");



  if (error) return sendMessage(chatId, `❌ Lỗi: ${error.message}`);

  if (!data?.length) return sendMessage(chatId, `📅 Hôm nay (${formatDateVN(today)}) không có check-in/out.`);



  const checkins  = data.filter((b) => b.check_in  === today);

  const checkouts = data.filter((b) => b.check_out === today);



  let msg = `📅 <b>Hôm nay ${formatDateVN(today)}</b>\n`;

  if (checkins.length) {

    msg += `\n🟢 <b>Check-in (${checkins.length})</b>\n`;

    for (const b of checkins) {

      const paid = (b.groups as any)?.paid ?? 0;

      const total = (b.groups as any)?.grand_total ?? 0;

      const debt = total - paid;

      msg += `  P${b.room_id} — ${b.guest_name} → out ${formatDateVN(b.check_out)}`;

      if (debt > 0) msg += ` | Còn: ${formatVND(debt)}`;

      msg += "\n";

    }

  }

  if (checkouts.length) {

    msg += `\n🔴 <b>Check-out (${checkouts.length})</b>\n`;

    for (const b of checkouts) {

      const paid = (b.groups as any)?.paid ?? 0;

      const total = (b.groups as any)?.grand_total ?? 0;

      const debt = total - paid;

      msg += `  P${b.room_id} — ${b.guest_name}`;

      if (debt > 0) msg += ` | ⚠️ Còn nợ: ${formatVND(debt)}`;

      msg += "\n";

    }

  }

  return sendMessage(chatId, msg.trim());

}



/** /next — check-in 3 ngày tới */

async function handleNext(chatId: string) {

  const today = todayVN();

  const d3 = new Date(today + "T00:00:00+07:00");

  d3.setDate(d3.getDate() + 3);

  const end = d3.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });



  const { data, error } = await supabase

    .from("bookings")

    .select("room_id, guest_name, check_in, check_out, status")

    .gt("check_in", today)

    .lte("check_in", end)

    .neq("status", "cancelled")

    .order("check_in");



  if (error) return sendMessage(chatId, `❌ Lỗi: ${error.message}`);

  if (!data?.length) return sendMessage(chatId, "📅 Không có check-in trong 3 ngày tới.");



  let msg = "📅 <b>Check-in sắp tới (3 ngày)</b>\n\n";

  for (const b of data) {

    msg += `${formatDateVN(b.check_in)} — P${b.room_id} — ${b.guest_name} → ${formatDateVN(b.check_out)}\n`;

  }

  return sendMessage(chatId, msg.trim());

}



/** /a — tất cả booking active */

async function handleAll(chatId: string) {

  const { data, error } = await supabase

    .from("bookings")

    .select("room_id, guest_name, check_in, check_out, status")

    .in("status", ["booked", "checked-in"])

    .order("check_in");



  if (error) return sendMessage(chatId, `❌ Lỗi: ${error.message}`);

  if (!data?.length) return sendMessage(chatId, "📋 Không có booking active.");



  let msg = "📋 <b>Tất cả booking active</b>\n\n";

  for (const b of data) {

    msg += `${bookingIcon(b.status)} P${b.room_id} — ${b.guest_name} | ${formatDateVN(b.check_in)} → ${formatDateVN(b.check_out)}\n`;

  }

  return sendMessage(chatId, msg.trim());

}



/** /checkin — check-in hôm nay */

async function handleCheckin(chatId: string) {

  const today = todayVN();

  const { data, error } = await supabase

    .from("bookings")

    .select("room_id, guest_name, check_in, check_out, status, groups(paid, grand_total)")

    .eq("check_in", today)

    .neq("status", "cancelled")

    .order("room_id");



  if (error) return sendMessage(chatId, `❌ Lỗi: ${error.message}`);

  if (!data?.length) return sendMessage(chatId, `🟢 Hôm nay (${formatDateVN(today)}) không có khách check-in.`);



  let msg = `🟢 <b>Check-in hôm nay ${formatDateVN(today)} (${data.length})</b>\n\n`;

  for (const b of data) {

    const paid  = (b.groups as any)?.paid ?? 0;

    const total = (b.groups as any)?.grand_total ?? 0;

    const debt  = total - paid;

    const statusLabel = b.status === "checked-in" ? " ✅ đã check-in" : "";

    msg += `P${b.room_id} — ${b.guest_name} → out ${formatDateVN(b.check_out)}${statusLabel}`;

    if (debt > 0) msg += ` | Còn: ${formatVND(debt)}`;

    msg += "\n";

  }

  return sendMessage(chatId, msg.trim());

}



/** /checkout — check-out hôm nay */

async function handleCheckout(chatId: string) {

  const today = todayVN();

  const { data, error } = await supabase

    .from("bookings")

    .select("room_id, guest_name, check_in, check_out, status, groups(paid, grand_total)")

    .eq("check_out", today)

    .neq("status", "cancelled")

    .order("room_id");



  if (error) return sendMessage(chatId, `❌ Lỗi: ${error.message}`);

  if (!data?.length) return sendMessage(chatId, `🔴 Hôm nay (${formatDateVN(today)}) không có khách check-out.`);



  let msg = `🔴 <b>Check-out hôm nay ${formatDateVN(today)} (${data.length})</b>\n\n`;

  for (const b of data) {

    const paid  = (b.groups as any)?.paid ?? 0;

    const total = (b.groups as any)?.grand_total ?? 0;

    const debt  = total - paid;

    msg += `P${b.room_id} — ${b.guest_name}`;

    if (b.status === "checked-out") msg += " ✅ đã out";

    else if (debt > 0)              msg += ` | ⚠️ Còn nợ: ${formatVND(debt)}`;

    msg += "\n";

  }

  return sendMessage(chatId, msg.trim());

}



/** /stay — khách đang ở (checked-in) */

async function handleStay(chatId: string) {

  const { data, error } = await supabase

    .from("bookings")

    .select("room_id, guest_name, check_in, check_out, groups(paid, grand_total)")

    .eq("status", "checked-in")

    .order("check_out");



  if (error) return sendMessage(chatId, `❌ Lỗi: ${error.message}`);

  if (!data?.length) return sendMessage(chatId, "🏠 Hiện không có khách đang ở.");



  let msg = `🏠 <b>Khách đang ở (${data.length})</b>\n\n`;

  for (const b of data) {

    const paid  = (b.groups as any)?.paid ?? 0;

    const total = (b.groups as any)?.grand_total ?? 0;

    const debt  = total - paid;

    msg += `P${b.room_id} — ${b.guest_name} | out ${formatDateVN(b.check_out)}`;

    if (debt > 0) msg += ` | Còn: ${formatVND(debt)}`;

    msg += "\n";

  }

  return sendMessage(chatId, msg.trim());

}



/** /rooms — tất cả phòng + housekeeping + booking hôm nay */

async function handleRooms(chatId: string) {

  const today = todayVN();



  // Query tất cả phòng

  const { data: rooms, error: roomErr } = await supabase

    .from("rooms")

    .select("id, name, housekeeping_status, housekeeping_note")

    .eq("is_active", true)

    .order("id");



  if (roomErr) return sendMessage(chatId, `❌ Lỗi: ${roomErr.message}`);



  // Query booking active hôm nay (checked-in hoặc check-in hôm nay)

  const { data: bookings } = await supabase

    .from("bookings")

    .select("room_id, guest_name, status, check_out")

    .in("status", ["checked-in", "booked"])

    .lte("check_in", today)

    .gt("check_out", today)

    .neq("status", "cancelled");



  // Map room_id → booking

  const bookingMap: Record<string, { guest_name: string; status: string; check_out: string }> = {};

  for (const b of bookings ?? []) {

    bookingMap[b.room_id] = b;

  }



  let msg = `🏨 <b>Tình trạng phòng</b>\n\n`;

  for (const r of rooms ?? []) {

    const hk = r.housekeeping_status ?? "clean";

    const b  = bookingMap[r.id];

    msg += `${hkIcon(hk)} <b>P${r.id}</b>`;

    if (b) {

      msg += ` — ${bookingIcon(b.status)} ${b.guest_name} (out ${formatDateVN(b.check_out)})`;

    } else {

      msg += " — Trống";

    }

    if (r.housekeeping_note) msg += `\n   📝 ${r.housekeeping_note}`;

    msg += "\n";

  }

  msg += `\n✅ clean  🧹 dirty  🔄 cleaning  🚫 OOO`;

  return sendMessage(chatId, msg.trim());

}



/** /clean — phòng cần dọn (dirty hoặc vừa check-out hôm nay) */

async function handleClean(chatId: string) {

  const today = todayVN();



  // Phòng dirty/cleaning

  const { data: dirtyRooms, error: e1 } = await supabase

    .from("rooms")

    .select("id, housekeeping_status, housekeeping_note")

    .in("housekeeping_status", ["dirty", "cleaning"])

    .eq("is_active", true)

    .order("id");



  if (e1) return sendMessage(chatId, `❌ Lỗi: ${e1.message}`);



  // Booking check-out hôm nay (phòng sẽ cần dọn)

  const { data: checkouts } = await supabase

    .from("bookings")

    .select("room_id, guest_name, status")

    .eq("check_out", today)

    .neq("status", "cancelled");



  const checkoutRoomIds = new Set((checkouts ?? []).map((b) => b.room_id));

  const dirtyIds = new Set((dirtyRooms ?? []).map((r) => r.id));



  // Gộp: dirty rooms + checkout rooms chưa dirty

  const checkoutOnlyIds = [...checkoutRoomIds].filter((id) => !dirtyIds.has(id));



  if (!dirtyRooms?.length && !checkoutOnlyIds.length) {

    return sendMessage(chatId, "✅ Không có phòng nào cần dọn!");

  }



  let msg = "🧹 <b>Phòng cần dọn</b>\n\n";



  if (dirtyRooms?.length) {

    for (const r of dirtyRooms) {

      const status = r.housekeeping_status === "cleaning" ? "🔄 Đang dọn" : "🧹 Cần dọn";

      msg += `${status}: <b>P${r.id}</b>`;

      if (r.housekeeping_note) msg += ` — ${r.housekeeping_note}`;

      msg += "\n";

    }

  }



  if (checkoutOnlyIds.length) {

    msg += "\n🚪 <b>Check-out hôm nay (chưa cập nhật)</b>\n";

    for (const id of checkoutOnlyIds) {

      msg += `  P${id}\n`;

    }

  }



  msg += `\n💡 Dọn xong: /cleaned [phòng] (vd /cleaned 101)`;

  return sendMessage(chatId, msg.trim());

}



/** /cleaned <room_id> — đánh dấu phòng đã dọn xong */

async function handleCleaned(chatId: string, roomId: string) {

  if (!roomId) {

    return sendMessage(chatId, "❌ Thiếu số phòng. Dùng: /cleaned 101");

  }



  // Gọi RPC update_housekeeping_status

  const { error } = await supabase.rpc("update_housekeeping_status", {

    p_room_id: roomId,

    p_status:  "clean",

  });



  if (error) return sendMessage(chatId, `❌ Lỗi: ${error.message}`);

  return sendMessage(chatId, `✅ Phòng ${roomId} đã dọn xong — trạng thái: CLEAN`);

}



/** /issue <room_id> <mô tả> — log sự cố phòng */

async function handleIssue(chatId: string, args: string[]) {

  if (args.length < 2) {

    return sendMessage(chatId, "❌ Thiếu thông tin. Dùng: /issue 101 Máy lạnh không lạnh");

  }



  const roomId     = args[0];

  const description = args.slice(1).join(" ");



  // Kiểm tra phòng tồn tại

  const { data: room } = await supabase

    .from("rooms")

    .select("id")

    .eq("id", roomId)

    .single();



  if (!room) {

    return sendMessage(chatId, `❌ Phòng ${roomId} không tồn tại.`);

  }



  // Insert sự cố

  const { error } = await supabase

    .from("room_issues")

    .insert({

      room_id:     roomId,

      reported_by: "staff_telegram",

      description,

      status:      "open",

    });



  if (error) return sendMessage(chatId, `❌ Lỗi: ${error.message}`);



  // Cập nhật housekeeping_note để Hiếu thấy trong /rooms

  await supabase

    .from("rooms")

    .update({ housekeeping_note: `⚠️ ${description}` })

    .eq("id", roomId);



  return sendMessage(

    chatId,

    `⚠️ Đã ghi sự cố <b>P${roomId}</b>:\n"${description}"\n\nHiếu sẽ xử lý sớm.`

  );

}



// ─── Task Commands (giữ nguyên từ v29) ─────────────────────────────────────



interface NotionTask { id: string; properties: Record<string, unknown> }



async function getNotionTasks(chatId: string): Promise<NotionTask[]> {

  const NOTION_TOKEN   = Deno.env.get("NOTION_TOKEN")!;

  const NOTION_DB_ID   = Deno.env.get("NOTION_TASK_DB_ID")!;

  const today          = todayVN();



  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {

    method: "POST",

    headers: {

      Authorization:        `Bearer ${NOTION_TOKEN}`,

      "Notion-Version":     "2022-06-28",

      "Content-Type":       "application/json",

    },

    body: JSON.stringify({

      filter: {

        and: [

          { property: "Date", date: { equals: today } },

          { property: "Status", status: { does_not_equal: "Done" } },

        ],

      },

      sorts: [{ property: "Date", direction: "ascending" }],

    }),

  });

  const json = await res.json();

  return json.results ?? [];

}



async function updateNotionTaskStatus(pageId: string, newStatus: string): Promise<boolean> {

  const NOTION_TOKEN = Deno.env.get("NOTION_TOKEN")!;

  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {

    method:  "PATCH",

    headers: {

      Authorization:    `Bearer ${NOTION_TOKEN}`,

      "Notion-Version": "2022-06-28",

      "Content-Type":   "application/json",

    },

    body: JSON.stringify({ properties: { Status: { status: { name: newStatus } } } }),

  });

  return res.ok;

}



async function saveSession(chatId: string, tasks: NotionTask[]): Promise<void> {

  const sessionData = tasks.map((t, i) => ({

    idx:    i + 1,

    pageId: t.id,

    name:   (t.properties?.["Task Name"] as any)?.title?.[0]?.plain_text ?? `Task ${i + 1}`,

  }));

  await supabase.from("telegram_task_sessions").upsert(

    { chat_id: chatId, session_data: sessionData, updated_at: new Date().toISOString() },

    { onConflict: "chat_id" }

  );

}



async function loadSession(chatId: string): Promise<{ idx: number; pageId: string; name: string }[]> {

  const { data } = await supabase

    .from("telegram_task_sessions")

    .select("session_data")

    .eq("chat_id", chatId)

    .single();

  return (data?.session_data as { idx: number; pageId: string; name: string }[]) ?? [];

}



async function handleTask(chatId: string) {

  const tasks = await getNotionTasks(chatId);

  if (!tasks.length) {

    await supabase.from("telegram_task_sessions").delete().eq("chat_id", chatId);

    return sendMessage(chatId, "✅ Không còn task nào hôm nay!");

  }

  await saveSession(chatId, tasks);

  const today = todayVN();

  let msg = `📋 <b>Tasks hôm nay ${formatDateVN(today)}</b>\n\n`;

  for (let i = 0; i < tasks.length; i++) {

    const name = (tasks[i].properties?.["Task Name"] as any)?.title?.[0]?.plain_text ?? `Task ${i + 1}`;

    const room = (tasks[i].properties?.["Room"] as any)?.select?.name ?? "";

    msg += `${i + 1}. ${name}${room ? ` (${room})` : ""}\n`;

  }

  msg += `\n✅ /done N  ⏭ /skip N  📅 /extend N`;

  return sendMessage(chatId, msg.trim());

}



async function handleTasks(chatId: string) {

  return handleTask(chatId);

}



async function handleDone(chatId: string, idxStr: string) {

  const idx = parseInt(idxStr);

  if (isNaN(idx)) return sendMessage(chatId, "❌ Dùng: /done 1");

  const session = await loadSession(chatId);

  const item = session.find((s) => s.idx === idx);

  if (!item) return sendMessage(chatId, `❌ Không tìm thấy task ${idx}. Chạy /tasks để xem danh sách.`);

  const ok = await updateNotionTaskStatus(item.pageId, "Done");

  if (!ok) return sendMessage(chatId, `❌ Lỗi khi cập nhật task ${idx}.`);

  return sendMessage(chatId, `✅ Xong: ${item.name}`);

}



async function handleSkip(chatId: string, idxStr: string) {

  const idx = parseInt(idxStr);

  if (isNaN(idx)) return sendMessage(chatId, "❌ Dùng: /skip 1");

  const session = await loadSession(chatId);

  const item = session.find((s) => s.idx === idx);

  if (!item) return sendMessage(chatId, `❌ Không tìm thấy task ${idx}.`);

  const ok = await updateNotionTaskStatus(item.pageId, "Cancelled");

  if (!ok) return sendMessage(chatId, `❌ Lỗi khi skip task ${idx}.`);

  return sendMessage(chatId, `⏭ Đã bỏ qua: ${item.name}`);

}



async function handleExtend(chatId: string, idxStr: string) {

  const idx = parseInt(idxStr);

  if (isNaN(idx)) return sendMessage(chatId, "❌ Dùng: /extend 1");

  const session = await loadSession(chatId);

  const item = session.find((s) => s.idx === idx);

  if (!item) return sendMessage(chatId, `❌ Không tìm thấy task ${idx}.`);



  // Dời sang ngày mai

  const NOTION_TOKEN = Deno.env.get("NOTION_TOKEN")!;

  const tomorrow = new Date();

  tomorrow.setDate(tomorrow.getDate() + 1);

  const tomorrowStr = tomorrow.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });



  const res = await fetch(`https://api.notion.com/v1/pages/${item.pageId}`, {

    method:  "PATCH",

    headers: {

      Authorization:    `Bearer ${NOTION_TOKEN}`,

      "Notion-Version": "2022-06-28",

      "Content-Type":   "application/json",

    },

    body: JSON.stringify({ properties: { Date: { date: { start: tomorrowStr } } } }),

  });

  if (!res.ok) return sendMessage(chatId, `❌ Lỗi khi dời task ${idx}.`);

  return sendMessage(chatId, `📅 Dời sang ngày mai: ${item.name}`);

}



/** /revenue — doanh thu tháng */

async function handleRevenue(chatId: string) {

  const now   = new Date();

  const year  = now.getFullYear();

  const month = now.getMonth() + 1;

  const start = `${year}-${String(month).padStart(2, "0")}-01`;

  const end   = new Date(year, month, 0).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });



  const { data, error } = await supabase

    .from("bookings")

    .select("net_revenue, check_out")

    .eq("status", "checked-out")

    .gte("check_out", start)

    .lte("check_out", end);



  if (error) return sendMessage(chatId, `❌ Lỗi: ${error.message}`);

  const total = (data ?? []).reduce((s, b) => s + (b.net_revenue ?? 0), 0);

  return sendMessage(

    chatId,

    `💰 <b>Doanh thu tháng ${month}/${year}</b>\n${formatVND(total)} (${data?.length ?? 0} booking checked-out)`

  );

}



/** /debt — nhóm còn nợ */

async function handleDebt(chatId: string) {

  const { data, error } = await supabase

    .from("groups")

    .select("id, grand_total, paid, bookings(room_id, guest_name, status)")

    .eq("is_deleted", false)

    .filter("paid", "lt", "grand_total")

    .in("bookings.status", ["booked", "checked-in"]);



  if (error) return sendMessage(chatId, `❌ Lỗi: ${error.message}`);

  const groups = (data ?? []).filter((g) => {

    const hasActive = (g.bookings as any[]).some((b) =>

      ["booked", "checked-in"].includes(b.status)

    );

    return hasActive && (g.grand_total ?? 0) > (g.paid ?? 0);

  });



  if (!groups.length) return sendMessage(chatId, "✅ Không có nhóm nào còn nợ.");

  let msg = `⚠️ <b>Nhóm còn nợ (${groups.length})</b>\n\n`;

  for (const g of groups) {

    const debt  = (g.grand_total ?? 0) - (g.paid ?? 0);

    const names = (g.bookings as any[]).map((b) => `P${b.room_id} ${b.guest_name}`).join(", ");

    msg += `${names} — Còn: ${formatVND(debt)}\n`;

  }

  return sendMessage(chatId, msg.trim());

}



/** /help */

async function handleHelp(chatId: string) {

  const msg = `

🤖 <b>Hello Dalat Bot — Lệnh</b>



📅 <b>Lịch</b>

/today — check-in + check-out hôm nay

/next — check-in 3 ngày tới

/a — tất cả booking active

/checkin — check-in hôm nay

/checkout — check-out hôm nay

/stay — khách đang ở



🏨 <b>Phòng</b>

/rooms — tình trạng tất cả phòng

/clean — phòng cần dọn

/cleaned [phòng] — đánh dấu đã dọn (vd /cleaned 101)

/issue [phòng] [mô tả] — báo sự cố (vd /issue 101 Đèn hỏng)



💰 <b>Tài chính</b>

/revenue — doanh thu tháng này

/debt — nhóm còn nợ



📋 <b>Tasks</b>

/task hoặc /tasks — xem tasks hôm nay

/done [N] — đánh dấu xong

/skip [N] — bỏ qua task

/extend [N] — dời sang ngày mai



/help — xem lệnh này

`.trim();

  return sendMessage(chatId, msg);

}



// ─── Router ──────────────────────────────────────────────────────────────────



serve(async (req) => {

  try {

    const body = await req.json();

    const message = body?.message;

    if (!message) return new Response("ok");



    const chatId  = String(message.chat?.id ?? "");

    const text    = (message.text ?? "").trim();



    // Security: chỉ cho phép ALLOWED_CHAT_ID

    if (chatId !== ALLOWED_CHAT_ID) {

      console.warn(`Blocked chat_id: ${chatId}`);

      return new Response("ok");

    }



    // Parse lệnh

    const parts   = text.split(/\s+/);

    const command = parts[0]?.toLowerCase() ?? "";

    const arg1    = parts[1] ?? "";

    const args    = parts.slice(1);



    if      (command === "/today")    await handleToday(chatId);

    else if (command === "/next")     await handleNext(chatId);

    else if (command === "/a")        await handleAll(chatId);

    else if (command === "/checkin")  await handleCheckin(chatId);

    else if (command === "/checkout") await handleCheckout(chatId);

    else if (command === "/stay")     await handleStay(chatId);

    else if (command === "/rooms")    await handleRooms(chatId);

    else if (command === "/clean")    await handleClean(chatId);

    else if (command === "/cleaned")  await handleCleaned(chatId, arg1);

    else if (command === "/issue")    await handleIssue(chatId, args);

    else if (command === "/revenue")  await handleRevenue(chatId);

    else if (command === "/debt")     await handleDebt(chatId);

    else if (command === "/task")     await handleTask(chatId);

    else if (command === "/tasks")    await handleTasks(chatId);

    else if (command === "/done")     await handleDone(chatId, arg1);

    else if (command === "/skip")     await handleSkip(chatId, arg1);

    else if (command === "/extend")   await handleExtend(chatId, arg1);

    else if (command === "/help")     await handleHelp(chatId);



    return new Response("ok");

  } catch (err) {

    console.error("Webhook error:", err);

    return new Response("ok"); // Luôn trả 200 để Telegram không retry

  }

});

### Step 2: Deploy

  supabase functions deploy telegram-webhook --no-verify-jwt



### Verify

After deploy, test in Telegram:

- /rooms → list tất cả phòng

- /clean → phòng cần dọn

- /cleaned 101 → đánh dấu sạch

- /issue 102 Test issue → báo sự cố