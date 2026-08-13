// supabase/functions/booking-arrival-check/index.ts
// 1) Doc email "Reservations with today's or tomorrow's arrival date for Hello
//    Dalat Hostel" tu noreply-email@booking.com, doi chieu voi bookings trong PMS.
// 2) Doc email "Booking.com - Đặt phòng đã hủy!" tu noreply@booking.com, tu dong
//    huy booking trong PMS khi khop ota_booking_number (khong can duyet tay).
// Cron goi 1 lan/ngay luc 07:30 ICT. Dedupe rieng cho tung loai email.
// ?dry_run=1 -> parse + tra JSON, KHONG ghi DB, KHONG gui Telegram, KHONG huy that
// (dung de tune parser / kiem tra truoc khi bat cron thuc te).
//
// [PHONG DOAN] Parser dua tren 1 email mau moi loai — BAT BUOC chay dry_run
// doi chieu vai email that truoc khi tin tuong hoan toan.

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
// LUU Y QUAN TRONG: schema brain KHONG duoc PostgREST expose (xac nhan qua
// pgrst.db_schemas setting). Moi lan .from() truc tiep tren schema brain qua
// REST client se THAT BAI AM THAM (khong throw, tra ve rong) -- day la bug
// da xay ra thuc te (dedupe khong hoat dong, insert log khong ghi duoc).
// BAT BUOC dung RPC (SECURITY DEFINER, schema public) cho MOI thao tac brain.

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

  // ota_booking_number nam o bang groups (1 group = 1 booking OTA, co the
  // nhieu phong/bookings con trong cung group). Join qua groups de lay dung field.
  const { data: candidateBookings, error } = await supabase
    .from("bookings")
    .select("id, guest_name, check_in, check_out, group_id, groups!inner(id, ota_booking_number)")
    .in("check_in", checkIns)
    .eq("is_deleted", false)
    .neq("status", "cancelled");

  if (error) throw new Error(`Query bookings failed: ${error.message}`);

  type CandidateRow = {
    id: string;
    guest_name: string | null;
    check_in: string;
    check_out: string;
    group_id: string;
    // deno-lint-ignore no-explicit-any
    groups: any;
  };
  const candidates = (candidateBookings ?? []) as unknown as CandidateRow[];

  const byOtaNumber = new Map<string, CandidateRow>();
  for (const b of candidates) {
    const otaNumber = b.groups?.ota_booking_number as string | null | undefined;
    if (otaNumber) byOtaNumber.set(otaNumber, b);
  }

  for (const row of rows) {
    const matched = byOtaNumber.get(row.ota_booking_number);
    if (matched) continue; // OK, co booking khop ma OTA

    // Khong khop theo ma -> tim candidate cung ngay check_in + ten giong
    const candidate = candidates.find(
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
        candidate_ota_booking_number: candidate.groups?.ota_booking_number ?? null,
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

// ─── Dong bo huy booking tu email "Dat phong da huy" ─────────────────────────
// Subject dang: 'Booking.com - Đặt phòng đã hủy! (<res_id>, <ngay>)'
// res_id trong subject/link chinh la groups.ota_booking_number.
// Khac voi email arrival-list (chi doi chieu), email nay TU DONG HUY booking
// trong PMS khi khop ma OTA — khong can Hieu duyet, theo yeu cau.

interface CancellationEmailResult {
  message_id: string;
  ota_booking_number: string | null;
  result: "cancelled" | "already_cancelled" | "not_found" | "error";
  group_id: string | null;
  bookings_cancelled_count: number;
  error_message: string | null;
}

async function findCancellationEmailIds(token: string): Promise<string[]> {
  const q = `from:noreply@booking.com subject:"Đặt phòng đã hủy" newer_than:2d`;
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", "20");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail list (cancellation) failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  // deno-lint-ignore no-explicit-any
  return (json.messages ?? []).map((m: any) => m.id as string);
}

// Gmail search theo subject co the match long (vd email "Yeu cau huy MIEN PHI" tu
// noreply-email@booking.com lot qua vi cung chua tu "huy"). BAT BUOC doc lai subject
// that tu header va kiem tra dung mau "Booking.com - Đặt phòng đã hủy!" + dung
// nguoi gui noreply@booking.com (khac noreply-email@booking.com cua email loai 1)
// truoc khi coi day la tin hieu HUY THAT SU.
// deno-lint-ignore no-explicit-any
function getHeader(payload: any, name: string): string | null {
  const h = payload?.headers?.find((x: { name: string; value: string }) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

function isConfirmedCancellationEmail(subject: string | null, from: string | null): boolean {
  if (!subject || !from) return false;
  const subjectOk = subject.includes("Đặt phòng đã hủy");
  const fromOk = from.includes("noreply@booking.com") && !from.includes("noreply-email@booking.com");
  return subjectOk && fromOk;
}

// Lay res_id tu URL admin.booking.com trong than email, vd:
// https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/booking.html?res_id=6795256275&hotel_id=...
function extractResId(html: string): string | null {
  const m = html.match(/res_id=(\d+)/);
  return m ? m[1] : null;
}

async function processCancellationEmail(
  token: string,
  messageId: string,
): Promise<CancellationEmailResult> {
  const message = await getMessage(token, messageId);
  const subject = getHeader(message.payload, "Subject");
  const from = getHeader(message.payload, "From");

  if (!isConfirmedCancellationEmail(subject, from)) {
    // Gmail search co the match long (vd email "yeu cau huy mien phi" tu
    // noreply-email@ lot qua filter subject). Day KHONG phai tin hieu huy that,
    // bo qua hoan toan -- khong ghi log, khong coi la loi, khong huy gi ca.
    return {
      message_id: messageId,
      ota_booking_number: null,
      result: "not_found",
      group_id: null,
      bookings_cancelled_count: 0,
      error_message: null,
    };
  }

  const html = extractHtmlBody(message.payload);
  const otaBookingNumber = extractResId(html);

  if (!otaBookingNumber) {
    return {
      message_id: messageId,
      ota_booking_number: null,
      result: "error",
      group_id: null,
      bookings_cancelled_count: 0,
      error_message: "Khong tim thay res_id trong noi dung email",
    };
  }

  // Tim group khop ma OTA
  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, status")
    .eq("ota_booking_number", otaBookingNumber)
    .eq("is_deleted", false)
    .maybeSingle();

  if (groupError) {
    return {
      message_id: messageId,
      ota_booking_number: otaBookingNumber,
      result: "error",
      group_id: null,
      bookings_cancelled_count: 0,
      error_message: `Query groups failed: ${groupError.message}`,
    };
  }

  if (!group) {
    // Khong khop group nao trong PMS -- khong phai loi, co the booking chua
    // duoc import hoac dat qua kenh khac. Khong bao Telegram cho case nay.
    return {
      message_id: messageId,
      ota_booking_number: otaBookingNumber,
      result: "not_found",
      group_id: null,
      bookings_cancelled_count: 0,
      error_message: null,
    };
  }

  // Lay toan bo bookings con active cua group (1 group co the nhieu phong)
  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("id, room_id, check_in, check_out, price_per_night, guests_count, guest_name, note, status")
    .eq("group_id", group.id)
    .eq("is_deleted", false);

  if (bookingsError) {
    return {
      message_id: messageId,
      ota_booking_number: otaBookingNumber,
      result: "error",
      group_id: group.id,
      bookings_cancelled_count: 0,
      error_message: `Query bookings failed: ${bookingsError.message}`,
    };
  }

  const activeBookings = (bookings ?? []).filter((b) => b.status !== "cancelled");

  if (activeBookings.length === 0) {
    // Tat ca booking con cua group da cancelled tu truoc -- email den muon
    // hoac job da xu ly roi. Khong coi la loi, khong goi lai RPC.
    return {
      message_id: messageId,
      ota_booking_number: otaBookingNumber,
      result: "already_cancelled",
      group_id: group.id,
      bookings_cancelled_count: 0,
      error_message: null,
    };
  }

  let cancelledCount = 0;
  const rpcErrors: string[] = [];

  for (const b of activeBookings) {
    const { error: rpcError } = await supabase.rpc("update_booking_txn", {
      p_booking_id: b.id,
      p_room_id: b.room_id,
      p_check_in: b.check_in,
      p_check_out: b.check_out,
      p_price_per_night: b.price_per_night,
      p_guests_count: b.guests_count,
      p_guest_name: b.guest_name,
      p_note: `${b.note ?? ""} | Tu dong huy tu email Booking.com (res_id=${otaBookingNumber})`.trim(),
      p_cancel: true,
      p_override_checkin: false,
    });

    if (rpcError) {
      rpcErrors.push(`booking ${b.id}: ${rpcError.message}`);
    } else {
      cancelledCount++;
    }
  }

  if (rpcErrors.length > 0) {
    return {
      message_id: messageId,
      ota_booking_number: otaBookingNumber,
      result: "error",
      group_id: group.id,
      bookings_cancelled_count: cancelledCount,
      error_message: rpcErrors.join("; "),
    };
  }

  return {
    message_id: messageId,
    ota_booking_number: otaBookingNumber,
    result: "cancelled",
    group_id: group.id,
    bookings_cancelled_count: cancelledCount,
    error_message: null,
  };
}

async function sendCancellationErrorAlert(errors: CancellationEmailResult[]): Promise<void> {
  let msg = `🔴 <b>Lỗi tự động hủy booking từ email</b>\n`;
  msg += `Email báo hủy từ Booking.com nhưng xử lý trong PMS bị lỗi — cần kiểm tra tay:\n\n`;
  for (const e of errors) {
    msg += `• Mã ${escapeHtml(e.ota_booking_number ?? "?")} — ${escapeHtml(e.error_message ?? "unknown error")}\n`;
  }

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg.trim(), parse_mode: "HTML" }),
  });
  if (!res.ok) {
    console.error("Telegram sendMessage (cancellation error) failed:", res.status, await res.text());
  }
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

    // ─── Phan 1: arrival-check (doi chieu, khong tu sua gi) ──────────────────
    const messageId = await findLatestArrivalEmailId(token);
    let arrivalDetail: Record<string, unknown> = { reason: "no_email_found" };
    let arrivalRows: ArrivalRow[] = [];
    let arrivalIssues: Issue[] = [];
    let arrivalEmailDate: string | null = null;

    if (messageId) {
      const message = await getMessage(token, messageId);
      arrivalEmailDate = message.internalDate
        ? new Date(Number(message.internalDate)).toISOString()
        : null;
      const html = extractHtmlBody(message.payload);
      arrivalRows = parseArrivalEmail(html);

      if (!dryRun) {
        const { data: alreadyProcessed, error: checkError } = await supabase.rpc(
          "check_arrival_email_processed",
          { p_email_message_id: messageId },
        );
        if (checkError) throw new Error(`check_arrival_email_processed failed: ${checkError.message}`);

        if (alreadyProcessed) {
          arrivalDetail = { reason: "already_processed", email_message_id: messageId };
        } else {
          arrivalIssues = await checkAgainstPMS(arrivalRows);

          const { error: ingestError } = await supabase.rpc("ingest_arrival_check", {
            p_email_message_id: messageId,
            p_email_date: arrivalEmailDate,
            p_issues: arrivalIssues,
          });
          if (ingestError) throw new Error(`ingest_arrival_check failed: ${ingestError.message}`);

          if (arrivalIssues.length > 0) await sendTelegramAlert(arrivalIssues);

          arrivalDetail = {
            email_message_id: messageId,
            rows_total: arrivalRows.length,
            missing_count: arrivalIssues.filter((i) => i.issue_type === "missing").length,
            mismatch_count: arrivalIssues.filter((i) => i.issue_type === "mismatch").length,
          };
        }
      }
    }

    // ─── Phan 2: cancellation-sync (doc lap voi phan 1, luon chay) ───────────
    const cancellationEmailIds = await findCancellationEmailIds(token);

    if (dryRun) {
      const cancellationPreview: Array<{ message_id: string; ota_booking_number: string | null; would_match_group_id: string | null; note: string }> = [];

      for (const emailId of cancellationEmailIds) {
        const msg = await getMessage(token, emailId);
        const subject = getHeader(msg.payload, "Subject");
        const from = getHeader(msg.payload, "From");

        if (!isConfirmedCancellationEmail(subject, from)) {
          cancellationPreview.push({
            message_id: emailId,
            ota_booking_number: null,
            would_match_group_id: null,
            note: `BO QUA - khong phai email huy that su (subject="${subject}", from="${from}")`,
          });
          continue;
        }

        const cHtml = extractHtmlBody(msg.payload);
        const resId = extractResId(cHtml);
        if (!resId) {
          cancellationPreview.push({ message_id: emailId, ota_booking_number: null, would_match_group_id: null, note: "khong tim thay res_id" });
          continue;
        }
        const { data: grp } = await supabase
          .from("groups")
          .select("id")
          .eq("ota_booking_number", resId)
          .eq("is_deleted", false)
          .maybeSingle();
        cancellationPreview.push({
          message_id: emailId,
          ota_booking_number: resId,
          would_match_group_id: grp?.id ?? null,
          note: grp ? "se huy neu chay that" : "khong khop group nao trong PMS",
        });
      }

      const arrivalIssuesForPreview = messageId && arrivalRows.length > 0 ? await checkAgainstPMS(arrivalRows) : [];

      return jsonResponse({
        dry_run: true,
        arrival_email_message_id: messageId,
        arrival_email_date: arrivalEmailDate,
        rows_parsed: arrivalRows.length,
        rows: arrivalRows,
        issues: arrivalIssuesForPreview,
        cancellation_emails_found: cancellationEmailIds.length,
        cancellation_preview: cancellationPreview,
      });
    }

    const cancellationResults: CancellationEmailResult[] = [];

    for (const emailId of cancellationEmailIds) {
      const { data: alreadyProcessed, error: checkError } = await supabase.rpc(
        "check_cancellation_email_processed",
        { p_email_message_id: emailId },
      );
      if (checkError) throw new Error(`check_cancellation_email_processed failed: ${checkError.message}`);

      if (alreadyProcessed) continue;

      const result = await processCancellationEmail(token, emailId);
      cancellationResults.push(result);

      const { error: logInsertError } = await supabase.rpc("ingest_cancellation_sync_log", {
        p_email_message_id: result.message_id,
        p_ota_booking_number: result.ota_booking_number ?? "unknown",
        p_result: result.result,
        p_group_id: result.group_id,
        p_bookings_cancelled_count: result.bookings_cancelled_count,
        p_error_message: result.error_message,
      });
      if (logInsertError) {
        console.error("ingest_cancellation_sync_log failed:", logInsertError.message);
      }
    }

    const cancellationErrors = cancellationResults.filter((r) => r.result === "error");
    if (cancellationErrors.length > 0) {
      await sendCancellationErrorAlert(cancellationErrors);
    }

    const detail = {
      arrival: arrivalDetail,
      cancellation_emails_processed: cancellationResults.length,
      cancellation_cancelled_count: cancellationResults.filter((r) => r.result === "cancelled").length,
      cancellation_already_cancelled_count: cancellationResults.filter((r) => r.result === "already_cancelled").length,
      cancellation_not_found_count: cancellationResults.filter((r) => r.result === "not_found").length,
      cancellation_error_count: cancellationErrors.length,
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
