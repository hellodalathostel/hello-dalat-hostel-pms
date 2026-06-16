import "@supabase/functions-js/edge-runtime.d.ts";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const ALLOWED_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;
const NOTION_TOKEN = Deno.env.get("NOTION_TOKEN")!;
const NOTION_TASK_DB_ID = "2b3cd2c9-6b3a-4f39-963e-de01d5ff28dc";
const TOTAL_ROOMS = 8;

// ─── Helpers ───────────────────────────────────────────────────────────────

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

// Ngày hôm nay theo ICT
function todayICT(): string {
  return new Date(Date.now() + 7 * 3600000).toISOString().split("T")[0];
}

// Format ngày dd/mm/yyyy cho hiển thị tiếng Việt
function formatDateVN(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// Format tiền VND gọn: 1500000 → "1.5tr", 500000 → "500k"
function formatVND(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}tr`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}k`;
  return `${amount}đ`;
}

// ─── Notion helpers ────────────────────────────────────────────────────────

// Lấy page_id từ session mapping (task_index hôm nay)
async function getTaskFromSession(
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
  taskIndex: number,
): Promise<{ notion_page_id: string; task_name: string } | null> {
  const { data, error } = await supabase
    .from("telegram_task_sessions")
    .select("notion_page_id, task_name")
    .eq("session_date", todayICT())
    .eq("task_index", taskIndex)
    .single();
  if (error || !data) return null;
  return data;
}

// Cập nhật Trạng Thái Notion
async function updateNotionStatus(pageId: string, status: string, completedAt?: string) {
  const properties: Record<string, unknown> = {
    "Trạng Thái": { select: { name: status } },
  };
  if (completedAt) {
    properties["Hoàn Thành Lúc"] = { date: { start: completedAt } };
  }
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ properties }),
  });
  return res.ok;
}

// Dời ngày thực hiện Notion
async function updateNotionDate(pageId: string, newDate: string) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        "Ngày Thực Hiện": { date: { start: newDate } },
      },
    }),
  });
  return res.ok;
}

// Tạo task mới trên Notion
async function createNotionTask(params: {
  name: string;
  loai: string;
  uuTien: string;
  ngay: string;
  ghiChu: string;
  nguoiThucHien: string;
}): Promise<string | null> {
  const properties: Record<string, unknown> = {
    "Tên Task": { title: [{ text: { content: params.name } }] },
    "Loại": { select: { name: params.loai } },
    "Ưu Tiên": { select: { name: params.uuTien } },
    "Ngày Thực Hiện": { date: { start: params.ngay } },
    "Trạng Thái": { select: { name: "Cần Làm" } },
    "Người Thực Hiện": { select: { name: params.nguoiThucHien } },
  };
  if (params.ghiChu) {
    properties["Ghi Chú"] = {
      rich_text: [{ text: { content: params.ghiChu } }],
    };
  }

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: NOTION_TASK_DB_ID },
      properties,
    }),
  });

  if (!res.ok) {
    console.error("createNotionTask failed:", await res.text());
    return null;
  }
  const data = await res.json();
  return data.id as string;
}

// Query tasks hôm nay (cho /tasks)
async function queryTodayTasks(): Promise<
  Array<{ id: string; name: string; loai: string; uu_tien: string; trang_thai: string; ghi_chu: string }>
