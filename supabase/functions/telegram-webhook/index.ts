// FILE: supabase/functions/telegram-webhook/index.ts
// v75 — item 06: them secret_token check (X-Telegram-Bot-Api-Secret-Token) tren nen v72 (ops_tasks).
// KHOI PHUC tu su co deploy nham ban Notion cu (v74). Ban nay dung ops_tasks + 3 RPC, KHONG Notion.
// Deploy: supabase functions deploy telegram-webhook --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_TOKEN   = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const ALLOWED_CHAT_ID  = Deno.env.get("ALLOWED_CHAT_ID")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET   = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

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

function nightsBetween(from: string, to: string): number {
  const d1 = new Date(from + "T00:00:00+07:00");
  const d2 = new Date(to + "T00:00:00+07:00");
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

function hkIcon(status: string): string {
  const icons: Record<string, string> = { clean: "OK", dirty: "DIRTY", cleaning: "CLEANING", out_of_order: "OOO" };
  return icons[status] ?? "?";
}

function bookingIcon(status: string): string {
  const icons: Record<string, string> = { "checked-in": "IN", "booked": "BOOKED", "checked-out": "OUT", "cancelled": "X" };
  return icons[status] ?? "-";
}

const TASK_PRIORITY_LABEL: Record<string, string> = {
  "Khan": "🔴 Khẩn",
  "Cao": "🟠 Cao",
  "Binh Thuong": "🔵 Bình thường",
  "Thap": "⚪ Thấp",
};

const TASK_TYPE_LABEL: Record<string, string> = {
  "Don Phong": "🧹 Dọn phòng",
  "Check-in/out": "🔑 Check-in/out",
  "Bao Tri": "🔧 Bảo trì",
  "Mua Sam": "🛒 Mua sắm",
  "Admin": "📋 Admin",
  "Khac": "📌 Khác",
};

async function sendMessage(chatId: string, text: string): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error(`sendMessage FAILED chatId=${chatId} status=${res.status} body=${errText}`);
  }
  return res.ok;
}

async function handleToday(chatId: string) {
  const today = todayVN();
  const { data, error } = await supabase
    .from("bookings")
    .select("room_id, guest_name, check_in, check_out, status, grand_total, nights, groups(paid)")
    .or(`check_in.eq.${today},check_out.eq.${today},and(status.eq.checked-in,check_in.lt.${today},check_out.gt.${today})`)
    .or("is_deleted.is.null,is_deleted.eq.false")
    .neq("status", "cancelled")
    .order("room_id");
  if (error) return sendMessage(chatId, `Lỗi: ${error.message}`);
  type BRow = { room_id: string; guest_name: string; check_in: string; check_out: string; status: string; grand_total: number | null; nights: number | null; groups: { paid: number } | null; };
  const rows = (data ?? []) as BRow[];
  const checkins  = rows.filter((b) => b.check_in === today);
  const checkouts = rows.filter((b) => b.check_out === today);
  const staying   = rows.filter((b) => b.status === "checked-in" && b.check_in < today && b.check_out > today);
  let msg = `Hôm nay - ${formatDateVN(today)}\n`;
  msg += `\nCheck-in (${checkins.length})\n`;
  if (checkins.length) { for (const b of checkins) { const paid = (b.groups as any)?.paid ?? 0; const debt = (b.grand_total ?? 0) - paid; msg += `P${b.room_id} - ${b.guest_name}`; if (b.nights) msg += ` (${b.nights} đêm)`; if (b.status === "checked-in") msg += " DONE"; else if (debt > 0) msg += ` | Còn: ${formatVND(debt)}`; msg += "\n"; } } else { msg += `(không có)\n`; }
  msg += `\nCheck-out (${checkouts.length})\n`;
  if (checkouts.length) { for (const b of checkouts) { const paid = (b.groups as any)?.paid ?? 0; const debt = (b.grand_total ?? 0) - paid; msg += `P${b.room_id} - ${b.guest_name}`; if (b.status === "checked-out") msg += " DONE"; else if (debt > 0) msg += ` | Còn nợ: ${formatVND(debt)}`; msg += "\n"; } } else { msg += `(không có)\n`; }
  msg += `\nĐang ở (${staying.length})\n`;
  if (staying.length) { for (const b of staying) { msg += `P${b.room_id} - ${b.guest_name} (-> ${formatDateVN(b.check_out)})\n`; } } else { msg += `(không có)\n`; }
  return sendMessage(chatId, msg.trim());
}

