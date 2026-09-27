// supabase/functions/hotel-kpi-snapshot/index.ts
//
// Chụp KPI (occupancy/ADR/RevPAR) từ view monthly_hotel_kpi cho THÁNG TRƯỚC
// (tháng đã đóng, số liệu ổn định) và lưu vào hotel_kpi_snapshots.
// Chạy qua cron đầu mỗi tháng — xem migration cron job "hotel-kpi-snapshot-monthly".
//
// Auth: theo convention job hàng ngày/tuần khác trong project — dùng
// pms_service_role_jwt qua header Authorization Bearer.
//
// Heartbeat: mọi nhánh return đều gọi reportRun() để Ops Guardian thấy job
// chạy (job_registry 'hotel-kpi-snapshot', expected_interval 31 days).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { reportRun } from "../_shared/heartbeat.ts";

const JOB = "hotel-kpi-snapshot";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Target RevPAR hiện tại — xem brain.knowledge key 'revpar_target_thang'
// (id e962a890-a6b1-4635-b4a6-6b8c02d2d1eb). Nếu Hiếu đổi target trong Brain,
// SỬA SỐ NÀY THEO — không tự đồng bộ động để tránh gọi thêm 1 query.
const REVPAR_TARGET = 186760;

Deno.serve(async (_req) => {
  const t0 = performance.now();

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Tháng trước (tháng đã đóng hoàn toàn khi cron chạy ngày 1).
    // Tính theo giờ VN (UTC+7, không DST) — runtime chạy UTC, nếu cron chạy
    // trước 07:00 sáng ngày 1 giờ VN thì UTC vẫn là tháng cũ → lệch 1 tháng.
    const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const prevMonth = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth() - 1, 1));
    const monthStr = prevMonth.toISOString().slice(0, 10); // YYYY-MM-01

    const { data: kpi, error: kpiError } = await supabase
      .from("monthly_hotel_kpi")
      .select("*")
      .eq("month", monthStr)
      .single();

    if (kpiError || !kpi) {
      const msg = `Không lấy được KPI tháng ${monthStr}: ${kpiError?.message ?? "no data"}`;
      await reportRun(JOB, "error", t0, { month: monthStr }, msg);
      return new Response(
        JSON.stringify({ ok: false, error: msg }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const { error: insertError } = await supabase
      .from("hotel_kpi_snapshots")
      .upsert(
        {
          month: monthStr,
          total_rooms: kpi.total_rooms,
          available_room_nights: kpi.available_room_nights,
          room_nights_sold: kpi.room_nights_sold,
          booking_count: kpi.booking_count,
          gross_room_revenue: kpi.gross_room_revenue,
          net_revenue: kpi.net_revenue,
          service_revenue: kpi.service_revenue,
          total_tax: kpi.total_tax,
          occupancy_rate_pct: kpi.occupancy_rate_pct,
          adr: kpi.adr,
          revpar: kpi.revpar,
          revpar_target: REVPAR_TARGET,
          source: "cron_monthly",
        },
        { onConflict: "month,source" },
      );

    if (insertError) {
      await reportRun(JOB, "error", t0, { month: monthStr }, insertError.message);
      return new Response(
        JSON.stringify({ ok: false, error: insertError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    await reportRun(JOB, "ok", t0, { month: monthStr, revpar: kpi.revpar });

    return new Response(
      JSON.stringify({ ok: true, month: monthStr, revpar: kpi.revpar }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await reportRun(JOB, "error", t0, null, msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
