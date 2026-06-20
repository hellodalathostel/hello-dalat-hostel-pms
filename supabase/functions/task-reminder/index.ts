import "@supabase/functions-js/edge-runtime.d.ts";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;
const NOTION_TOKEN = Deno.env.get("NOTION_TOKEN")!;
const NOTION_TASK_DB_ID = Deno.env.get("NOTION_TASK_DB_ID")!;

// Gửi tin Telegram
async function sendTelegram(text: string) {
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    },
  );
  return res.ok;
}

// Query Notion tasks hôm nay chưa xong
async function queryTodayTasks(): Promise<
  Array<{ id: string; name: string; loai: string; uu_tien: string; ghi_chu: string }>
> {
  // Ngày hôm nay theo Asia/Ho_Chi_Minh (UTC+7)
  const now = new Date();
  const ictOffset = 7 * 60 * 60 * 1000;
  const ictDate = new Date(now.getTime() + ictOffset);
  const today = ictDate.toISOString().split("T")[0]; // YYYY-MM-DD

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
            {
              property: "Ngày Thực Hiện",
              date: { equals: today },
            },
            {
              property: "Trạng Thái",
              select: { does_not_equal: "Hoàn Thành" },
            },
            {
              property: "Trạng Thái",
              select: { does_not_equal: "Bỏ Qua" },
            },
          ],
        },
        sorts: [
          // Sắp xếp: Khẩn → Cao → Bình Thường → Thấp
          {
            property: "Ưu Tiên",
            direction: "ascending",
          },
        ],
      }),
    },
  );

  if (!res.ok) {
    console.error("Notion query failed:", await res.text());
    return [];
  }

  const data = await res.json();
  return (data.results ?? []).map((page: Record<string, unknown>) => {
    const props = page.properties as Record<string, unknown>;
    const titleArr = (props["Tên Task"] as { title: Array<{ plain_text: string }> })?.title ?? [];
    const name = titleArr.map((t) => t.plain_text).join("") || "(Không tên)";
    const loai = (props["Loại"] as { select?: { name: string } })?.select?.name ?? "";
    const uu_tien = (props["Ưu Tiên"] as { select?: { name: string } })?.select?.name ?? "Bình Thường";
    const ghi_chu = (props["Ghi Chú"] as { rich_text: Array<{ plain_text: string }> })?.rich_text
      ?.map((t) => t.plain_text)
      .join("") ?? "";
    return { id: page.id as string, name, loai, uu_tien, ghi_chu };
  });
}

// Lưu mapping idx → notion_page_id vào Supabase
async function saveSession(
  tasks: Array<{ id: string; name: string }>,
) {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Xóa session cũ hơn 2 ngày
  await supabase
    .from("telegram_task_sessions")
    .delete()
    .lt("session_date", new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0]);

  if (tasks.length === 0) return;

  // Upsert session mới
  const rows = tasks.map((t, i) => ({
    session_date: new Date(Date.now() + 7 * 3600000).toISOString().split("T")[0],
    task_index: i + 1,
    notion_page_id: t.id,
    task_name: t.name,
  }));

  const { error } = await supabase
    .from("telegram_task_sessions")
    .upsert(rows, { onConflict: "session_date,task_index" });

  if (error) console.error("saveSession error:", error.message);
}

// Icon ưu tiên
const PRIORITY_ICON: Record<string, string> = {
  "Khẩn": "🔴",
  "Cao": "🟠",
  "Bình Thường": "🔵",
  "Thấp": "⚪",
};

// Icon loại
const TYPE_ICON: Record<string, string> = {
  "Dọn Phòng": "🧹",
  "Check-in/out": "🔑",
  "Bảo Trì": "🔧",
  "Mua Sắm": "🛒",
  "Admin": "📋",
  "Khác": "📌",
};

Deno.serve(async (_req) => {
  try {
    const tasks = await queryTodayTasks();

    if (tasks.length === 0) {
      await sendTelegram("✅ <b>Hôm nay không có task nào.</b> Nghỉ ngơi đi nào! 😄");
      return new Response("OK");
    }

    // Lưu session mapping
    await saveSession(tasks);

    // Build message
    const now = new Date(Date.now() + 7 * 3600000);
    const dateStr = now.toLocaleDateString("vi-VN", {
      weekday: "long", day: "2-digit", month: "2-digit",
    });

    const lines: string[] = [
      `📋 <b>Task hôm nay — ${dateStr}</b>`,
      `<i>Còn ${tasks.length} task cần làm</i>`,
      "",
    ];

    tasks.forEach((t, i) => {
      const pIcon = PRIORITY_ICON[t.uu_tien] ?? "🔵";
      const tIcon = TYPE_ICON[t.loai] ?? "📌";
      const loaiLabel = t.loai ? ` [${t.loai}]` : "";
      lines.push(`${pIcon} <b>${i + 1}.</b> ${tIcon}${loaiLabel} ${t.name}`);
      if (t.ghi_chu) lines.push(`   <i>${t.ghi_chu}</i>`);
    });

    lines.push("");
    lines.push(`💡 <b>Lệnh quản lý:</b>`);
    lines.push(`• <code>/done &lt;số&gt;</code> — hoàn thành task`);
    lines.push(`• <code>/skip &lt;số&gt;</code> — bỏ qua task`);
    lines.push(`• <code>/extend &lt;số&gt; &lt;dd/mm&gt;</code> — dời ngày`);
    lines.push(`• <code>/tasks</code> — xem lại danh sách`);

    await sendTelegram(lines.join("\n"));
    return new Response("OK");
  } catch (e) {
    console.error("task-reminder error:", e);
    return new Response("Error", { status: 500 });
  }
});