async function handleNext(chatId: string) {
  const today = todayVN();
  const d = new Date(today + "T00:00:00+07:00");
  d.setDate(d.getDate() + 1);
  const tomorrow = d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const { data, error } = await supabase
    .from("bookings")
    .select("room_id, guest_name, check_in, check_out, status, grand_total, nights, groups(paid, source)")
    .or(`check_in.eq.${tomorrow},check_out.eq.${tomorrow}`)
    .neq("status", "cancelled")
    .order("room_id");
  if (error) return sendMessage(chatId, `Lỗi: ${error.message}`);
  if (!data?.length) return sendMessage(chatId, `Ngày mai (${formatDateVN(tomorrow)}) không có hoạt động.`);
  type BRow = { room_id: string; guest_name: string; check_in: string; check_out: string; status: string; grand_total: number | null; nights: number | null; groups: { paid: number; source: string | null } | null; };
  const rows = data as BRow[];
  const checkins  = rows.filter((b) => b.check_in === tomorrow);
  const checkouts = rows.filter((b) => b.check_out === tomorrow);
  let msg = `Ngày mai - ${formatDateVN(tomorrow)}\n`;
  msg += `\nCheck-in (${checkins.length})\n`;
  if (checkins.length) { for (const b of checkins) { const source = (b.groups as any)?.source ?? null; msg += `P${b.room_id} - ${b.guest_name}`; const parts: string[] = []; if (b.nights) parts.push(`${b.nights} đêm`); if (source) parts.push(source); if (parts.length) msg += ` (${parts.join(", ")})`; msg += "\n"; } } else { msg += `(không có)\n`; }
  msg += `\nCheck-out (${checkouts.length})\n`;
  if (checkouts.length) { for (const b of checkouts) { const source = (b.groups as any)?.source ?? null; const paid = (b.groups as any)?.paid ?? 0; const debt = (b.grand_total ?? 0) - paid; msg += `P${b.room_id} - ${b.guest_name}`; if (source) msg += ` (${source})`; if (debt > 0) msg += ` | Còn nợ: ${formatVND(debt)}`; msg += "\n"; } } else { msg += `(không có)\n`; }
  return sendMessage(chatId, msg.trim());
}

async function handleAll(chatId: string, args: string[]) {
  const now = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  function parseDateArg(str: string): string | null {
    const m = str.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (!m) return null;
    const day   = m[1].padStart(2, "0");
    const month = parseInt(m[2]);
    const year  = month < currentMonth ? currentYear + 1 : currentYear;
    return `${year}-${String(month).padStart(2, "0")}-${day}`;
  }
  const today = todayVN();
  let checkIn: string; let checkOut: string; let label: string;
  if (!args.length) {
    checkIn = today;
    const d = new Date(today + "T00:00:00+07:00"); d.setDate(d.getDate() + 1);
    checkOut = d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    label = `hôm nay`;
  } else if (args.length === 1) {
    checkIn = parseDateArg(args[0]) ?? "";
    if (!checkIn) return sendMessage(chatId, "Sai định dạng. Dùng: /a 17/06 hoặc /a 17/06 20/06");
    const d = new Date(checkIn + "T00:00:00+07:00"); d.setDate(d.getDate() + 1);
    checkOut = d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    label = args[0];
  } else {
    checkIn  = parseDateArg(args[0]) ?? "";
    checkOut = parseDateArg(args[1]) ?? "";
    if (!checkIn || !checkOut) return sendMessage(chatId, "Sai định dạng. Dùng: /a 17/06 hoặc /a 17/06 20/06");
    label = `${args[0]} -> ${args[1]}`;
  }
  const nights = nightsBetween(checkIn, checkOut);
  const ROOMS  = ["101", "102", "103", "201", "202", "203", "301", "302"];
  const results = await Promise.all(ROOMS.map(async (roomId) => {
    const { data, error } = await supabase.rpc("check_room_availability", { p_room_id: roomId, p_check_in: checkIn, p_check_out: checkOut, p_exclude_booking_id: null });
    const available = !error && (data as any)?.[0]?.available === true;
    return { roomId, available };
  }));
  const availableRooms = results.filter((r) => r.available).map((r) => r.roomId);
  const occupiedRooms  = results.filter((r) => !r.available).map((r) => r.roomId);
  const nightLabel = nights === 1 ? "1 đêm" : `${nights} đêm`;
  let msg = `Phòng trống ${label} (${nightLabel})\n\n`;
  msg += `Trống (${availableRooms.length}):\n`;
  msg += availableRooms.length ? availableRooms.join(" . ") : "(không có)";
  msg += `\n\nĐã đặt (${occupiedRooms.length}):\n`;
  msg += occupiedRooms.length ? occupiedRooms.join(" . ") : "(không có)";
  return sendMessage(chatId, msg.trim());
}

