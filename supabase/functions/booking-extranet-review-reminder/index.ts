// supabase/functions/booking-extranet-review-reminder/index.ts
// Nhac hang thang (ngay 1, 08:00 ICT) doi chieu TOAN BO booking Booking.com
// active/tuong lai voi Booking.com Extranet. KHONG tu dong sua gi -- chi
// nhac + xuat danh sach de Hieu tu chup Extranet roi doi chieu voi Claude.
//
// Ly do can job rieng (khong gop vao booking-arrival-check): Booking.com
// khong gui email dang "toan bo booking active", chi gui email arrival
// hom nay/mai. Extranet khong co API public cho hostel nho -> khong the
// tu dong hoa hoan toan, chi co the nhac + chuan bi du lieu san.

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendReport } from "../_shared/telegram-report.ts";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface GroupRow {
  id: string;
  customer_name: string | null;
  ota_booking_number: string | null;
  check_in: string;
  check_out: string;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDateVN(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`;
}

async function getActiveBookingComGroups(): Promise<GroupRow[]> {
  const today = new Date().toISOString().split("T")[0];

  // Lay tat ca bookings active (chua checkout, chua huy) cua nguon Booking.com,
  // gop theo group, lay check_in/check_out nho nhat/lon nhat cua group do.
  const { data, error } = await supabase
    .from("bookings")
    .select("check_in, check_out, group_id, groups!inner(id, customer_name, ota_booking_number, source, is_deleted)")
    .eq("is_deleted", false)
    .neq("status", "cancelled")
    .gte("check_out", today);

  if (error) throw new Error(`Query bookings failed: ${error.message}`);

  type Row = {
    check_in: string;
    check_out: string;
    group_id: string;
    // deno-lint-ignore no-explicit-any
    groups: any;
  };
  const rows = (data ?? []) as unknown as Row[];

  const byGroup = new Map<string, GroupRow>();
  for (const r of rows) {
    const g = r.groups;
    if (!g || g.source !== "Booking.com" || g.is_deleted) continue;

    const existing = byGroup.get(r.group_id);
    if (!existing) {
      byGroup.set(r.group_id, {
        id: r.group_id,
        customer_name: g.customer_name,
        ota_booking_number: g.ota_booking_number,
        check_in: r.check_in,
        check_out: r.check_out,
      });
    } else {
      if (r.check_in < existing.check_in) existing.check_in = r.check_in;
      if (r.check_out > existing.check_out) existing.check_out = r.check_out;
    }
  }

  return [...byGroup.values()].sort((a, b) => a.check_in.localeCompare(b.check_in));
}

function buildMessage(groups: GroupRow[]): string {
  const missingCount = groups.filter((g) => !g.ota_booking_number).length;

  let msg = `📋 <b>Đối chiếu Extranet Booking.com — hàng tháng</b>\n`;
  msg += `Tổng ${groups.length} booking đang hoạt động trong PMS`;
  if (missingCount > 0) {
    msg += `, <b>${missingCount} booking đang thiếu mã OTA</b>`;
  }
  msg += `.\n\n`;
  msg += `Mở Booking.com Extranet (Reservations, status=OK), so với danh sách dưới đây. Chụp lại Cancelled tab nếu nghi có booking đã hủy mà PMS chưa cập nhật.\n\n`;

  for (const g of groups) {
    const name = escapeHtml(g.customer_name ?? "?");
    const dateRange = `${formatDateVN(g.check_in)}→${formatDateVN(g.check_out)}`;
    const code = g.ota_booking_number ? escapeHtml(g.ota_booking_number) : "⚠️ THIẾU MÃ";
    msg += `• ${dateRange} — ${name} — ${code}\n`;
  }

  return msg.trim();
}

async function sendTelegramMessage(text: string): Promise<boolean> {
  try {
    await sendReport(text, { parseMode: "HTML" });
    return true;
  } catch (err) {
    console.error("Telegram sendMessage failed:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

async function reportRun(status: "ok" | "error", durationMs: number, detail: Record<string, unknown>, errorMessage?: string) {
  try {
    await supabase.rpc("report_automation_run", {
      p_job_name: "booking-extranet-review-reminder",
      p_status: status,
      p_duration_ms: durationMs,
      p_detail: detail,
      p_error_message: errorMessage ?? null,
    });
  } catch (err) {
    console.error("report_automation_run failed:", err);
  }
}

Deno.serve(async (req) => {
  const startedAt = Date.now();

  if (CRON_SECRET && req.headers.get("x-cron-key") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";

  try {
    const groups = await getActiveBookingComGroups();
    const message = buildMessage(groups);

    if (dryRun) {
      return new Response(
        JSON.stringify({ dry_run: true, groups_count: groups.length, message }, null, 2),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const sent = await sendTelegramMessage(message);

    const detail = {
      groups_count: groups.length,
      missing_ota_number_count: groups.filter((g) => !g.ota_booking_number).length,
      telegram_sent: sent,
    };

    await reportRun("ok", Date.now() - startedAt, detail);
    return new Response(JSON.stringify({ ok: true, ...detail }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("booking-extranet-review-reminder error:", errorMessage);
    if (!dryRun) await reportRun("error", Date.now() - startedAt, {}, errorMessage);
    return new Response(JSON.stringify({ ok: false, error: errorMessage }), { status: 500 });
  }
});
