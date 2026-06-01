// @ts-nocheck: Edge Function chạy trên Deno runtime, TS server của web app không có Deno libs.
/// <reference lib="deno.ns" />

// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

interface BookingRow {
  room_id: string;
  check_in: string;
  check_out: string;
  guests_count: number;
  guest_name: string | null;
  groups: Array<{ source: string | null }> | null;
  rooms: Array<{ name: string | null }> | null;
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Ngày hôm nay theo múi giờ Việt Nam
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }); // → "2026-05-12"

  const select = `
    import "@supabase/functions-js/edge-runtime.d.ts";

    const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
    const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;
    const TOTAL_ROOMS = 8;

    interface BookingRow {
      room_id: string;
      check_in: string;
      check_out: string;
      guests_count: number;
      guest_name: string | null;
      groups: { source: string | null } | null;
      rooms: { name: string | null } | null;
    }

    interface PaymentRow {
      amount: number;
      method: string;
    }

    Deno.serve(async () => {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
      });

      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = yesterdayDate.toLocaleDateString("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
      });

      const bookingSelect = `
        room_id, check_in, check_out, guests_count, guest_name,
        groups ( source ),
        rooms ( name )
      `;

      const [checkIns, checkOuts, staying, payments] = await Promise.all([
        supabase
          .from("bookings")
          .select(bookingSelect)
          .eq("check_in", today)
          .eq("status", "booked")
          .eq("is_deleted", false)
          .order("room_id"),

        supabase
          .from("bookings")
          .select(bookingSelect)
          .eq("check_out", today)
          .eq("status", "checked-in")
          .eq("is_deleted", false)
          .order("room_id"),

        supabase
          .from("bookings")
          .select(bookingSelect)
          .lt("check_in", today)
          .gt("check_out", today)
          .eq("status", "checked-in")
          .eq("is_deleted", false)
          .order("room_id"),

        supabase
          .from("payment_history")
          .select("amount, method")
          .eq("date", yesterday)
          .eq("is_void", false), // ← fix: loại void payments
      ]);

      // ← fix: thêm payments.error
      if (checkIns.error || checkOuts.error || staying.error || payments.error) {
        const err = checkIns.error ?? checkOuts.error ?? staying.error ?? payments.error;
        return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
      }

      const fmt = (b: BookingRow) => {
        const room = b.rooms?.name ?? b.room_id;
        const name = b.guest_name ?? "Chưa đặt tên";
        const guests = b.guests_count ?? 1;
        const source = b.groups?.source ?? "";
        const sourcePart = source ? " [" + source + "]" : "";
        return "  \u2022 " + room + " \u2014 " + name + " (" + guests + " kh\u00e1ch)" + sourcePart;
      };

      const paymentData = (payments.data ?? []) as PaymentRow[];
      const totalRevenue = paymentData.reduce((sum, p) => sum + (p.amount ?? 0), 0);
      const revenueByMethod: Record<string, number> = {};
      for (const p of paymentData) {
        revenueByMethod[p.method] = (revenueByMethod[p.method] || 0) + p.amount;
      }

      const formatVND = (n: number) => n.toLocaleString("vi-VN") + "đ";

      const methodLines = Object.entries(revenueByMethod).map(
        ([method, amount]) => `  • ${method}: ${formatVND(amount)}`
      );

      // ← fix: dùng Set để tránh đếm trùng phòng
      const occupiedSet = new Set([
        ...(staying.data ?? []).map((b) => b.room_id),
        ...(checkIns.data ?? []).map((b) => b.room_id),
      ]);
      const occupied = occupiedSet.size;
      const occupancyPct = Math.round((occupied / TOTAL_ROOMS) * 100);

      const dateLabel = new Date().toLocaleDateString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        day: "2-digit", month: "2-digit", year: "numeric",
      });

      const yesterdayLabel = new Date(yesterday + "T12:00:00+07:00").toLocaleDateString("vi-VN", {
        day: "2-digit", month: "2-digit",
      });

      const lines: string[] = [
        `📋 <b>Báo cáo — ${dateLabel}</b>`,
        "",
        `🟢 <b>CHECK-IN hôm nay (${checkIns.data!.length})</b>`,
        ...(checkIns.data!.length > 0 ? checkIns.data!.map(fmt) : ["  <i>Không có</i>"]),
        "",
        `🔴 <b>CHECK-OUT hôm nay (${checkOuts.data!.length})</b>`,
        ...(checkOuts.data!.length > 0 ? checkOuts.data!.map(fmt) : ["  <i>Không có</i>"]),
        "",
        `🏠 <b>ĐANG LƯU TRÚ (${staying.data!.length})</b>`,
        ...(staying.data!.length > 0 ? staying.data!.map(fmt) : ["  <i>Không có</i>"]),
        "",
        `💰 <b>DOANH THU ${yesterdayLabel}</b>`,
        `  • Tổng: <b>${formatVND(totalRevenue)}</b>`,
        ...(methodLines.length > 0 ? methodLines : ["  • <i>Chưa có giao dịch</i>"]),
        "",
        `📊 Công suất hôm nay: ${occupied}/${TOTAL_ROOMS} phòng (${occupancyPct}%)`,
      ];

      const tgRes = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: CHAT_ID,
            text: lines.join("\n"),
            parse_mode: "HTML",
          }),
        },
      );

      if (!tgRes.ok) {
        const err = await tgRes.text();
        return new Response(JSON.stringify({ error: err }), { status: 500 });
      }

      return new Response(
        JSON.stringify({ ok: true, date: today, revenue: totalRevenue }),
        { headers: { "Content-Type": "application/json" } },
      );
    });