async function handleCheckin(chatId: string) {
  const today = todayVN();
  const { data, error } = await supabase.from("bookings").select("room_id, guest_name, check_in, check_out, status, grand_total, groups(paid)").eq("check_in", today).neq("status", "cancelled").order("room_id");
  if (error) return sendMessage(chatId, `Lỗi: ${error.message}`);
  if (!data?.length) return sendMessage(chatId, `Hôm nay (${formatDateVN(today)}) không có khách check-in.`);
  let msg = `Check-in hôm nay ${formatDateVN(today)} (${data.length})\n\n`;
  for (const b of data) { const paid = (b.groups as any)?.paid ?? 0; const total = (b.grand_total as number) ?? 0; const debt = total - paid; const statusLabel = b.status === "checked-in" ? " DONE" : ""; msg += `P${b.room_id} - ${b.guest_name} -> out ${formatDateVN(b.check_out)}${statusLabel}`; if (debt > 0) msg += ` | Còn: ${formatVND(debt)}`; msg += "\n"; }
  return sendMessage(chatId, msg.trim());
}

async function handleCheckout(chatId: string) {
  const today = todayVN();
  const { data, error } = await supabase.from("bookings").select("room_id, guest_name, check_in, check_out, status, grand_total, groups(paid)").eq("check_out", today).neq("status", "cancelled").order("room_id");
  if (error) return sendMessage(chatId, `Lỗi: ${error.message}`);
  if (!data?.length) return sendMessage(chatId, `Hôm nay (${formatDateVN(today)}) không có khách check-out.`);
  let msg = `Check-out hôm nay ${formatDateVN(today)} (${data.length})\n\n`;
  for (const b of data) { const paid = (b.groups as any)?.paid ?? 0; const total = (b.grand_total as number) ?? 0; const debt = total - paid; msg += `P${b.room_id} - ${b.guest_name}`; if (b.status === "checked-out") msg += " DONE"; else if (debt > 0) msg += ` | Còn nợ: ${formatVND(debt)}`; msg += "\n"; }
  return sendMessage(chatId, msg.trim());
}

async function handleStay(chatId: string) {
  const { data, error } = await supabase.from("bookings").select("room_id, guest_name, check_in, check_out, grand_total, groups(paid)").eq("status", "checked-in").order("check_out");
  if (error) return sendMessage(chatId, `Lỗi: ${error.message}`);
  if (!data?.length) return sendMessage(chatId, "Hiện không có khách đang ở.");
  let msg = `Khách đang ở (${data.length})\n\n`;
  for (const b of data) { const paid = (b.groups as any)?.paid ?? 0; const total = (b.grand_total as number) ?? 0; const debt = total - paid; msg += `P${b.room_id} - ${b.guest_name} | out ${formatDateVN(b.check_out)}`; if (debt > 0) msg += ` | Còn: ${formatVND(debt)}`; msg += "\n"; }
  return sendMessage(chatId, msg.trim());
}

async function handleRooms(chatId: string) {
  const today = todayVN();
  const { data: rooms, error: roomErr } = await supabase.from("rooms").select("id, name, housekeeping_status, housekeeping_note").eq("is_active", true).order("id");
  if (roomErr) return sendMessage(chatId, `Lỗi: ${roomErr.message}`);
  const { data: bookings } = await supabase.from("bookings").select("room_id, guest_name, status, check_out").in("status", ["checked-in", "booked"]).lte("check_in", today).gt("check_out", today).neq("status", "cancelled");
  const bookingMap: Record<string, { guest_name: string; status: string; check_out: string }> = {};
  for (const b of bookings ?? []) { bookingMap[b.room_id] = b; }
  let msg = `Tình trạng phòng\n\n`;
  for (const r of rooms ?? []) { const hk = r.housekeeping_status ?? "clean"; const b = bookingMap[r.id]; msg += `[${hkIcon(hk)}] P${r.id}`; if (b) { msg += ` - [${bookingIcon(b.status)}] ${b.guest_name} (out ${formatDateVN(b.check_out)})`; } else { msg += " - Trống"; } if (r.housekeeping_note) msg += `\n   Note: ${r.housekeeping_note}`; msg += "\n"; }
  msg += `\nOK=clean DIRTY=dirty CLEANING=cleaning OOO=out of order`;
  return sendMessage(chatId, msg.trim());
}

