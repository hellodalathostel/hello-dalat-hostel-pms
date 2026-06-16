## Task: Update telegram-webhook to v31

### Changes in supabase/functions/telegram-webhook/index.ts

---

### 1. Replace handleToday

Replace the entire handleToday function with:

async function handleToday(chatId: string) {
  const today = todayVN();

  const { data, error } = await supabase
    .from("bookings")
    .select("room_id, guest_name, check_in, check_out, status, grand_total, groups(paid)")
    .or(`check_in.eq.${today},check_out.eq.${today},status.eq.checked-in`)
    .neq("status", "cancelled")
    .order("room_id");

  if (error) return sendMessage(chatId, `❌ Lỗi: ${error.message}`);
  if (!data?.length) return sendMessage(chatId, `📅 Hôm nay (${formatDateVN(today)}) không có hoạt động.`);

  const checkins  = data.filter((b) => b.check_in === today && b.status !== "checked-in");
  const checkouts = data.filter((b) => b.check_out === today);
  const staying   = data.filter((b) => b.status === "checked-in" && b.check_in !== today && b.check_out !== today);

  let msg = `📅 <b>Hôm nay ${formatDateVN(today)}</b>\n`;

  if (checkins.length) {
    msg += `\n🟢 <b>Check-in (${checkins.length})</b>\n`;
    for (const b of checkins) {
      const paid = (b.groups as any)?.paid ?? 0;
      const debt = (b.grand_total as number ?? 0) - paid;
      msg += `  P${b.room_id} — ${b.guest_name} → out ${formatDateVN(b.check_out)}`;
      if (debt > 0) msg += ` | Còn: ${formatVND(debt)}`;
      msg += "\n";
    }
  }

  if (checkouts.length) {
    msg += `\n🔴 <b>Check-out (${checkouts.length})</b>\n`;
    for (const b of checkouts) {
      const paid = (b.groups as any)?.paid ?? 0;
      const debt = (b.grand_total as number ?? 0) - paid;
      msg += `  P${b.room_id} — ${b.guest_name}`;
      if (b.status === "checked-out") msg += " ✅";
      else if (debt > 0) msg += ` | ⚠️ Còn nợ: ${formatVND(debt)}`;
      msg += "\n";
    }
  }

  if (staying.length) {
    msg += `\n🏠 <b>Đang ở (${staying.length})</b>\n`;
    for (const b of staying) {
      const paid = (b.groups as any)?.paid ?? 0;
      const debt = (b.grand_total as number ?? 0) - paid;
      msg += `  P${b.room_id} — ${b.guest_name} → out ${formatDateVN(b.check_out)}`;
      if (debt > 0) msg += ` | Còn: ${formatVND(debt)}`;
      msg += "\n";
    }
  }

  return sendMessage(chatId, msg.trim());
}

---

### 2. Replace handleNext

Replace the entire handleNext function with:

async function handleNext(chatId: string) {
  const today = todayVN();
  const d = new Date(today + "T00:00:00+07:00");
  d.setDate(d.getDate() + 1);
  const tomorrow = d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

  const { data, error } = await supabase
    .from("bookings")
    .select("room_id, guest_name, check_in, check_out, status, grand_total, groups(paid)")
    .or(`check_in.eq.${tomorrow},check_out.eq.${tomorrow},and(status.eq.checked-in,check_in.lt.${tomorrow},check_out.gt.${tomorrow})`)
    .neq("status", "cancelled")
    .order("room_id");

  if (error) return sendMessage(chatId, `❌ Lỗi: ${error.message}`);
  if (!data?.length) return sendMessage(chatId, `📅 Ngày mai (${formatDateVN(tomorrow)}) không có hoạt động.`);

  const checkins  = data.filter((b) => b.check_in === tomorrow);
  const checkouts = data.filter((b) => b.check_out === tomorrow);
  const staying   = data.filter((b) => b.status === "checked-in" && b.check_in !== tomorrow && b.check_out !== tomorrow);

  let msg = `📅 <b>Ngày mai ${formatDateVN(tomorrow)}</b>\n`;

  if (checkins.length) {
    msg += `\n🟢 <b>Check-in (${checkins.length})</b>\n`;
    for (const b of checkins) {
      msg += `  P${b.room_id} — ${b.guest_name} → out ${formatDateVN(b.check_out)}\n`;
    }
  }

  if (checkouts.length) {
    msg += `\n🔴 <b>Check-out (${checkouts.length})</b>\n`;
    for (const b of checkouts) {
      const paid = (b.groups as any)?.paid ?? 0;
      const debt = (b.grand_total as number ?? 0) - paid;
      msg += `  P${b.room_id} — ${b.guest_name}`;
      if (debt > 0) msg += ` | ⚠️ Còn nợ: ${formatVND(debt)}`;
      msg += "\n";
    }
  }

  if (staying.length) {
    msg += `\n🏠 <b>Đang ở (${staying.length})</b>\n`;
    for (const b of staying) {
      msg += `  P${b.room_id} — ${b.guest_name} → out ${formatDateVN(b.check_out)}\n`;
    }
  }

  return sendMessage(chatId, msg.trim());
}

---

### 3. Replace handleAll → handleAvailable

Replace the entire handleAll function with:

async function handleAll(chatId: string, args: string[]) {
  // Parse args: /a dd/mm hoặc /a dd/mm dd/mm
  // Nếu không có arg → show tất cả booking active (fallback cũ)
  const currentYear = new Date().getFullYear();

  function parseDate(str: string): string | null {
    const m = str.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (!m) return null;
    const day = m[1].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    return `${currentYear}-${month}-${day}`;
  }

  // Không có arg → active bookings
  if (!args.length) {
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

  // 1 arg: /a dd/mm → phòng trống ngày đó
  // 2 args: /a dd/mm dd/mm → phòng trống giai đoạn
  const dateFrom = parseDate(args[0]);
  const dateTo   = args[1] ? parseDate(args[1]) : dateFrom;

  if (!dateFrom || !dateTo) {
    return sendMessage(chatId, "❌ Sai định dạng. Dùng: /a 17/06 hoặc /a 17/06 20/06");
  }

  // Lấy tất cả phòng active
  const { data: rooms } = await supabase
    .from("rooms")
    .select("id, name")
    .eq("is_active", true)
    .order("id");

  // Lấy bookings có overlap với khoảng [dateFrom, dateTo]
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("room_id")
    .neq("status", "cancelled")
    .lt("check_in", dateTo)    // check_in < dateTo
    .gt("check_out", dateFrom); // check_out > dateFrom

  if (error) return sendMessage(chatId, `❌ Lỗi: ${error.message}`);

  const occupiedRooms = new Set((bookings ?? []).map((b) => b.room_id));
  const available = (rooms ?? []).filter((r) => !occupiedRooms.has(r.id));

  const label = dateFrom === dateTo
    ? formatDateVN(dateFrom)
    : `${formatDateVN(dateFrom)} → ${formatDateVN(dateTo)}`;

  if (!available.length) {
    return sendMessage(chatId, `🏨 <b>Phòng trống ${label}</b>\n\nKhông có phòng trống.`);
  }

  let msg = `🏨 <b>Phòng trống ${label} (${available.length}/${rooms?.length})</b>\n\n`;
  for (const r of available) {
    msg += `✅ P${r.id}\n`;
  }
  return sendMessage(chatId, msg.trim());
}

---

### 4. Add handleCreateTask and replace handleTask

Add this new function BEFORE handleTask:

async function handleCreateTask(chatId: string, args: string[]) {
  // Format: /task -N [nội dung] [urgency: cao/tb/thap]
  // Urgency cuối cùng nếu là từ khoá: cao, tb, thap, high, medium, low
  if (!args.length) {
    return sendMessage(chatId, "❌ Dùng: /task -1 Dọn phòng 101 cao\nUrgency: cao / tb / thap");
  }

  const URGENCY_MAP: Record<string, string> = {
    cao: "High", high: "High",
    tb: "Medium", medium: "Medium",
    thap: "Low", low: "Low",
  };

  // Parse số thứ tự (-N)
  let priority = "";
  let contentArgs = [...args];
  if (args[0].startsWith("-")) {
    priority = args[0]; // e.g. -1, -2
    contentArgs = args.slice(1);
  }

  // Parse urgency (từ cuối)
  let urgency = "Medium";
  const lastWord = contentArgs[contentArgs.length - 1]?.toLowerCase();
  if (lastWord && URGENCY_MAP[lastWord]) {
    urgency = URGENCY_MAP[lastWord];
    contentArgs = contentArgs.slice(0, -1);
  }

  const taskName = (priority ? `${priority} ` : "") + contentArgs.join(" ");
  if (!taskName.trim()) {
    return sendMessage(chatId, "❌ Thiếu nội dung task.");
  }

  const NOTION_TOKEN = Deno.env.get("NOTION_TOKEN")!;
  const NOTION_DB_ID = Deno.env.get("NOTION_TASK_DB_ID")!;
  const today = todayVN();

  const res = await fetch(`https://api.notion.com/v1/pages`, {
    method: "POST",
    headers: {
      Authorization:    `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type":   "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: NOTION_DB_ID },
      properties: {
        "Task Name": { title: [{ text: { content: taskName } }] },
        "Date":      { date: { start: today } },
        "Priority":  { select: { name: urgency } },
        "Status":    { status: { name: "Not started" } },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    return sendMessage(chatId, `❌ Lỗi tạo task: ${err.message ?? res.status}`);
  }

  const icons: Record<string, string> = { High: "🔴", Medium: "🟡", Low: "🟢" };
  return sendMessage(
    chatId,
    `${icons[urgency]} Task đã tạo:\n<b>${taskName}</b>\nUrgency: ${urgency}`
  );
}

Replace the entire handleTask function with:

async function handleTask(chatId: string, args: string[]) {
  // Nếu có args → tạo task mới
  if (args.length) {
    return handleCreateTask(chatId, args);
  }
  // Không có args → xem tasks hôm nay (giống /tasks)
  return handleTaskList(chatId);
}

Rename the current handleTask function body (the one that fetches Notion tasks) to handleTaskList:

async function handleTaskList(chatId: string) {
  // [nội dung handleTask cũ giữ nguyên - chỉ đổi tên]
}

---

### 5. Update router — replace command handlers

In the serve() router section, replace:
    else if (command === "/a")        await handleAll(chatId);
with:
    else if (command === "/a")        await handleAll(chatId, args);

Replace:
    else if (command === "/task")     await handleTask(chatId);
with:
    else if (command === "/task")     await handleTask(chatId, args);

Replace:
    else if (command === "/tasks")    await handleTasks(chatId);
with:
    else if (command === "/tasks")    await handleTaskList(chatId);

Also update handleTasks to call handleTaskList:
    async function handleTasks(chatId: string) {
      return handleTaskList(chatId);
    }

---

### 6. Update /help message

Replace the help text section with:

  const msg = `
🤖 <b>Hello Dalat Bot — Lệnh</b>

📅 <b>Lịch</b>
/today — check-in, check-out, đang ở hôm nay
/next — check-in, check-out, đang ở ngày mai
/a — tất cả booking active
/a [dd/mm] — phòng trống ngày cụ thể
/a [dd/mm] [dd/mm] — phòng trống giai đoạn
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
/task -N [nội dung] [urgency] — tạo task mới
/tasks — xem tasks hôm nay
/done [N] — đánh dấu xong
/skip [N] — bỏ qua task
/extend [N] — dời sang ngày mai

/help — xem lệnh này
`.trim();

---

### 7. Deploy

After all changes:
  supabase functions deploy telegram-webhook --no-verify-jwt