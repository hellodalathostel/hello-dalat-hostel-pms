// supabase/functions/email-transaction-sync/index.ts
// Pipeline dong bo giao dich tu email ngan hang -> brain.card_transactions_raw
// Cron goi moi gio. Dedupe theo email_message_id (unique index co san).
// ?dry_run=1  -> parse va tra JSON, KHONG insert (dung de tune parser)
// ?days=N     -> doi cua so quet Gmail (mac dinh 3 ngay)
// Luu y: moi chuoi tieng Viet trong regex dung \uXXXX escape de an toan khi deploy qua MCP.

const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;
const GMAIL_REFRESH_TOKEN = Deno.env.get("GMAIL_REFRESH_TOKEN")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Nguon gui email ngan hang (tu brain.knowledge:make_gmail_brain_query — chi lay bank, bo booking.com)
const BANK_SENDERS = [
  "info@info.vietcombank.com.vn",
  "VCBDigibank@info.vietcombank.com.vn",
  "mbcard@mbbank.com.vn",
  "no-reply@mpos.vn",
  "info@card.vib.com.vn",
];

// Map domain -> ten bank + payment_method
function detectBank(from: string): { bank: string; payment_method: string } | null {
  const f = from.toLowerCase();
  if (f.includes("vietcombank.com.vn")) return { bank: "VCB", payment_method: "transfer" };
  if (f.includes("mbbank.com.vn")) return { bank: "MB", payment_method: "card" };
  if (f.includes("mpos.vn")) return { bank: "mPOS", payment_method: "card" };
  if (f.includes("vib.com.vn")) return { bank: "VIB", payment_method: "card" };
  return null;
}

