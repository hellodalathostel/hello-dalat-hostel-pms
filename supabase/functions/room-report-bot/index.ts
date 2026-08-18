// @ts-nocheck
import { reportRun } from "../_shared/heartbeat.ts";

const JOB = "room-report-bot";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
const TOTAL_ROOMS_FALLBACK = 8;

Deno.serve(async () => {
  const t0 = performance.now();

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const yd = new Date();
    yd.setDate(yd.getDate() - 1);
    const yesterday = yd.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

    const sel = "room_id, check_in, check_out, status, guests_count, guest_name, groups ( source ), rooms ( name )";

    // occupied: MOI phong co khach hom nay. Gop 2 nhanh cu (staying + check-in)
    // thanh 1 query. Ban cu tach check_in<today+checked-in va check_in=today+booked
    // -> walk-in check_in=today nhung status da checked-in lot khoi ca 2 nhanh,
    // gay undercount occupancy va an mat khach khoi muc CHECK-IN.
    // Phat hien 30/07/2026 (bao 4/8 trong khi thuc te 6/8). Xem brain.decisions.
    const [occ_, co, pay, roomsRes] = await Promise.all([
      supabase.from("bookings").select(sel).lte("check_in", today).gt("check_out", today).in("status", ["booked", "checked-in"]).eq("is_deleted", false).order("room_id"),
      supabase.from("bookings").select(sel).eq("check_out", today).eq("status", "checked-in").eq("is_deleted", false).order("room_id"),
      supabase.from("payment_history").select("amount, method").eq("date", yesterday).eq("is_void", false),
      supabase.from("rooms").select("id").eq("is_active", true),
    ]);

    if (occ_.error || co.error || pay.error || roomsRes.error) {
      const e = occ_.error ?? co.error ?? pay.error ?? roomsRes.error;
      throw new Error(`Query that bai: ${e.message}`);
    }

    const occupiedRows = occ_.data ?? [];
    // Arrivals hom nay: con cua occupiedRows, du booked hay da checked-in
    const ci = occupiedRows.filter((b) => b.check_in === today);
    // Dang luu tru = da o tu hom truoc
    const st = occupiedRows.filter((b) => b.check_in < today);

    const fmt = (b) => {
      const room = b.rooms?.name ?? b.room_id;
      const name = b.guest_name ?? "Chua dat ten";
      const guests = b.guests_count ?? 1;
      const src = b.groups?.source ?? "";
      const sp = src ? " [" + src + "]" : "";
      return "  • " + room + " — " + name + " (" + guests + " khách)" + sp;
    };

    const payData = pay.data ?? [];
    const totalRev = payData.reduce((s, p) => s + (p.amount ?? 0), 0);
    const byMethod = {};
    for (const p of payData) byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;

    const fmtVND = (n) => n.toLocaleString("vi-VN") + "đ";
    const mLines = Object.entries(byMethod).map(([m, a]) => "  • " + m + ": " + fmtVND(a));

    const TOTAL_ROOMS = roomsRes.data?.length ?? TOTAL_ROOMS_FALLBACK;
    const occSet = new Set(occupiedRows.map((b) => b.room_id));
    const occ = occSet.size;
    const pct = TOTAL_ROOMS > 0 ? Math.round((occ / TOTAL_ROOMS) * 100) : 0;

    // ─── Peer check: giám sát ngược ops-guardian ─────────────────────────────
    // task-reminder (job duy nhất gọi check_peer_job) đã tắt 18/08/2026, nên
    // ops-guardian không còn ai giám sát. Nhét vào đây: nếu guardian im lặng
    // hoặc lỗi thì cảnh báo ngay trên tin báo cáo sáng — không tốn tin nhắn mới.
    // Bọc try/catch: quan trắc KHÔNG được làm chết báo cáo nghiệp vụ.
    let peerHealthy = null;
    let peerIssue = null;
    try {
      const { data: peer, error: peerErr } = await supabase.rpc("check_peer_job", {
        p_job_name: "ops-guardian",
      });
      if (peerErr) {
        console.error("check_peer_job that bai:", peerErr.message);
      } else if (peer) {
        peerHealthy = peer.healthy === true;
        peerIssue = peer.issue ?? null;
      }
    } catch (e) {
      console.error("check_peer_job exception:", e instanceof Error ? e.message : String(e));
    }

    const dLabel = new Date().toLocaleDateString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit", month: "2-digit", year: "numeric",
    });
    const ydLabel = new Date(yesterday + "T12:00:00+07:00").toLocaleDateString("vi-VN", {
      day: "2-digit", month: "2-digit",
    });

    const lines = [
      "📋 <b>Báo cáo — " + dLabel + "</b>",
      "",
      "🟢 <b>CHECK-IN hôm nay (" + ci.length + ")</b>",
      ...(ci.length > 0 ? ci.map(fmt) : ["  <i>Không có</i>"]),
      "",
      "🔴 <b>CHECK-OUT hôm nay (" + (co.data?.length ?? 0) + ")</b>",
      ...((co.data?.length ?? 0) > 0 ? co.data.map(fmt) : ["  <i>Không có</i>"]),
      "",
      "🏠 <b>ĐANG LƯU TRÚ (" + st.length + ")</b>",
      ...(st.length > 0 ? st.map(fmt) : ["  <i>Không có</i>"]),
      "",
      "💰 <b>TIỀN THU ĐƯỢC " + ydLabel + "</b>",
      "  • Tổng: <b>" + fmtVND(totalRev) + "</b>",
      "  <i>(tiền thực thu từ payment_history)</i>",
      ...(mLines.length > 0 ? mLines : ["  • <i>Chưa có giao dịch</i>"]),
      "",
      "📊 Công suất hôm nay: " + occ + "/" + TOTAL_ROOMS + " phòng (" + pct + "%)",
    ];

    // Cảnh báo lên ĐẦU tin: nếu hệ giám sát chết thì đây là thứ phải đọc trước.
    // peerIssue là enum nội bộ ('never_run' | 'error' | 'silent' | 'not_registered'),
    // không chứa ký tự < > nên an toàn với parse_mode HTML.
    if (peerHealthy === false) {
      lines.unshift(
        "🔴 <b>CẢNH BÁO: ops-guardian đang lỗi (" + (peerIssue ?? "unknown") + ")</b>",
        "<i>Hệ giám sát tự động không hoạt động — kiểm tra automation.guardian_alerts</i>",
        "",
      );
    }

    const tgRes = await fetch(
      "https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text: lines.join("\n"), parse_mode: "HTML" }),
      },
    );

    if (!tgRes.ok) {
      const err = await tgRes.text();
      throw new Error(`Telegram sendMessage that bai: ${tgRes.status} ${err}`);
    }

    await reportRun(JOB, "ok", t0, {
      occupancy_pct: pct,
      revenue: totalRev,
      check_ins: ci.length,
      staying: st.length,
      peer_checked: peerHealthy !== null,
      peer_healthy: peerHealthy,
    });

    return new Response(
      JSON.stringify({ ok: true, date: today, revenue: totalRev, occupancy: pct, check_ins: ci.length, staying: st.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${JOB} error:`, msg);
    await reportRun(JOB, "error", t0, null, msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