> {
  const res = await fetch(
    `https://api.notion.com/v1/databases/${NOTION_TASK_DB_ID}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          and: [
            { property: "Ngày Thực Hiện", date: { equals: todayICT() } },
            { property: "Trạng Thái", select: { does_not_equal: "Bỏ Qua" } },
          ],
        },
        sorts: [{ property: "Ưu Tiên", direction: "ascending" }],
      }),
    },
  );

  if (!res.ok) return [];
  const data = await res.json();
  return (data.results ?? []).map((page: Record<string, unknown>) => {
    const props = page.properties as Record<string, unknown>;
    const titleArr = (props["Tên Task"] as { title: Array<{ plain_text: string }> })?.title ?? [];
    return {
      id: page.id as string,
      name: titleArr.map((t) => t.plain_text).join("") || "(Không tên)",
      loai: (props["Loại"] as { select?: { name: string } })?.select?.name ?? "",
      uu_tien: (props["Ưu Tiên"] as { select?: { name: string } })?.select?.name ?? "Bình Thường",
      trang_thai: (props["Trạng Thái"] as { select?: { name: string } })?.select?.name ?? "Cần Làm",
      ghi_chu: (props["Ghi Chú"] as { rich_text: Array<{ plain_text: string }> })?.rich_text
        ?.map((t: { plain_text: string }) => t.plain_text).join("") ?? "",
    };
  });
}

// Lưu session mapping
async function saveSession(
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
  tasks: Array<{ id: string; name: string }>,
) {
  if (tasks.length === 0) return;
  const rows = tasks.map((t, i) => ({
    session_date: todayICT(),
    task_index: i + 1,
    notion_page_id: t.id,
    task_name: t.name,
  }));
  await supabase
    .from("telegram_task_sessions")
    .upsert(rows, { onConflict: "session_date,task_index" });
}

// ─── Supabase query helpers ────────────────────────────────────────────────

// Query lịch 1 ngày: check-in, check-out, đang ở, phòng trống
async function queryDaySchedule(
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
  date: string, // YYYY-MM-DD
): Promise<{
  checkIns: Array<{ room_id: string; guest_name: string }>;
  checkOuts: Array<{ room_id: string; guest_name: string }>;
  staying: Array<{ room_id: string; guest_name: string }>;
  freeRooms: Array<{ id: string; name: string }>;
}> {
  const [roomsRes, bookingsRes, otaRes] = await Promise.all([
    supabase.from("rooms").select("id, name").order("name"),
    supabase
      .from("bookings")
      .select("room_id, guest_name, check_in, check_out, status")
      .eq("is_deleted", false)
      .neq("status", "cancelled")
      .or(`check_in.eq.${date},check_out.eq.${date},and(check_in.lte.${date},check_out.gt.${date})`),
    supabase
      .from("ota_calendar_feed")
      .select("room_id")
      .lte("check_in", date)
      .gt("check_out", date)
      .eq("is_cancelled", false),
  ]);

  const rooms: Array<{ id: string; name: string }> = roomsRes.data ?? [];
  const bookings: Array<{ room_id: string; guest_name: string; check_in: string; check_out: string }> =
    bookingsRes.data ?? [];
  const otaRoomIds = new Set((otaRes.data ?? []).map((o: { room_id: string }) => o.room_id));

  const checkIns = bookings.filter((b) => b.check_in === date);
  const checkOuts = bookings.filter((b) => b.check_out === date);
  const staying = bookings.filter((b) => b.check_in < date && b.check_out > date);

  const occupiedIds = new Set([
    ...bookings
      .filter((b) => b.check_in <= date && b.check_out > date)
      .map((b) => b.room_id),
    ...otaRoomIds,
  ]);
  const freeRooms = rooms.filter((r) => !occupiedIds.has(r.id));

  return { checkIns, checkOuts, staying, freeRooms };
}

// Query phòng trống theo khoảng ngày (từ checkIn đến checkOut)
async function queryRangeAvailability(
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
  startDate: string, // YYYY-MM-DD
  endDate: string,   // YYYY-MM-DD (exclusive — ngày check-out)
): Promise<Array<{ id: string; name: string }>> {
  const [roomsRes, bookingsRes, otaRes] = await Promise.all([
    supabase.from("rooms").select("id, name").order("name"),
    supabase
      .from("bookings")
      .select("room_id")
      .eq("is_deleted", false)
      .neq("status", "cancelled")
      .lt("check_in", endDate)
      .gt("check_out", startDate),
    supabase
      .from("ota_calendar_feed")
      .select("room_id")
      .eq("is_cancelled", false)
      .lt("check_in", endDate)
      .gt("check_out", startDate),
  ]);

  const rooms: Array<{ id: string; name: string }> = roomsRes.data ?? [];
  const occupiedIds = new Set([
    ...(bookingsRes.data ?? []).map((b: { room_id: string }) => b.room_id),
    ...(otaRes.data ?? []).map((o: { room_id: string }) => o.room_id),
  ]);
  return rooms.filter((r) => !occupiedIds.has(r.id));
}

// ─── Icons ─────────────────────────────────────────────────────────────────

const PRIORITY_ICON: Record<string, string> = {
  "Khẩn": "🔴", "Cao": "🟠", "Bình Thường": "🔵", "Thấp": "⚪",
};
const TYPE_ICON: Record<string, string> = {
  "Dọn Phòng": "🧹", "Check-in/out": "🔑", "Bảo Trì": "🔧",
  "Mua Sắm": "🛒", "Admin": "📋", "Khác": "📌",
};
const STATUS_ICON: Record<string, string> = {
  "Cần Làm": "⬜", "Đang Làm": "🟡", "Hoàn Thành": "✅", "Bỏ Qua": "⏭",
};

function mapPriority(input: string): string {
  const s = input.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (["khan", "k"].includes(s)) return "Khẩn";
  if (["cao", "c"].includes(s)) return "Cao";
  if (["thap", "t"].includes(s)) return "Thấp";
  return "Bình Thường";
}

// ─── Handler functions ──────────────────────────────────────────────────────

async function handleTask(chatId: number, rawText: string) {
  const parts = rawText.split("|").map((p: string) => p.trim());
  const taskName = parts[0];
  const ghiChu = parts[1] ?? "";
  const uuTien = parts[2] ? mapPriority(parts[2]) : "Bình Thường";

  if (!taskName) {
    await sendMessage(chatId, "❌ Vui lòng nhập tên task.\n\nVí dụ:\n<code>/task Dọn phòng 101 | Thay khăn tắm | cao</code>");
    return;
  }

  const notionProperties: Record<string, unknown> = {
    "Tên Task": { title: [{ text: { content: taskName } }] },
    "Trạng Thái": { select: { name: "Cần Làm" } },
    "Người Thực Hiện": { select: { name: "Lợi" } },
    "Ưu Tiên": { select: { name: uuTien } },
  };

  if (ghiChu) {
    notionProperties["Ghi Chú"] = { rich_text: [{ text: { content: ghiChu } }] };
  }

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: NOTION_TASK_DB_ID },
      properties: notionProperties,
    }),
  });

  if (!res.ok) {
    console.error("handleTask failed:", await res.text());
    await sendMessage(chatId, "❌ Tạo task thất bại. Kiểm tra kết nối Notion.");
    return;
  }

  const priorityEmoji: Record<string, string> = {
    "Khẩn": "🔴", "Cao": "🟠", "Bình Thường": "🔵", "Thấp": "⚪",
  };
  const emoji = priorityEmoji[uuTien] ?? "🔵";

  await sendMessage(
    chatId,
    `✅ Đã tạo task!\n📌 ${taskName}${ghiChu ? `\n📝 ${ghiChu}` : ""}\n${emoji} Ưu tiên: ${uuTien}`,
  );
}

async function handleDone(
  chatId: number,
  indexStr: string,
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
) {
  const idx = parseInt(indexStr);
  if (isNaN(idx) || idx < 1) {
    await sendMessage(chatId, `❌ Số task không hợp lệ.\nVí dụ: <code>/done 2</code>`);
    return;
  }

  const session = await getTaskFromSession(supabase, idx);
  if (!session) {
    await sendMessage(
      chatId,
      `❌ Không tìm thấy task số <b>${idx}</b> hôm nay.\n` +
      `Dùng <code>/tasks</code> để xem danh sách mới nhất.`,
    );
    return;
  }

  // Thời điểm hoàn thành (ICT)
  const now = new Date(Date.now() + 7 * 3600000);
  const completedAt = now.toISOString().replace("Z", "+07:00").slice(0, 19) + "+07:00";

  const ok = await updateNotionStatus(session.notion_page_id, "Hoàn Thành", now.toISOString().split("T")[0]);
  if (!ok) {
    await sendMessage(chatId, "❌ Cập nhật Notion thất bại. Thử lại nhé.");
    return;
  }

  await sendMessage(
    chatId,
    `✅ <b>Hoàn thành!</b>\n\n` +
    `☑️ Task ${idx}: <b>${session.task_name}</b>\n` +
    `🕐 Lúc ${now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`,
  );
}

async function handleSkip(
  chatId: number,
  indexStr: string,
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
) {
  const idx = parseInt(indexStr);
  if (isNaN(idx) || idx < 1) {
    await sendMessage(chatId, `❌ Số task không hợp lệ.\nVí dụ: <code>/skip 3</code>`);
    return;
  }

  const session = await getTaskFromSession(supabase, idx);
  if (!session) {
    await sendMessage(
      chatId,
      `❌ Không tìm thấy task số <b>${idx}</b> hôm nay.\n` +
      `Dùng <code>/tasks</code> để xem danh sách mới nhất.`,
    );
    return;
  }

  const ok = await updateNotionStatus(session.notion_page_id, "Bỏ Qua");
  if (!ok) {
    await sendMessage(chatId, "❌ Cập nhật Notion thất bại. Thử lại nhé.");
    return;
  }

  await sendMessage(
    chatId,
    `⏭ <b>Đã bỏ qua.</b>\n\nTask ${idx}: <i>${session.task_name}</i>`,
  );
}

async function handleExtend(
  chatId: number,
  parts: string[],
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
) {
  // /extend <số> <ngày>
  const idxStr = parts[0];
  const dateRaw = parts[1];

  if (!idxStr || !dateRaw) {
    await sendMessage(chatId, `❌ Thiếu tham số.\nVí dụ: <code>/extend 2 18/06</code>`);
    return;
  }

  const idx = parseInt(idxStr);
  if (isNaN(idx) || idx < 1) {
    await sendMessage(chatId, `❌ Số task không hợp lệ.`);
    return;
  }

  const newDate = parseDate(dateRaw);
  if (!newDate) {
    await sendMessage(chatId, `❌ Ngày không hợp lệ: <code>${dateRaw}</code>\nDùng định dạng <code>dd/mm</code>`);
    return;
  }

  const session = await getTaskFromSession(supabase, idx);
  if (!session) {
    await sendMessage(
      chatId,
      `❌ Không tìm thấy task số <b>${idx}</b> hôm nay.\n` +
      `Dùng <code>/tasks</code> để xem danh sách mới nhất.`,
    );
    return;
  }

  const ok = await updateNotionDate(session.notion_page_id, newDate);
  if (!ok) {
    await sendMessage(chatId, "❌ Cập nhật Notion thất bại. Thử lại nhé.");
    return;
  }

  const displayDate = new Date(newDate + "T12:00:00+07:00").toLocaleDateString("vi-VN", {
    day: "2-digit", month: "2-digit",
  });

  await sendMessage(
    chatId,
    `📅 <b>Đã dời ngày.</b>\n\nTask ${idx}: <b>${session.task_name}</b>\n→ Chuyển sang <b>${displayDate}</b>`,
  );
}

async function handleTasks(
  chatId: number,
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
) {
  const tasks = await queryTodayTasks();

  if (tasks.length === 0) {
    await sendMessage(chatId, "✅ <b>Không có task nào hôm nay.</b>");
    return;
  }

  // Lưu lại session mapping mới nhất (refresh)
  await saveSession(supabase, tasks);

  const now = new Date(Date.now() + 7 * 3600000);
  const dateStr = now.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });

  const lines: string[] = [
    `📋 <b>Tasks hôm nay (${dateStr})</b>`,
    "",
  ];

  tasks.forEach((t, i) => {
    const pIcon = PRIORITY_ICON[t.uu_tien] ?? "🔵";
    const tIcon = TYPE_ICON[t.loai] ?? "📌";
    const sIcon = STATUS_ICON[t.trang_thai] ?? "⬜";
    lines.push(`${sIcon} ${pIcon} <b>${i + 1}.</b> ${tIcon} ${t.name}`);
    if (t.ghi_chu) lines.push(`   <i>${t.ghi_chu}</i>`);
  });

  lines.push("");
  lines.push(`<code>/done N</code> · <code>/skip N</code> · <code>/extend N dd/mm</code>`);

  await sendMessage(chatId, lines.join("\n"));
}

// Handler /today và /next
async function handleDayView(
  chatId: number,
  date: string, // YYYY-MM-DD
  label: string, // "Hôm nay" hoặc "Ngày mai"
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
) {
  const { checkIns, checkOuts, staying, freeRooms } = await queryDaySchedule(supabase, date);

  const displayDate = new Date(date + "T12:00:00+07:00").toLocaleDateString("vi-VN", {
    weekday: "long", day: "2-digit", month: "2-digit",
  });

  const lines: string[] = [
    `📅 <b>${label} — ${displayDate}</b>`,
    "",
  ];

  if (checkIns.length > 0) {
    lines.push(`🟢 <b>Check-in (${checkIns.length})</b>`);
    checkIns.forEach((b) => lines.push(`  • ${b.guest_name || "(chưa có tên)"}`));
    lines.push("");
  }

  if (checkOuts.length > 0) {
    lines.push(`🔴 <b>Check-out (${checkOuts.length})</b>`);
    checkOuts.forEach((b) => lines.push(`  • ${b.guest_name || "(chưa có tên)"}`));
    lines.push("");
  }

  if (staying.length > 0) {
    lines.push(`🏠 <b>Đang ở (${staying.length})</b>`);
    staying.forEach((b) => lines.push(`  • ${b.guest_name || "(chưa có tên)"}`));
    lines.push("");
  }

  lines.push(`✅ <b>Phòng trống: ${freeRooms.length}/${TOTAL_ROOMS}</b>`);
  if (freeRooms.length > 0) {
    freeRooms.forEach((r) => lines.push(`  • ${r.id} - ${r.name}`));
  } else {
    lines.push("  <i>Hết phòng</i>");
  }

  if (checkIns.length === 0 && checkOuts.length === 0 && staying.length === 0) {
    lines.push("");
    lines.push("<i>Không có khách nào.</i>");
  }

  await sendMessage(chatId, lines.join("\n"));
}

// Handler /a — 1 ngày hoặc khoảng ngày
async function handleAvailability(
  chatId: number,
  args: string[], // mảng các token sau "/a"
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
) {
  if (args.length === 0) {
    await sendMessage(
      chatId,
      "❌ Thiếu ngày.\n\nVí dụ:\n<code>/a 20/06</code> — 1 ngày\n<code>/a 20/06 25/06</code> — khoảng ngày",
    );
    return;
  }

  const startRaw = args[0];
  const endRaw = args[1] ?? null;

  const startDate = parseDate(startRaw);
  if (!startDate) {
    await sendMessage(chatId, `❌ Ngày không hợp lệ: <code>${startRaw}</code>\nDùng định dạng <code>dd/mm</code>`);
    return;
  }

  // /a dd/mm — xem 1 ngày (giống /today nhưng chọn ngày)
  if (!endRaw) {
    await handleDayView(chatId, startDate, "Lịch ngày", supabase);
    return;
  }

  // /a dd/mm dd/mm — xem phòng trống khoảng ngày
  const endDate = parseDate(endRaw);
  if (!endDate) {
    await sendMessage(chatId, `❌ Ngày kết thúc không hợp lệ: <code>${endRaw}</code>\nDùng định dạng <code>dd/mm</code>`);
    return;
  }

  if (endDate <= startDate) {
    await sendMessage(chatId, "❌ Ngày kết thúc phải sau ngày bắt đầu.");
    return;
  }

  const nights = Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000,
  );

  const freeRooms = await queryRangeAvailability(supabase, startDate, endDate);

  const startDisplay = new Date(startDate + "T12:00:00+07:00").toLocaleDateString("vi-VN", {
    day: "2-digit", month: "2-digit",
  });
  const endDisplay = new Date(endDate + "T12:00:00+07:00").toLocaleDateString("vi-VN", {
    day: "2-digit", month: "2-digit",
  });

  const lines: string[] = [
    `📅 <b>Phòng trống ${startDisplay} → ${endDisplay} (${nights} đêm)</b>`,
    "",
    `✅ Còn trống: <b>${freeRooms.length}/${TOTAL_ROOMS} phòng</b>`,
    ...(freeRooms.length > 0
      ? freeRooms.map((r) => `  • ${r.id} - ${r.name}`)
      : ["  <i>Hết phòng trong khoảng này</i>"]),
  ];

  await sendMessage(chatId, lines.join("\n"));
}

// ─── /checkin — Danh sách check-in hôm nay ───────────────────────────────
async function handleCheckinList(
  chatId: number,
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
) {
  const today = todayICT();

  const { data, error } = await supabase
    .from("bookings")
    .select("room_id, guest_name, check_in, check_out, status, nights, grand_total, groups(paid)")
    .eq("check_in", today)
    .in("status", ["booked", "checked-in"])
    .eq("is_deleted", false)
    .order("room_id");

  if (error) {
    await sendMessage(chatId, "❌ Lỗi truy vấn. Thử lại nhé.");
    return;
  }

  if (!data || data.length === 0) {
    await sendMessage(chatId, `🛬 <b>Check-in hôm nay (${formatDateVN(today)})</b>\n\n✅ Không có khách check-in.`);
    return;
  }

  const lines: string[] = [`🛬 <b>Check-in hôm nay (${formatDateVN(today)})</b>\n`];

  for (const b of data) {
    const paid = (b.groups as { paid?: number } | null)?.paid ?? 0;
    const debt = (b.grand_total ?? 0) - paid;
    const statusIcon = b.status === "checked-in" ? "✅" : "⏳";
    const debtStr = debt > 0 ? ` | 💰 Còn nợ: ${formatVND(debt)}` : " | ✅ Đã trả đủ";

    lines.push(
      `${statusIcon} <b>Phòng ${b.room_id}</b> — ${b.guest_name}\n` +
      `   📆 ${formatDateVN(b.check_in)} → ${formatDateVN(b.check_out)} (${b.nights} đêm)${debtStr}`,
    );
  }

  await sendMessage(chatId, lines.join("\n"));
}

// ─── /checkout — Danh sách check-out hôm nay ─────────────────────────────
async function handleCheckoutList(
  chatId: number,
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
) {
  const today = todayICT();

  const { data, error } = await supabase
    .from("bookings")
    .select("room_id, guest_name, check_in, check_out, status, nights, grand_total, groups(paid)")
    .eq("check_out", today)
    .eq("status", "checked-in")
    .eq("is_deleted", false)
    .order("room_id");

  if (error) {
    await sendMessage(chatId, "❌ Lỗi truy vấn. Thử lại nhé.");
    return;
  }

  if (!data || data.length === 0) {
    await sendMessage(chatId, `🛫 <b>Check-out hôm nay (${formatDateVN(today)})</b>\n\n✅ Không có khách check-out.`);
    return;
  }

  const lines: string[] = [`🛫 <b>Check-out hôm nay (${formatDateVN(today)})</b>\n`];

  for (const b of data) {
    const paid = (b.groups as { paid?: number } | null)?.paid ?? 0;
    const debt = (b.grand_total ?? 0) - paid;
    const debtStr = debt > 0
      ? ` | ⚠️ Còn nợ: ${formatVND(debt)}`
      : " | ✅ Đã trả đủ";

    lines.push(
      `🚪 <b>Phòng ${b.room_id}</b> — ${b.guest_name}\n` +
      `   📆 ${formatDateVN(b.check_in)} → ${formatDateVN(b.check_out)} (${b.nights} đêm)${debtStr}`,
    );
  }

  await sendMessage(chatId, lines.join("\n"));
}

// ─── /stay — Tất cả khách đang ở hiện tại ────────────────────────────────
async function handleStay(
  chatId: number,
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
) {
  const today = todayICT();

  const { data, error } = await supabase
    .from("bookings")
    .select("room_id, guest_name, check_in, check_out, nights, grand_total, groups(paid)")
    .eq("status", "checked-in")
    .eq("is_deleted", false)
    .order("room_id");

  if (error) {
    await sendMessage(chatId, "❌ Lỗi truy vấn. Thử lại nhé.");
    return;
  }

  if (!data || data.length === 0) {
    await sendMessage(chatId, "🏨 <b>Khách đang ở</b>\n\n✅ Hiện không có khách nào.");
    return;
  }

  const lines: string[] = [`🏨 <b>Khách đang ở (${formatDateVN(today)})</b>\n`];

  for (const b of data) {
    const paid = (b.groups as { paid?: number } | null)?.paid ?? 0;
    const debt = (b.grand_total ?? 0) - paid;
    const debtStr = debt > 0 ? ` | ⚠️ Nợ ${formatVND(debt)}` : "";

    const msLeft = new Date(b.check_out).getTime() - new Date(today).getTime();
    const nightsLeft = Math.round(msLeft / 86400000);
    const nightsLeftStr = nightsLeft === 0
      ? " <b>→ Ra hôm nay!</b>"
      : nightsLeft === 1
        ? " (còn 1 đêm)"
        : ` (còn ${nightsLeft} đêm)`;

    lines.push(
      `🛏 <b>Phòng ${b.room_id}</b> — ${b.guest_name}\n` +
      `   📆 Ra ngày ${formatDateVN(b.check_out)}${nightsLeftStr}${debtStr}`,
    );
  }

  await sendMessage(chatId, lines.join("\n"));
}

// ─── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("OK", { status: 200 });

  let update: { message?: { chat: { id: number }; text?: string } };
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

  // ── /help ──
  if (text === "/start" || text === "/help") {
    await sendMessage(
      chatId,
      `🏨 <b>Hello Dalat Bot</b>\n\n` +
      `<b>📅 Lịch & phòng</b>\n` +
      `• <code>/today</code> — lịch hôm nay\n` +
      `• <code>/next</code> — lịch ngày mai\n` +
      `• <code>/a dd/mm</code> — lịch ngày cụ thể\n` +
      `• <code>/a dd/mm dd/mm</code> — phòng trống khoảng ngày\n` +
      `• <code>/checkin</code> — check-in hôm nay\n` +
      `• <code>/checkout</code> — check-out hôm nay\n` +
      `• <code>/stay</code> — khách đang ở hiện tại\n\n` +
      `<b>📋 Tasks</b>\n` +
      `• <code>/task &lt;tên&gt; [| &lt;ghi chú&gt;] [| &lt;ưu tiên&gt;]</code> — tạo task mới cho Lợi\n` +
      `  Ưu tiên: khan | cao | bt | thap (mặc định: bt)\n` +
      `  VD: <code>/task Dọn 101 | Thay khăn | cao</code>\n` +
      `• <code>/tasks</code> — xem tasks hôm nay\n` +
      `• <code>/done &lt;số&gt;</code> — đánh dấu hoàn thành\n` +
      `• <code>/skip &lt;số&gt;</code> — bỏ qua task\n` +
      `• <code>/extend &lt;số&gt; &lt;dd/mm&gt;</code> — dời ngày`,
    );
    return new Response("OK", { status: 200 });
  }

  // Khởi tạo Supabase (dùng chung cho các lệnh cần DB)
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── /task <nội dung> ──
  if (text.startsWith("/task ") || text === "/task") {
    const rawText = text.slice(6).trim(); // bỏ "/task "
    await handleTask(chatId, rawText);
    return new Response("OK", { status: 200 });
  }

  // ── /tasks ──
  if (text === "/tasks") {
    await handleTasks(chatId, supabase);
    return new Response("OK", { status: 200 });
  }

  // ── /done <số> ──
  if (text.startsWith("/done")) {
    const parts = text.split(/\s+/);
    await handleDone(chatId, parts[1] ?? "", supabase);
    return new Response("OK", { status: 200 });
  }

  // ── /skip <số> ──
  if (text.startsWith("/skip")) {
    const parts = text.split(/\s+/);
    await handleSkip(chatId, parts[1] ?? "", supabase);
    return new Response("OK", { status: 200 });
  }

  // ── /extend <số> <ngày> ──
  if (text.startsWith("/extend")) {
    const parts = text.split(/\s+/).slice(1); // bỏ "/extend"
    await handleExtend(chatId, parts, supabase);
    return new Response("OK", { status: 200 });
  }

  // ── /today ──
  if (text === "/today") {
    await handleDayView(chatId, todayICT(), "Hôm nay", supabase);
    return new Response("OK", { status: 200 });
  }

  // ── /checkin ──
  if (text === "/checkin") {
    await handleCheckinList(chatId, supabase);
    return new Response("OK", { status: 200 });
  }

  // ── /checkout ──
  if (text === "/checkout") {
    await handleCheckoutList(chatId, supabase);
    return new Response("OK", { status: 200 });
  }

  // ── /stay ──
  if (text === "/stay") {
    await handleStay(chatId, supabase);
    return new Response("OK", { status: 200 });
  }

  // ── /next ──
  if (text === "/next") {
    const tomorrow = new Date(Date.now() + 7 * 3600000 + 86400000)
      .toISOString().split("T")[0];
    await handleDayView(chatId, tomorrow, "Ngày mai", supabase);
    return new Response("OK", { status: 200 });
  }

  // ── /a [dd/mm] [dd/mm] ──
  if (text.startsWith("/a")) {
    const args = text.slice(2).trim().split(/\s+/).filter(Boolean);
    await handleAvailability(chatId, args, supabase);
    return new Response("OK", { status: 200 });
  }

  // ── Unknown ──
  await sendMessage(chatId, `❓ Lệnh không nhận ra.\nGõ <code>/help</code> để xem danh sách.`);
  return new Response("OK", { status: 200 });
});