async function handleClean(chatId: string) {
  const today = todayVN();
  const { data: dirtyRooms, error: e1 } = await supabase.from("rooms").select("id, housekeeping_status, housekeeping_note").in("housekeeping_status", ["dirty", "cleaning"]).eq("is_active", true).order("id");
  if (e1) return sendMessage(chatId, `Lỗi: ${e1.message}`);
  const { data: checkouts } = await supabase.from("bookings").select("room_id, guest_name, status").eq("check_out", today).neq("status", "cancelled");
  const checkoutRoomIds = new Set((checkouts ?? []).map((b) => b.room_id));
  const dirtyIds = new Set((dirtyRooms ?? []).map((r) => r.id));
  const checkoutOnlyIds = [...checkoutRoomIds].filter((id) => !dirtyIds.has(id));
  if (!dirtyRooms?.length && !checkoutOnlyIds.length) { return sendMessage(chatId, "Không có phòng nào cần dọn!"); }
  let msg = "Phòng cần dọn\n\n";
  if (dirtyRooms?.length) { for (const r of dirtyRooms) { const status = r.housekeeping_status === "cleaning" ? "Đang dọn" : "Cần dọn"; msg += `${status}: P${r.id}`; if (r.housekeeping_note) msg += ` - ${r.housekeeping_note}`; msg += "\n"; } }
  if (checkoutOnlyIds.length) { msg += "\nCheck-out hôm nay (chưa cập nhật)\n"; for (const id of checkoutOnlyIds) { msg += `  P${id}\n`; } }
  msg += `\nDọn xong: /cleaned [phòng] (vd /cleaned 101)`;
  return sendMessage(chatId, msg.trim());
}

async function handleCleaned(chatId: string, roomId: string) {
  if (!roomId) { return sendMessage(chatId, "Thiếu số phòng. Dùng: /cleaned 101"); }
  const { error } = await supabase.rpc("update_housekeeping_status", { p_room_id: roomId, p_status: "clean" });
  if (error) return sendMessage(chatId, `Lỗi: ${error.message}`);
  return sendMessage(chatId, `Phòng ${roomId} đã dọn xong - trạng thái: CLEAN`);
}

async function handleIssue(chatId: string, args: string[]) {
  if (args.length < 2) { return sendMessage(chatId, "Thiếu thông tin. Dùng: /issue 101 Máy lạnh không lạnh"); }
  const roomId = args[0];
  const description = args.slice(1).join(" ");
  const { error } = await supabase.rpc("log_room_issue_txn", { p_room_id: roomId, p_description: description, p_reported_by: "staff_telegram" });
  if (error) { if (error.code === "P0050") { return sendMessage(chatId, `Phòng ${roomId} không tồn tại.`); } return sendMessage(chatId, `Lỗi: ${error.message}`); }
  return sendMessage(chatId, `Đã ghi sự cố P${roomId}:\n${description}\n\nHiếu sẽ xử lý sớm.`);
}

async function handleRevenue(chatId: string) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = new Date(year, month, 0).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const { data, error } = await supabase.from("bookings").select("net_revenue, check_out").eq("status", "checked-out").gte("check_out", start).lte("check_out", end);
  if (error) return sendMessage(chatId, `Lỗi: ${error.message}`);
  const total = (data ?? []).reduce((s, b) => s + (b.net_revenue ?? 0), 0);
  return sendMessage(chatId, `Doanh thu tháng ${month}/${year}\n${formatVND(total)} (${data?.length ?? 0} booking checked-out)`);
}

async function handleDebt(chatId: string) {
  const { data, error } = await supabase.from("groups").select("id, net_revenue, paid, bookings(room_id, guest_name, status)").eq("is_deleted", false).in("bookings.status", ["booked", "checked-in"]);
  if (error) return sendMessage(chatId, `Lỗi: ${error.message}`);
  const groups = (data ?? []).filter((g) => { const hasActive = (g.bookings as any[]).some((b) => ["booked", "checked-in"].includes(b.status)); return hasActive && (g.net_revenue ?? 0) > (g.paid ?? 0); });
  if (!groups.length) return sendMessage(chatId, "Không có nhóm nào còn nợ.");
  let msg = `Nhóm còn nợ (${groups.length})\n\n`;
  for (const g of groups) { const debt = (g.net_revenue ?? 0) - (g.paid ?? 0); const names = (g.bookings as any[]).map((b) => `P${b.room_id} ${b.guest_name}`).join(", "); msg += `${names} - Còn: ${formatVND(debt)}\n`; }
  return sendMessage(chatId, msg.trim());
}