interface ParsedTxn {
  bank: string;
  card_last4: string | null;
  txn_datetime: string;
  amount: number;
  currency: string;
  direction: "in" | "out";
  merchant_raw: string | null;
  payment_method: string;
  email_message_id: string;
  email_subject: string;
  raw_snippet: string;
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

async function listMessageIds(token: string, days: number): Promise<string[]> {
  const q = `from:(${BANK_SENDERS.join(" OR ")}) newer_than:${days}d`;
  const ids: string[] = [];
  let pageToken = "";
  // Toi da 3 trang x 100 = 300 email/lan chay — qua du cho hostel 8 phong
  for (let page = 0; page < 3; page++) {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("q", q);
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Gmail list failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    for (const m of json.messages ?? []) ids.push(m.id);
    pageToken = json.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return ids;
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

// ─── Body extraction ─────────────────────────────────────────────────────────

function b64urlDecode(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

// deno-lint-ignore no-explicit-any
function extractBodyText(payload: any): string {
  const parts: string[] = [];
  // deno-lint-ignore no-explicit-any
  function walk(p: any) {
    if (!p) return;
    if (p.body?.data && (p.mimeType?.startsWith("text/") || !p.mimeType)) {
      parts.push(b64urlDecode(p.body.data));
    }
    for (const child of p.parts ?? []) walk(child);
  }
  walk(payload);
  const raw = parts.join("\n");
  // Strip HTML tags + decode entity co ban -> plain text
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Parsers ─────────────────────────────────────────────────────────────────
// [PHONG DOAN] Regex dua tren format email pho bien — BAT BUOC chay dry_run
// doi chieu email that truoc khi bat cron, tune lai neu can.

function parseAmountStr(s: string): number {
  // "1,500,000" / "1.500.000" -> 1500000
  return Number(s.replace(/[.,\s]/g, ""));
}

function parseTxn(bank: string, text: string): {
  amount: number | null;
  direction: "in" | "out";
  card_last4: string | null;
  merchant_raw: string | null;
} {
  let amount: number | null = null;
  let direction: "in" | "out" = "out";

  // Pattern 1 (VCB bien dong so du): "vua tang/giam 500,000 VND"
  // "vừa tăng" = "vừa tăng", "giảm" = "giảm"
  const m1 = text.match(/vừa (tăng|giảm)\s+([\d.,]+)\s*(VND|USD)/i);
  if (m1) {
    direction = m1[1].toLowerCase() === "tăng" ? "in" : "out";
    amount = parseAmountStr(m1[2]);
  }

  // Pattern 2: "So tien: +500,000 VND" — "Số tiền" = "Số tiền"
  if (amount === null) {
    const m2 = text.match(/Số tiền(?:\s*giao\s*dịch)?\s*:?\s*([+-])?\s*([\d.,]+)\s*(VND|USD)?/i);
    if (m2) {
      if (m2[1] === "+") direction = "in";
      if (m2[1] === "-") direction = "out";
      amount = parseAmountStr(m2[2]);
    }
  }

  // Pattern 3 (fallback tieng Anh / mPOS): "Amount: 500,000 VND"
  if (amount === null) {
    const m3 = text.match(/Amount\s*:?\s*([\d.,]+)\s*(VND|USD)?/i);
    if (m3) amount = parseAmountStr(m3[1]);
  }

  // So the cuoi: "**** 1234" / "xxxx1234" / "*1234"
  const mCard = text.match(/(?:\*{1,4}|x{2,4})\s*(\d{4})\b/i);
  const card_last4 = mCard ? mCard[1] : null;

  // Merchant: "tại XYZ" = "tại XYZ" (giao dich the) hoac "Mô tả:" = "Mô tả:" (VCB)
  let merchant_raw: string | null = null;
  const mAt = text.match(/tại\s+([A-Z0-9][^.,;]{2,60})/);
  const mDesc = text.match(/Mô tả\s*:?\s*([^.;]{3,120})/);
  if (mAt) merchant_raw = mAt[1].trim();
  else if (mDesc) merchant_raw = mDesc[1].trim();

  // VCB tai khoan: neu khong co dau hieu direction ro rang thi giu 'out';
  // cac bank the (MB/VIB/mPOS) mac dinh 'out' (chi tieu).
  void bank;

  return { amount, direction, card_last4, merchant_raw };
}

// ─── Main ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Bao ve: cron/manual phai gui dung x-cron-key
  if (CRON_SECRET && req.headers.get("x-cron-key") !== CRON_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";
  const days = Math.min(Number(url.searchParams.get("days") ?? "3") || 3, 30);

  try {
    const token = await getAccessToken();
    const ids = await listMessageIds(token, days);

    if (ids.length === 0) {
      return json({ ok: true, scanned: 0, inserted: 0, skipped_existing: 0, parse_failed: [] });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const parsed: ParsedTxn[] = [];
    const parseFailed: Array<{ id: string; subject: string; reason: string }> = [];

    for (const id of ids) {
      const msg = await getMessage(token, id);
      const headers: Array<{ name: string; value: string }> = msg.payload?.headers ?? [];
      const from = headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
      const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "";

      const bankInfo = detectBank(from);
      if (!bankInfo) continue; // khong phai email bank (phong tru)

      const text = extractBodyText(msg.payload);
      const { amount, direction, card_last4, merchant_raw } = parseTxn(bankInfo.bank, text);

      if (amount === null || !Number.isFinite(amount) || amount <= 0) {
        parseFailed.push({ id, subject, reason: "khong parse duoc amount" });
        continue;
      }

      parsed.push({
        bank: bankInfo.bank,
        card_last4,
        txn_datetime: new Date(Number(msg.internalDate)).toISOString(),
        amount,
        currency: "VND",
        direction,
        merchant_raw,
        payment_method: bankInfo.payment_method,
        email_message_id: id, // gmail internal id — on dinh & unique
        email_subject: subject.slice(0, 300),
        raw_snippet: text.slice(0, 1000),
      });
    }

    if (dryRun) {
      return json({ ok: true, dry_run: true, scanned: ids.length, parsed, parse_failed: parseFailed });
    }

    let inserted = 0;
    if (parsed.length > 0) {
      const { data, error } = await supabase.rpc("ingest_card_transactions", {
        p_rows: parsed,
      });
      if (error) throw new Error(`ingest RPC failed: ${error.message}`);
      inserted = data as number;
    }

    return json({
      ok: true,
      scanned: ids.length,
      parsed: parsed.length,
      inserted,
      skipped_existing: parsed.length - inserted,
      parse_failed: parseFailed,
    });
  } catch (err) {
    console.error("email-transaction-sync error:", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
