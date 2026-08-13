// supabase/functions/booking-arrival-check/index.ts
// Doc email "Reservations with today's or tomorrow's arrival date for Hello
// Dalat Hostel" tu noreply-email@booking.com, doi chieu voi bookings trong PMS.
// Cron goi 1 lan/ngay luc 07:30 ICT. Dedupe theo email_message_id.
// ?dry_run=1 -> parse + tra JSON, KHONG ghi DB, KHONG gui Telegram (dung de tune parser).
//
// [PHONG DOAN] Parser dua tren 1 email mau (11/08/2026) — BAT BUOC chay
// dry_run doi chieu vai email lien tiep truoc khi bat cron thuc te.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;
const GMAIL_REFRESH_TOKEN = Deno.env.get("GMAIL_REFRESH_TOKEN")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface ArrivalRow {
  ota_booking_number: string;
  guest_name: string;
  check_in: string; // YYYY-MM-DD
  check_out: string; // YYYY-MM-DD
  section: "today" | "tomorrow";
}

interface Issue {
  issue_type: "missing" | "mismatch";
  ota_booking_number: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  candidate_booking_id: string | null;
  candidate_ota_booking_number: string | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Gmail API ────────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`OAuth refresh failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token as string;
}

async function findLatestArrivalEmailId(token: string): Promise<string | null> {
  const q = `from:noreply-email@booking.com subject:"arrival date for Hello Dalat Hostel" newer_than:2d`;
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", "5");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail list failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  // Gmail tra ve moi nhat truoc, lay message[0]
  return json.messages?.[0]?.id ?? null;
}

// deno-lint-ignore no-explicit-any
async function getMessage(token: string, id: string): Promise<any> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Gmail get ${id} failed: ${res.status}`);
  return res.json();
}

function b64urlDecode(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

// deno-lint-ignore no-explicit-any
function extractHtmlBody(payload: any): string {
  const htmlParts: string[] = [];
  // deno-lint-ignore no-explicit-any
  function walk(p: any) {
    if (!p) return;
    if (p.body?.data && p.mimeType === "text/html") {
      htmlParts.push(b64urlDecode(p.body.data));
    }
    for (const child of p.parts ?? []) walk(child);
  }
  walk(payload);
  return htmlParts.join("\n");
}

// ─── Parser ──────────────────────────────────────────────────────────────────
// Email co 2 section: "Đến vào hôm nay: [ngày]" và "Đến vào ngày mai: [ngày]"
// Moi section co 1 bang HTML: Dat phong | Ten khach | Ngay den | Ngay di

const MONTH_MAP: Record<string, string> = {
  "1": "01", "2": "02", "3": "03", "4": "04", "5": "05", "6": "06",
  "7": "07", "8": "08", "9": "09", "10": "10", "11": "11", "12": "12",
};

// "11 Th 8 2026" -> "2026-08-11"
function parseVietnameseDate(raw: string): string | null {
  const m = raw.trim().match(/(\d{1,2})\s*Th\s*(\d{1,2})\s*(\d{4})/i);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = MONTH_MAP[m[2]] ?? m[2].padStart(2, "0");
  const year = m[3];
  return `${year}-${month}-${day}`;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

// Parse 1 bang HTML thanh list rows (bo qua header row)
function parseTable(tableHtml: string, section: "today" | "tomorrow"): ArrivalRow[] {
  const rows: ArrivalRow[] = [];
  const trMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];

  for (const tr of trMatches) {
    const cellMatches = tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? [];
    if (cellMatches.length < 4) continue;

    const cells = cellMatches.map((c) => stripTags(c));
    const [otaRaw, guestName, checkInRaw, checkOutRaw] = cells;

    // Bo qua header row ("Đặt phòng", "Tên khách"...)
    if (!/^\d+$/.test(otaRaw.trim())) continue;

    const checkIn = parseVietnameseDate(checkInRaw);
    const checkOut = parseVietnameseDate(checkOutRaw);
    if (!checkIn || !checkOut) continue;

    rows.push({
      ota_booking_number: otaRaw.trim(),
      guest_name: guestName.trim(),
      check_in: checkIn,
      check_out: checkOut,
      section,
    });
  }
  return rows;
}

function parseArrivalEmail(html: string): ArrivalRow[] {
  const rows: ArrivalRow[] = [];

  // Tach theo header "Đến vào hôm nay" / "Đến vào ngày mai" — email dung <h2>/<h3>
  // hoac div dam, khong co the biet chinh xac the nen dung text marker lam moc.
  const todayIdx = html.search(/Đến vào hôm nay/i);
  const tomorrowIdx = html.search(/Đến vào ngày mai/i);
  const footerIdx = html.search(/hãy truy cập extranet/i);

  if (todayIdx === -1 && tomorrowIdx === -1) {
    return rows; // Khong tim thay section nao -> email format khac hoac 0 booking
  }

  const todaySectionEnd = tomorrowIdx !== -1 ? tomorrowIdx : (footerIdx !== -1 ? footerIdx : html.length);
  const tomorrowSectionEnd = footerIdx !== -1 ? footerIdx : html.length;

  if (todayIdx !== -1) {
    const todayHtml = html.slice(todayIdx, todaySectionEnd);
    const todayTable = todayHtml.match(/<table[\s\S]*?<\/table>/i);
    if (todayTable) rows.push(...parseTable(todayTable[0], "today"));
  }

  if (tomorrowIdx !== -1) {
    const tomorrowHtml = html.slice(tomorrowIdx, tomorrowSectionEnd);
    const tomorrowTable = tomorrowHtml.match(/<table[\s\S]*?<\/table>/i);
    if (tomorrowTable) rows.push(...parseTable(tomorrowTable[0], "tomorrow"));
  }

  return rows;
}

// ─── Doi chieu PMS ───────────────────────────────────────────────────────────

// So sanh ten khong dau, lowercase, cho phep chua nhau (OTA co the ghi khac thu tu ho/ten)
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function namesLikelyMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const wordsA = na.split(/\s+/);
  const wordsB = nb.split(/\s+/);
  // Match neu tat ca tu cua ten ngan hon deu xuat hien trong ten dai hon
  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  return shorter.every((w) => longer.includes(w));
}