// ============================================
// TASK COMMANDS — doc/quan ly ops_tasks
// task_number hien thi phai khop CHINH XAC cong thuc dung trong
// complete_task_txn / skip_task_txn / extend_task_txn:
// ORDER BY priority CASE (Khan=0, Cao=1, Binh Thuong=2, Thap=3), created_at ASC
// ============================================

type OpsTaskRow = { id: number; task_name: string; loai: string; priority: string; ghi_chu: string | null; room_id: string | null; };

const TASK_PRIORITY_ORDER: Record<string, number> = { "Khan": 0, "Cao": 1, "Binh Thuong": 2, "Thap": 3 };

async function fetchTodayOpenTasks(): Promise<OpsTaskRow[]> {
  const today = todayVN();
  const { data, error } = await supabase.from("ops_tasks").select("id, task_name, loai, priority, ghi_chu, room_id").eq("task_date", today).eq("status", "Can Lam");
  if (error) { console.error("fetchTodayOpenTasks error:", error.message); return []; }
  return (data ?? []).sort((a, b) => { const pa = TASK_PRIORITY_ORDER[a.priority] ?? 2; const pb = TASK_PRIORITY_ORDER[b.priority] ?? 2; if (pa !== pb) return pa - pb; return a.id - b.id; });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatTaskList(tasks: OpsTaskRow[]): string {
  if (!tasks.length) return "Hôm nay không có task nào còn cần làm.";
  let msg = `Task hôm nay (${tasks.length})\n\n`;
  tasks.forEach((t, i) => {
    const pLabel = TASK_PRIORITY_LABEL[t.priority] ?? "🔵 Bình thường";
    const tLabel = TASK_TYPE_LABEL[t.loai] ?? "📌 Khác";
    const roomLabel = t.room_id ? ` (P${escapeHtml(t.room_id)})` : "";
    msg += `${i + 1}. ${tLabel} — ${escapeHtml(t.task_name)}${roomLabel}\n`;
    msg += `   Ưu tiên: ${pLabel}\n`;
    if (t.ghi_chu) msg += `   Ghi chú: ${escapeHtml(t.ghi_chu)}\n`;
  });
  msg += `\n💡 <b>Lệnh:</b>\n`;
  msg += `• /done [số] — hoàn thành task\n`;
  msg += `• /skip [số] [lý do] — bỏ qua task\n`;
  msg += `• /extend [số] — dời task sang ngày mai`;
  return msg;
}

async function handleTasks(chatId: string) {
  const tasks = await fetchTodayOpenTasks();
  return sendMessage(chatId, formatTaskList(tasks).trim());
}

function parseTaskNumber(raw: string): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return null;
  return n;
}

async function handleDoneTask(chatId: string, args: string[]) {
  const num = parseTaskNumber(args[0]);
  if (num === null) return sendMessage(chatId, "Thiếu hoặc sai số task. Dùng: /done 2");
  const today = todayVN();
  const { data, error } = await supabase.rpc("complete_task_txn", { p_task_date: today, p_task_number: num });
  if (error) { if (error.message?.includes("TASK_NOT_FOUND")) return sendMessage(chatId, `Không tìm thấy task số ${num} trong danh sách hôm nay. Dùng /tasks để xem lại.`); return sendMessage(chatId, `Lỗi: ${error.message}`); }
  const result = data as { task_name: string };
  return sendMessage(chatId, `✅ Đã hoàn thành: ${escapeHtml(result.task_name)}`);
}

async function handleSkipTask(chatId: string, args: string[]) {
  const num = parseTaskNumber(args[0]);
  if (num === null) return sendMessage(chatId, "Thiếu hoặc sai số task. Dùng: /skip 2 [lý do]");
  const reason = args.slice(1).join(" ") || null;
  const today = todayVN();
  const { data, error } = await supabase.rpc("skip_task_txn", { p_task_date: today, p_task_number: num, p_reason: reason });
  if (error) { if (error.message?.includes("TASK_NOT_FOUND")) return sendMessage(chatId, `Không tìm thấy task số ${num} trong danh sách hôm nay. Dùng /tasks để xem lại.`); return sendMessage(chatId, `Lỗi: ${error.message}`); }
  const result = data as { task_name: string };
  return sendMessage(chatId, `⏭️ Đã bỏ qua: ${escapeHtml(result.task_name)}`);
}

