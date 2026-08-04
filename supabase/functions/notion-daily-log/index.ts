import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { reportRun } from "../_shared/heartbeat.ts";

const JOB = "notion-daily-log";

// notion-daily-log
// v7 (30/07/2026): nhan phong = rooms.id (SO phong) thay vi rooms.name (LOAI phong,
//   co 3 ten trung: Single x2, Deluxe Double x2, Standard Double x2).
// v8 (30/07/2026):
//   - Tach don vi cong suat: "Cong suat" = SO PHONG (khop 26 dong lich su 09/06-03/07),
//     "Cong suat %" = PHAN TRAM (cot moi). Truoc day v6 ghi percent vao cot count -> lan don vi.
//   - Tra lai thu trong tieu de ("Daily Log — 30/07/2026 — Thu Nam") cho khop lich su.
//   - Don 2 chuoi .replace() du thua tu lan escape unicode o v7.
//
// Property Notion viet bang \uXXXX escape: deploy qua Supabase MCP tung mangle chuoi
// UTF-8 tieng Viet -> property name sai bytes -> Notion API bao loi.
//
// Query occupancy: mot query gop, KHONG tach staying/arrivals thanh 2 nhanh (khe ho
// walk-in). Ghi log qua log_automation_run, KHONG dung upsert_brain_daily_log
// (delete-by-category). Xem brain.decisions 30/07/2026.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NOTION_TOKEN = Deno.env.get("NOTION_TOKEN");
const NOTION_DAILY_OPS_DB_ID = Deno.env.get("NOTION_DAILY_OPS_DB_ID");
const NOTION_VERSION = "2022-06-28";
const TOTAL_ROOMS_FALLBACK = 8;

// Ten property that trong Notion database (tieng Viet, phan biet hoa/thuong).
const P_TITLE = "Ng\u00e0y";                    // Ngay
const P_DATE = "Ng\u00e0y log";                 // Ngay log
const P_OCC_ROOMS = "C\u00f4ng su\u1ea5t";      // Cong suat  -> SO PHONG
const P_OCC_PCT = "C\u00f4ng su\u1ea5t %";      // Cong suat % -> PHAN TRAM
const P_CI = "Check-in";
const P_CO = "Check-out";
const P_INCIDENT = "C\u00f3 incident";          // Co incident
const P_CREATED_BY = "T\u1ea1o b\u1edfi";       // Tao boi

interface BookingRow {
  room_id: string;
  check_in: string;
  check_out: string;
  status: string;
  guest_name: string | null;
  guests_count: number | null;
  price_per_night: number | null;
  rooms: { name: string } | null;
  groups: { source: string | null } | null;
}

interface DailyLogRow {
  category: string;
  content: string;
  created_at: string;
}

function fmtVND(n: number): string {
  return n.toLocaleString("vi-VN") + "\u0111";
}

function todayICT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

function dateLabelVN(iso: string): string {
  return new Date(iso + "T12:00:00+07:00").toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

function weekdayVN(iso: string): string {
  const w = new Date(iso + "T12:00:00+07:00").toLocaleDateString("vi-VN", {
    weekday: "long",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  return w.charAt(0).toUpperCase() + w.slice(1);
}

// deno-lint-ignore no-explicit-any
function textCell(s: string): any {
  return [{ type: "text", text: { content: s } }];
}

// deno-lint-ignore no-explicit-any
function heading(text: string): any {
  return {
    object: "block",
    type: "heading_2",
    heading_2: { rich_text: [{ type: "text", text: { content: text } }] },
  };
}

// deno-lint-ignore no-explicit-any
function para(text: string, italic = false): any {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: text }, annotations: { italic } }],
    },
  };
}

// deno-lint-ignore no-explicit-any
function todo(text: string): any {
  return {
    object: "block",
    type: "to_do",
    to_do: { rich_text: [{ type: "text", text: { content: text } }], checked: false },
  };
}

// deno-lint-ignore no-explicit-any
function bullet(text: string): any {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: { rich_text: [{ type: "text", text: { content: text } }] },
  };
}

