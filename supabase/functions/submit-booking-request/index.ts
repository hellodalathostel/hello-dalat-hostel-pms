import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { todayVN, isValidDateOnly, nightsBetween } from "../_shared/date-utils.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// VietQR config
const VIETQR_BANK = "VCB";
const VIETQR_ACCT = "9969975935";
const VIETQR_NAME = "NGUYEN THANH HIEU"; // ASCII - khong dau

serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { name, phone, email, room_id, check_in, check_out, note, website } = body as {
    name?: string;
    phone?: string;
    email?: string;
    room_id?: string;
    check_in?: string;
    check_out?: string;
    note?: string;
    website?: string;
  };

  // Honeypot — bot tu dien field an, nguoi dung thuc khong thay
  if (website && website.trim() !== "") {
    return json({ success: true }, 200);
  }

  // Length validation
  if (
    (name && name.length > 120) ||
    (phone && phone.length > 30) ||
    (email && email.length > 254) ||
    (note && note.length > 1000)
  ) {
    return json({ error: "Invalid input length" }, 400);
  }

  // Validate bat buoc
  const errors: string[] = [];
  if (!name?.trim()) errors.push("name bat buoc");
  if (!phone?.trim()) errors.push("phone bat buoc");
  if (!room_id?.trim()) errors.push("room_id bat buoc");
  if (!check_in) errors.push("check_in bat buoc");
  if (!check_out) errors.push("check_out bat buoc");

  if (errors.length) return json({ error: errors.join(", ") }, 400);

  // Validate dates (Asia/Ho_Chi_Minh)
  if (!isValidDateOnly(check_in!) || !isValidDateOnly(check_out!)) {
    return json({ error: "Invalid date format" }, 400);
  }

  const today = todayVN();
  if (check_in! < today) {
    return json({ error: "Check-in date is in the past" }, 400);
  }

  const nights = nightsBetween(check_in!, check_out!);
  if (nights <= 0) {
    return json({ error: "Check-out must be after check-in" }, 400);
  }

  // Supabase client (service_role de bypass RLS khi INSERT)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Kiem tra room ton tai
  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("id, name")
    .eq("id", room_id!)
    .single();

  if (roomErr || !room) {
    return json({ error: "Phong khong ton tai" }, 400);
  }

  // Kiem tra conflict booking that (booked / checked-in)
  // Overlap: existing.check_in < req.check_out AND existing.check_out > req.check_in
  const { data: conflicts } = await supabase
    .from("bookings")
    .select("id")
    .eq("room_id", room_id!)
    .in("status", ["booked", "checked-in"])
    .lt("check_in", check_out!)
    .gt("check_out", check_in!)
    .limit(1);

  // Chi canh bao soft - khong block (Hieu quyet dinh khi convert)
  const has_conflict = (conflicts?.length ?? 0) > 0;

  // INSERT booking_request
  const { data: inserted, error: insertErr } = await supabase
    .from("booking_requests")
    .insert({
      name: name!.trim(),
      phone: phone!.trim(),
      email: email?.trim() || null,
      room_id: room_id!,
      check_in: check_in!,
      check_out: check_out!,
      note: note?.trim() || null,
      status: "pending",
    })
    .select("id, created_at")
    .single();

  if (insertErr || !inserted) {
    console.error("Insert error:", insertErr);
    return json({ error: "Khong the tao yeu cau dat phong" }, 500);
  }

  // Query gia phong theo check_in (get_suggested_price tra INTEGER)
  const { data: suggestedPrice, error: priceErr } = await supabase
    .rpc('get_suggested_price', {
      p_room_id: room_id!,
      p_date: check_in!,
    });

  // Neu khong lay duoc gia → fallback 0 (QR van hien, khach lien he xac nhan)
  const deposit = (!priceErr && typeof suggestedPrice === 'number' && suggestedPrice > 0)
    ? suggestedPrice  // coc = 1 dem dau
    : 0;

  // Build VietQR URL (amount tinh bang dong VND)
  const addInfo = encodeURIComponent(
    `Dat phong ${room_id} ${check_in!.replace(/-/g, '')}`,
  );
  const vietqr_url =
    `https://img.vietqr.io/image/${VIETQR_BANK}-${VIETQR_ACCT}-compact2.png` +
    `?amount=${deposit}` +
    `&accountName=${encodeURIComponent(VIETQR_NAME)}&addInfo=${addInfo}`;

  // Thong bao Telegram (khong chan response cho khach neu loi)
  const lines = [
    "🔔 <b>Yêu cầu đặt phòng mới</b> (landing page)",
    "",
    `Khách: ${escapeHtml(name!.trim())}`,
    `SĐT: ${escapeHtml(phone!.trim())}`,
  ];
  if (email?.trim()) lines.push(`Email: ${escapeHtml(email.trim())}`);
  lines.push(
    `Phòng: ${escapeHtml(room.id)} (${escapeHtml(room.name)})`,
    `Ngày: ${fmtDate(check_in!)} → ${fmtDate(check_out!)} (${nights} đêm)`,
    `Cọc gợi ý: ${deposit > 0 ? fmtVnd(deposit) : "chưa có giá"}`,
  );
  if (has_conflict) {
    lines.push("", "⚠️ Phòng này đã có booking trùng ngày, kiểm tra trước khi xác nhận");
  }
  if (note?.trim()) lines.push("", `Ghi chú: ${escapeHtml(note.trim())}`);
  lines.push("", `Mở PMS để xác nhận hoặc từ chối: ${PMS_URL}`);
  await notifyTelegram(lines.join("\n"));

  return json({
    success: true,
    request_id: inserted.id,
    has_conflict,
    deposit,   // thêm để frontend có thể hiển thị số tiền cọc bằng text
    nights,
    vietqr: {
      url: vietqr_url,
      bank: 'Vietcombank',
      account: VIETQR_ACCT,
      account_name: VIETQR_NAME,
      note: `Dat phong ${room_id} ${check_in!.replace(/-/g, '')}`,
    },
  });
});

// ---------- Telegram thong bao (bot van hanh) ----------
const PMS_URL = "https://hello-dalat-hostel-pms.vercel.app";

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

// Khong bao gio throw: loi Telegram khong duoc lam hong yeu cau dat phong da luu.
async function notifyTelegram(text: string): Promise<void> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId) {
    console.error("[telegram] thieu TELEGRAM_BOT_TOKEN hoac TELEGRAM_CHAT_ID");
    return;
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
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      console.error(`[telegram] sendMessage that bai: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    console.error(`[telegram] fetch loi: ${raw.replaceAll(token, "***")}`);
  }
}

// Helper
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}