async function handleExtendTask(chatId: string, args: string[]) {
  const num = parseTaskNumber(args[0]);
  if (num === null) return sendMessage(chatId, "Thiếu hoặc sai số task. Dùng: /extend 2");
  const today = todayVN();
  const { data, error } = await supabase.rpc("extend_task_txn", { p_task_date: today, p_task_number: num, p_new_date: null });
  if (error) { if (error.message?.includes("TASK_NOT_FOUND")) return sendMessage(chatId, `Không tìm thấy task số ${num} trong danh sách hôm nay. Dùng /tasks để xem lại.`); return sendMessage(chatId, `Lỗi: ${error.message}`); }
  const result = data as { task_name: string; new_task_date: string };
  return sendMessage(chatId, `⏩ Đã dời sang ${formatDateVN(result.new_task_date)}: ${escapeHtml(result.task_name)}`);
}

async function handleHelp(chatId: string) {
  const msg = `
Hello Dalat Bot - Lệnh

Lịch
/today - check-in, check-out, đang ở hôm nay
/next - check-in, check-out ngày mai
/a - phòng trống hôm nay
/a [dd/mm] - phòng trống ngày cụ thể
/a [dd/mm] [dd/mm] - phòng trống giai đoạn
/checkin - check-in hôm nay
/checkout - check-out hôm nay
/stay - khách đang ở

Phòng
/rooms - tình trạng tất cả phòng
/clean - phòng cần dọn
/cleaned [phòng] - đánh dấu đã dọn (vd /cleaned 101)
/issue [phòng] [mô tả] - báo sự cố (vd /issue 101 Đèn hỏng)

Task
/tasks - xem task hôm nay
/done [số] - hoàn thành task (vd /done 2)
/skip [số] [lý do] - bỏ qua task (vd /skip 3 hết đồ)
/extend [số] - dời task sang ngày mai (vd /extend 1)

Tài chính
/revenue - doanh thu tháng này
/debt - nhóm còn nợ

/help - xem lệnh này
`.trim();
  return sendMessage(chatId, msg);
}

serve(async (req) => {
  try {
    // Xac thuc secret_token tu Telegram (item 06) - FAIL-CLOSED.
    // Telegram gui header nay khi setWebhook co param secret_token.
    // Chan request gia mao (chat_id khong phai bi mat).
    const secretHeader = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secretHeader !== WEBHOOK_SECRET) {
      console.warn("Rejected: sai hoac thieu secret_token header");
      return new Response("ok");
    }

    const body = await req.json();
    const message = body?.message;
    if (!message) return new Response("ok");
    const chatId = String(message.chat?.id ?? "");
    const text = (message.text ?? "").trim();
    if (chatId !== ALLOWED_CHAT_ID) { console.warn(`Blocked chat_id: ${chatId}`); return new Response("ok"); }
    const parts = text.split(/\s+/);
    const command = parts[0]?.toLowerCase() ?? "";
    const arg1 = parts[1] ?? "";
    const args = parts.slice(1);
    if      (command === "/today")    await handleToday(chatId);
    else if (command === "/next")     await handleNext(chatId);
    else if (command === "/a")        await handleAll(chatId, args);
    else if (command === "/checkin")  await handleCheckin(chatId);
    else if (command === "/checkout") await handleCheckout(chatId);
    else if (command === "/stay")     await handleStay(chatId);
    else if (command === "/rooms")    await handleRooms(chatId);
    else if (command === "/clean")    await handleClean(chatId);
    else if (command === "/cleaned")  await handleCleaned(chatId, arg1);
    else if (command === "/issue")    await handleIssue(chatId, args);
    else if (command === "/revenue")  await handleRevenue(chatId);
    else if (command === "/debt")     await handleDebt(chatId);
    else if (command === "/tasks")    await handleTasks(chatId);
    else if (command === "/done")     await handleDoneTask(chatId, args);
    else if (command === "/skip")     await handleSkipTask(chatId, args);
    else if (command === "/extend")   await handleExtendTask(chatId, args);
    else if (command === "/help")     await handleHelp(chatId);
    return new Response("ok");
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("ok");
  }
});