Deno.serve(async () => {
  const t0 = performance.now();

  try {
    if (!NOTION_TOKEN) {
      throw new Error("NOTION_TOKEN chua set trong Edge Function secrets");
    }
    if (!NOTION_DAILY_OPS_DB_ID) {
      throw new Error("NOTION_DAILY_OPS_DB_ID chua set trong Edge Function secrets");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = todayICT();

    const sel =
      "room_id, check_in, check_out, status, guest_name, guests_count, price_per_night, rooms(name), groups(source)";

    const [occupiedRes, coRes, roomsRes, logRes] = await Promise.all([
      supabase.from("bookings").select(sel).lte("check_in", today).gt("check_out", today).in(
        "status",
        ["booked", "checked-in"],
      ).eq("is_deleted", false).order("room_id"),
      supabase.from("bookings").select(sel).eq("check_out", today).eq("status", "checked-in").eq(
        "is_deleted",
        false,
      ).order("room_id"),
      supabase.from("rooms").select("id, name").eq("is_active", true),
      supabase.rpc("get_daily_log_for_date", { p_date: today }),
    ]);

    const checks: Array<[string, { error: unknown }]> = [
      ["occupied", occupiedRes],
      ["check-out", coRes],
      ["rooms", roomsRes],
      ["daily_log", logRes],
    ];
    for (const [name, res] of checks) {
      if (res.error) {
        console.error(`Query ${name} failed:`, JSON.stringify(res.error));
        throw new Error(`Query ${name} failed: ${(res.error as Error).message}`);
      }
    }

    const occupiedRows = (occupiedRes.data ?? []) as BookingRow[];
    const co = (coRes.data ?? []) as BookingRow[];
    const totalRooms = roomsRes.data?.length ?? TOTAL_ROOMS_FALLBACK;
    const logs = (logRes.data ?? []) as DailyLogRow[];

    const ci = occupiedRows.filter((b) => b.check_in === today);
    const ciNeedsPrep = ci.filter((b) => b.status === "booked");

    const occSet = new Set<string>(occupiedRows.map((b) => b.room_id));
    const occ = occSet.size;
    const pct = totalRooms > 0 ? Math.round((occ / totalRooms) * 100) : 0;
    const hasIncident = logs.some((l) => l.category === "incident");

    const roomNo = (b: BookingRow) => b.room_id;
    const roomFull = (b: BookingRow) =>
      b.rooms?.name ? `${b.room_id} (${b.rooms.name})` : b.room_id;
    const guestLabel = (b: BookingRow) => b.guest_name ?? "Ch\u01b0a \u0111\u1eb7t t\u00ean";
    const srcLabel = (b: BookingRow) => b.groups?.source ?? "\u2014";
    const priceLabel = (b: BookingRow) =>
      b.price_per_night != null ? fmtVND(b.price_per_night) : "\u2014";

    // deno-lint-ignore no-explicit-any
    function roomTable(rows: BookingRow[]): any {
      const header = {
        object: "block",
        type: "table_row",
        table_row: {
          cells: [
            textCell("Ph\u00f2ng"),
            textCell("Kh\u00e1ch"),
            textCell("Check-in"),
            textCell("Check-out"),
            textCell("Ngu\u1ed3n"),
            textCell("Gi\u00e1/\u0111\u00eam"),
          ],
        },
      };
      const dataRows = rows.map((b) => ({
        object: "block",
        type: "table_row",
        table_row: {
          cells: [
            textCell(roomFull(b)),
            textCell(guestLabel(b)),
            textCell(dateLabelVN(b.check_in)),
            textCell(dateLabelVN(b.check_out)),
            textCell(srcLabel(b)),
            textCell(priceLabel(b)),
          ],
        },
      }));
      return {
        object: "block",
        type: "table",
        table: {
          table_width: 6,
          has_column_header: true,
          has_row_header: false,
          children: [header, ...dataRows],
        },
      };
    }

    // deno-lint-ignore no-explicit-any
    const children: any[] = [
      heading("\ud83c\udfe0 T\u00ecnh tr\u1ea1ng ph\u00f2ng"),
      para(`T\u1ed5ng c\u00f4ng su\u1ea5t: ${occ}/${totalRooms} ph\u00f2ng (${pct}%)`),
    ];
    if (occupiedRows.length > 0) {
      children.push(roomTable(occupiedRows));
    } else {
      children.push(
        para("Kh\u00f4ng c\u00f3 ph\u00f2ng n\u00e0o \u0111ang \u1edf h\u00f4m nay.", true),
      );
    }

    children.push(heading("\ud83d\udce5 Check-in h\u00f4m nay"));
    if (ci.length > 0) {
      for (const b of ci) {
        const src = b.groups?.source ? ` [${b.groups.source}]` : "";
        children.push(
          bullet(`${roomFull(b)} \u2014 ${guestLabel(b)} (${b.guests_count ?? 1} kh\u00e1ch)${src}`),
        );
      }
    } else {
      children.push(para("Kh\u00f4ng c\u00f3 check-in h\u00f4m nay.", true));
    }

    children.push(heading("\ud83d\udce4 Check-out h\u00f4m nay"));
    if (co.length > 0) {
      for (const b of co) children.push(bullet(`${roomFull(b)} \u2014 ${guestLabel(b)}`));
    } else {
      children.push(para("Kh\u00f4ng c\u00f3 check-out h\u00f4m nay.", true));
    }

    children.push(heading("\ud83d\udccb Ghi ch\u00fa v\u1eadn h\u00e0nh"));
    if (logs.length > 0) {
      for (const l of logs) children.push(bullet(`[${l.category}] ${l.content}`));
    } else {
      children.push(
        para("Kh\u00f4ng c\u00f3 ghi ch\u00fa \u0111\u1eb7c bi\u1ec7t.", true),
      );
    }

    // Checklist: CHI so phong, khong kem loai phong — Loi can nhan dien nhanh.
    children.push(heading("\u2705 Checklist L\u1ee3i \u2014 ca s\u00e1ng"));
    children.push(
      todo(
        `D\u1ecdn ph\u00f2ng check-out: ${
          co.length > 0 ? co.map(roomNo).join(", ") : "kh\u00f4ng c\u00f3"
        }`,
      ),
    );
    children.push(
      todo(
        `Chu\u1ea9n b\u1ecb ph\u00f2ng check-in: ${
          ciNeedsPrep.length > 0 ? ciNeedsPrep.map(roomNo).join(", ") : "kh\u00f4ng c\u00f3"
        }`,
      ),
    );
    children.push(todo("V\u1ec7 sinh khu v\u1ef1c chung"));
    children.push(todo("Ki\u1ec3m tra amenities, b\u00e1o Hi\u1ebfu n\u1ebfu thi\u1ebfu"));
    children.push(
      todo("Ch\u1ee5p \u1ea3nh ph\u00f2ng sau d\u1ecdn n\u1ebfu c\u00f3 v\u1ea5n \u0111\u1ec1"),
    );

    children.push(heading("\ud83d\udcde Li\u00ean h\u1ec7 kh\u1ea9n"));
    children.push(para("Hi\u1ebfu: 0969 975 935"));

    // Idempotency: archive page cu cung ngay truoc khi tao page moi.
    const queryRes = await fetch(
      `https://api.notion.com/v1/databases/${NOTION_DAILY_OPS_DB_ID}/query`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${NOTION_TOKEN}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: { property: P_DATE, date: { equals: today } },
          page_size: 5,
        }),
      },
    );
    if (queryRes.ok) {
      const queryData = await queryRes.json();
      for (const existing of queryData.results ?? []) {
        await fetch(`https://api.notion.com/v1/pages/${existing.id}`, {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${NOTION_TOKEN}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ archived: true }),
        });
      }
    } else {
      console.error("Query existing page failed (khong chan tao moi):", await queryRes.text());
    }

    const titleText = `Daily Log \u2014 ${dateLabelVN(today)} \u2014 ${weekdayVN(today)}`;

    // deno-lint-ignore no-explicit-any
    const properties: any = {};
    properties[P_TITLE] = { title: [{ text: { content: titleText } }] };
    properties[P_DATE] = { date: { start: today } };
    properties[P_OCC_ROOMS] = { number: occ };  // SO PHONG
    properties[P_OCC_PCT] = { number: pct };    // PHAN TRAM
    properties[P_CI] = { number: ci.length };
    properties[P_CO] = { number: co.length };
    properties[P_INCIDENT] = { checkbox: hasIncident };
    properties[P_CREATED_BY] = { select: { name: "auto" } };

    const pageRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DAILY_OPS_DB_ID },
        properties,
        children,
      }),
    });

    if (!pageRes.ok) {
      const errText = await pageRes.text();
      console.error("Notion API error:", errText);
      throw new Error(`Notion API error: ${errText}`);
    }

    const page = await pageRes.json();

    const { error: logError } = await supabase.rpc("log_automation_run", {
      p_log_date: today,
      p_source: "notion-daily-log",
      p_content:
        `Daily Log Notion da tao tu dong \u2014 ${occ}/${totalRooms} phong (${pct}%), ${ci.length} check-in, ${co.length} check-out.`,
    });
    if (logError) {
      console.error("log_automation_run failed:", JSON.stringify(logError));
    }

    await reportRun(JOB, "ok", t0, {
      occupancy_pct: pct,
      check_ins: ci.length,
      check_outs: co.length,
      has_incident: hasIncident,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        version: 8,
        date: today,
        page_url: page.url,
        occupied_rooms: occ,
        total_rooms: totalRooms,
        occupancy_pct: pct,
        occupied_room_ids: [...occSet],
        check_ins: ci.length,
        check_outs: co.length,
        has_incident: hasIncident,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("notion-daily-log error:", err instanceof Error ? err.stack : String(err));
    const message = err instanceof Error ? err.message : String(err);
    await reportRun(JOB, "error", t0, null, message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