async function checkAgainstPMS(rows: ArrivalRow[]): Promise<Issue[]> {
  const issues: Issue[] = [];
  if (rows.length === 0) return issues;

  const checkIns = [...new Set(rows.map((r) => r.check_in))];

  // Lay het booking active co check_in trong cac ngay lien quan, kem ota_booking_number + guest_name
  const { data: candidateBookings, error } = await supabase
    .from("bookings")
    .select("id, ota_booking_number, guest_name, check_in, check_out")
    .in("check_in", checkIns)
    .eq("is_deleted", false)
    .neq("status", "cancelled");

  if (error) throw new Error(`Query bookings failed: ${error.message}`);

  const byOtaNumber = new Map<string, typeof candidateBookings[number]>();
  for (const b of candidateBookings ?? []) {
    if (b.ota_booking_number) byOtaNumber.set(b.ota_booking_number, b);
  }

  for (const row of rows) {
    const matched = byOtaNumber.get(row.ota_booking_number);
    if (matched) continue; // OK, co booking khop ma OTA

    // Khong khop theo ma -> tim candidate cung ngay check_in + ten giong
    const candidate = (candidateBookings ?? []).find(
      (b) => b.check_in === row.check_in && namesLikelyMatch(b.guest_name ?? "", row.guest_name),
    );

    if (candidate) {
      issues.push({
        issue_type: "mismatch",
        ota_booking_number: row.ota_booking_number,
        guest_name: row.guest_name,
        check_in: row.check_in,
        check_out: row.check_out,
        candidate_booking_id: candidate.id,
        candidate_ota_booking_number: candidate.ota_booking_number ?? null,
      });
    } else {
      issues.push({
        issue_type: "missing",
        ota_booking_number: row.ota_booking_number,
        guest_name: row.guest_name,
        check_in: row.check_in,
        check_out: row.check_out,
        candidate_booking_id: null,
        candidate_ota_booking_number: null,
      });
    }
  }

  return issues;
}

// ─── Telegram ────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDateVN(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

