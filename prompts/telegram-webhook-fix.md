# Patch: supabase/functions/telegram-webhook/index.ts
# Fix A: handleIssue gọi RPC log_room_issue_txn (atomic)
# Fix B: saveSession / loadSession đúng schema telegram_task_sessions

Tìm và thay thế chính xác các block sau trong file
`supabase/functions/telegram-webhook/index.ts`:

---

## PATCH 1 — handleIssue (dòng ~459–501)

### TÌM (toàn bộ function handleIssue):

```typescript
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
```

### THAY BẰNG:

```typescript
/** /issue <room_id> <mô tả> — log sự cố phòng (atomic qua RPC) */
async function handleIssue(chatId: string, args: string[]) {
  if (args.length < 2) {
    return sendMessage(chatId, "❌ Thiếu thông tin. Dùng: /issue 101 Máy lạnh không lạnh");
  }

  const roomId      = args[0];
  const description = args.slice(1).join(" ");

  // Gọi RPC log_room_issue_txn — gộp INSERT room_issues + UPDATE housekeeping_note
  // trong 1 transaction, tránh inconsistent state nếu 1 trong 2 bước fail
  const { error } = await supabase.rpc("log_room_issue_txn", {
    p_room_id:     roomId,
    p_description: description,
    p_reported_by: "staff_telegram",
  });

  if (error) {
    // P0050 = ROOM_NOT_FOUND từ RPC
    if (error.code === "P0050") {
      return sendMessage(chatId, `❌ Phòng ${roomId} không tồn tại.`);
    }
    return sendMessage(chatId, `❌ Lỗi: ${error.message}`);
  }

  return sendMessage(
    chatId,
    `⚠️ Đã ghi sự cố <b>P${roomId}</b>:\n"${description}"\n\nHiếu sẽ xử lý sớm.`
  );
}
```

---

## PATCH 2 — saveSession (dòng ~547–557)

### TÌM (toàn bộ function saveSession):

```typescript
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
```

### THAY BẰNG:

```typescript
async function saveSession(_chatId: string, tasks: NotionTask[]): Promise<void> {
  // Schema thật: (session_date, task_index, notion_page_id, task_name)
  // Không có cột chat_id hay session_data — pattern: delete ngày hôm nay rồi insert lại
  const today = todayVN();

  await supabase
    .from("telegram_task_sessions")
    .delete()
    .eq("session_date", today);

  if (!tasks.length) return;

  const rows = tasks.map((t, i) => ({
    session_date:   today,
    task_index:     i + 1,
    notion_page_id: t.id,
    task_name:      (t.properties?.["Task Name"] as any)?.title?.[0]?.plain_text ?? `Task ${i + 1}`,
  }));

  await supabase.from("telegram_task_sessions").insert(rows);
}
```

---

## PATCH 3 — loadSession (dòng ~559–566)

### TÌM (toàn bộ function loadSession):

```typescript
async function loadSession(chatId: string): Promise<{ idx: number; pageId: string; name: string }[]> {
  const { data } = await supabase
    .from("telegram_task_sessions")
    .select("session_data")
    .eq("chat_id", chatId)
    .single();
  return (data?.session_data as { idx: number; pageId: string; name: string }[]) ?? [];
}
```

### THAY BẰNG:

```typescript
async function loadSession(_chatId: string): Promise<{ idx: number; pageId: string; name: string }[]> {
  // Query theo session_date hôm nay (không có cột chat_id trong schema)
  const today = todayVN();

  const { data } = await supabase
    .from("telegram_task_sessions")
    .select("task_index, notion_page_id, task_name")
    .eq("session_date", today)
    .order("task_index");

  return (data ?? []).map((row) => ({
    idx:    row.task_index,
    pageId: row.notion_page_id,
    name:   row.task_name ?? `Task ${row.task_index}`,
  }));
}
```

---

## Sau khi sửa xong, deploy:

```bash
supabase functions deploy telegram-webhook --no-verify-jwt
git add supabase/functions/telegram-webhook/index.ts
git commit -m "fix: telegram /issue gọi RPC log_room_issue_txn; fix saveSession/loadSession schema (Fix #6)"
git push
```