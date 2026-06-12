import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  const { name, phone, email, room_id, check_in, check_out, note } = body as {
    name?: string;
    phone?: string;
    email?: string;
    room_id?: string;
    check_in?: string;
    check_out?: string;
    note?: string;
  };

  // Validate bat buoc
  const errors: string[] = [];
  if (!name?.trim()) errors.push("name bat buoc");
  if (!phone?.trim()) errors.push("phone bat buoc");
  if (!room_id?.trim()) errors.push("room_id bat buoc");
  if (!check_in) errors.push("check_in bat buoc");
  if (!check_out) errors.push("check_out bat buoc");

  if (errors.length) return json({ error: errors.join(", ") }, 400);

  // Validate dates
  const d_in = new Date(check_in!);
  const d_out = new Date(check_out!);
  if (Number.isNaN(d_in.getTime()) || Number.isNaN(d_out.getTime())) {
    return json({ error: "Ngay khong hop le" }, 400);
  }

  if (d_out <= d_in) {
    return json({ error: "check_out phai sau check_in" }, 400);
  }

  // Khong nhan ngay qua khu
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d_in < today) {
    return json({ error: "check_in khong the la ngay trong qua khu" }, 400);
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

  // Tinh so dem
  const nights = Math.round((d_out.getTime() - d_in.getTime()) / (1000 * 60 * 60 * 24));

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

// Helper
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}