async function sendTelegramAlert(issues: Issue[]): Promise<void> {
  const missing = issues.filter((i) => i.issue_type === "missing");
  const mismatch = issues.filter((i) => i.issue_type === "mismatch");

  let msg = `⚠️ <b>Kiểm tra khách đến hôm nay/ngày mai</b>\n`;
  msg += `Đối chiếu email Booking.com với PMS — phát hiện bất thường:\n\n`;

  if (missing.length > 0) {
    msg += `❌ <b>Thiếu trong PMS (${missing.length})</b>\n`;
    for (const i of missing) {
      msg += `• ${escapeHtml(i.guest_name)} — mã ${escapeHtml(i.ota_booking_number)} — đến ${formatDateVN(i.check_in)}\n`;
    }
    msg += `\n`;
  }

  if (mismatch.length > 0) {
    msg += `❓ <b>Có thể sai mã OTA (${mismatch.length})</b>\n`;
    for (const i of mismatch) {
      msg += `• ${escapeHtml(i.guest_name)} — email ghi mã ${escapeHtml(i.ota_booking_number)}, PMS đang có mã ${escapeHtml(i.candidate_ota_booking_number ?? "?")} cùng ngày ${formatDateVN(i.check_in)}\n`;
    }
    msg += `\n`;
  }

  msg += `Kiểm tra lại trên PMS hoặc extranet Booking.com.`;

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg.trim(), parse_mode: "HTML" }),
  });
  if (!res.ok) {
    console.error("Telegram sendMessage failed:", res.status, await res.text());
  }
}

// ─── Heartbeat ───────────────────────────────────────────────────────────────

async function reportRun(status: "ok" | "error", durationMs: number, detail: Record<string, unknown>, errorMessage?: string) {
  try {
    await supabase.rpc("report_automation_run", {
      p_job_name: "booking-arrival-check",
      p_status: status,
      p_duration_ms: durationMs,
      p_detail: detail,
      p_error_message: errorMessage ?? null,
    });
  } catch (err) {
    console.error("report_automation_run failed:", err);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const startedAt = Date.now();

  if (CRON_SECRET && req.headers.get("x-cron-key") !== CRON_SECRET) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";

  try {
    const token = await getAccessToken();
    const messageId = await findLatestArrivalEmailId(token);

    if (!messageId) {
      const detail = { reason: "no_email_found" };
      if (!dryRun) await reportRun("ok", Date.now() - startedAt, detail);
      return jsonResponse({ ok: true, ...detail });
    }

    const message = await getMessage(token, messageId);
    const emailDate = message.internalDate
      ? new Date(Number(message.internalDate)).toISOString()
      : null;
    const html = extractHtmlBody(message.payload);
    const rows = parseArrivalEmail(html);

    if (dryRun) {
      const issues = rows.length > 0 ? await checkAgainstPMS(rows) : [];
      return jsonResponse({
        dry_run: true,
        email_message_id: messageId,
        email_date: emailDate,
        rows_parsed: rows.length,
        rows,
        issues,
      });
    }

    // Da xu ly email nay chua? (dedupe qua unique index, nhung check truoc de tranh spam Telegram)
    const { data: existingLog } = await supabase
      .from("arrival_check_log")
      .select("id")
      .eq("email_message_id", messageId)
      .maybeSingle();

    if (existingLog) {
      const detail = { reason: "already_processed", email_message_id: messageId };
      await reportRun("ok", Date.now() - startedAt, detail);
      return jsonResponse({ ok: true, ...detail });
    }

    const issues = await checkAgainstPMS(rows);

    const { error: ingestError } = await supabase.rpc("ingest_arrival_check", {
      p_email_message_id: messageId,
      p_email_date: emailDate,
      p_issues: issues,
    });

    if (ingestError) throw new Error(`ingest_arrival_check failed: ${ingestError.message}`);

    if (issues.length > 0) {
      await sendTelegramAlert(issues);
    }

    const detail = {
      email_message_id: messageId,
      rows_total: rows.length,
      missing_count: issues.filter((i) => i.issue_type === "missing").length,
      mismatch_count: issues.filter((i) => i.issue_type === "mismatch").length,
    };

    await reportRun("ok", Date.now() - startedAt, detail);
    return jsonResponse({ ok: true, ...detail });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("booking-arrival-check error:", errorMessage);
    if (!dryRun) await reportRun("error", Date.now() - startedAt, {}, errorMessage);
    return jsonResponse({ ok: false, error: errorMessage }, 500);
  }
});
