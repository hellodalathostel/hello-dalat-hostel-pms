import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// ─── Constants ───────────────────────────────────────────────────────────────
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API_BASE  = 'https://gmail.googleapis.com/gmail/v1/users/me';
const MPOS_SENDERS    = ['no-reply@mpos.vn', 'doisoat@mpos.vn'];
const MPOS_FEE_RATE   = 4.00; // %

// ─── Types ───────────────────────────────────────────────────────────────────
interface MposTransaction {
  mpos_txn_id:      string;
  transaction_at:   string; // ISO string
  gross_amount:     number;
  fee_rate:         number;
  fee_amount:       number;
  net_amount:       number;
  card_number:      string | null;
  email_message_id: string;
}

// ─── Gmail Auth ──────────────────────────────────────────────────────────────
async function getAccessToken(): Promise<string> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     Deno.env.get('GMAIL_CLIENT_ID')!,
      client_secret: Deno.env.get('GMAIL_CLIENT_SECRET')!,
      refresh_token: Deno.env.get('GMAIL_REFRESH_TOKEN')!,
      grant_type:    'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

// ─── Gmail API helpers ────────────────────────────────────────────────────────
async function gmailFetch(path: string, token: string): Promise<unknown> {
  const res = await fetch(`${GMAIL_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function buildQuery(): string {
  const senderQ = MPOS_SENDERS.map(s => `from:${s}`).join(' OR ');
  return `(${senderQ}) subject:("Hóa đơn giao dịch" OR "THỐNG KÊ GIAO DỊCH HÀNG TUẦN")`;
}

// ─── Email body decoder ───────────────────────────────────────────────────────
function decodeBody(payload: Record<string, unknown>): string {
  // Try direct body first
  const body = payload.body as { data?: string; size?: number } | undefined;
  if (body?.data) {
    return atob(body.data.replace(/-/g, '+').replace(/_/g, '/'));
  }
  // Recurse into parts
  const parts = payload.parts as Record<string, unknown>[] | undefined;
  if (parts) {
    for (const part of parts) {
      const mimeType = part.mimeType as string;
      if (mimeType === 'text/plain' || mimeType === 'text/html') {
        const partBody = part.body as { data?: string } | undefined;
        if (partBody?.data) {
          return atob(partBody.data.replace(/-/g, '+').replace(/_/g, '/'));
        }
      }
      // Nested multipart
      if (mimeType?.startsWith('multipart/')) {
        const nested = decodeBody(part as Record<string, unknown>);
        if (nested) return nested;
      }
    }
  }
  return '';
}

// ─── MPOS invoice parser ──────────────────────────────────────────────────────
// Parses email: "Hóa đơn giao dịch - 20260505112497865215"
function parseInvoiceEmail(
  messageId: string,
  body: string
): MposTransaction | null {
  try {
    // Giá trị giao dịch: 792000
    const amountMatch = body.match(/Gi[áa]\s*tr[ịi]\s*giao\s*d[ịi]ch[:\s]+([\d,\.]+)/i);
    // Ngày thực hiện giao dịch: 05-05-2026 11:24:40
    const dateMatch   = body.match(/Ng[àa]y\s*th[ựu]c\s*hi[ệe]n.*?[:\s]+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})/i);
    // Mã giao dịch: 20260505112497865215
    const txnIdMatch  = body.match(/M[ãa]\s*giao\s*d[ịi]ch[:\s]+(\d{10,25})/i);
    // Số thẻ: 400129******1041
    const cardMatch   = body.match(/S[ốo]\s*th[ẻe][:\s]+([\d\*]+)/i);

    if (!amountMatch || !dateMatch || !txnIdMatch) return null;

    const grossAmount = parseInt(amountMatch[1].replace(/[,\.]/g, ''), 10);
    const feeAmount   = Math.round(grossAmount * MPOS_FEE_RATE / 100);
    const netAmount   = grossAmount - feeAmount;

    // Parse date: 05-05-2026 11:24:40 → ISO
    const [datePart, timePart] = dateMatch[1].trim().split(' ');
    const [dd, mm, yyyy]       = datePart.split('-');
    const transactionAt        = `${yyyy}-${mm}-${dd}T${timePart}+07:00`;

    return {
      mpos_txn_id:      txnIdMatch[1].trim(),
      transaction_at:   transactionAt,
      gross_amount:     grossAmount,
      fee_rate:         MPOS_FEE_RATE,
      fee_amount:       feeAmount,
      net_amount:       netAmount,
      card_number:      cardMatch ? cardMatch[1].trim() : null,
      email_message_id: messageId,
    };
  } catch {
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Security: chỉ cho phép internal cron hoặc service_role key
  const authHeader = req.headers.get('Authorization') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const isServiceRole = authHeader === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;
  const isCron        = authHeader === `Bearer ${cronSecret}` && cronSecret !== '';

  if (!isServiceRole && !isCron) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const results = {
    fetched:    0,
    imported:   0,
    duplicates: 0,
    skipped:    0,
    errors:     [] as string[],
  };

  try {
    const token = await getAccessToken();

    // Fetch danh sách message IDs — tối đa 50 email gần nhất từ MPOS
    const query    = buildQuery();
    const listData = await gmailFetch(
      `/messages?maxResults=50&q=${encodeURIComponent(query)}`,
      token
    ) as { messages?: { id: string }[] };

    const messages = listData.messages ?? [];
    results.fetched = messages.length;

    for (const msg of messages) {
      try {
        // Kiểm tra duplicate trước khi fetch full message
        const { data: existing } = await supabase
          .from('cash_transactions')
          .select('id')
          .eq('email_message_id', msg.id)
          .maybeSingle();

        if (existing) {
          results.duplicates++;
          continue;
        }

        // Fetch full message
        const fullMsg = await gmailFetch(`/messages/${msg.id}`, token) as {
          payload:  Record<string, unknown>;
          snippet:  string;
        };

        // Chỉ xử lý email hóa đơn từng GD (no-reply@mpos.vn)
        // Bỏ qua email thống kê tuần (doisoat@mpos.vn) — dùng để reconcile thủ công
        const headers = (fullMsg.payload.headers as { name: string; value: string }[]) ?? [];
        const fromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value ?? '';
        const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject')?.value ?? '';

        const isInvoice = fromHeader.includes('no-reply@mpos.vn') &&
                          subjectHeader.toLowerCase().includes('hóa đơn giao dịch');

        if (!isInvoice) {
          results.skipped++;
          continue;
        }

        const body = decodeBody(fullMsg.payload);
        const txn  = parseInvoiceEmail(msg.id, body);

        if (!txn) {
          results.errors.push(`Parse failed: ${msg.id} — subject: ${subjectHeader}`);
          continue;
        }

        // Insert vào cash_transactions
        const { error: insertError } = await supabase
          .from('cash_transactions')
          .insert({
            txn_type:         'income',
            channel:          'mpos',
            txn_date:         txn.transaction_at.substring(0, 10),
            amount:           txn.net_amount,
            gross_amount:     txn.gross_amount,
            fee_rate:         txn.fee_rate,
            fee_amount:       txn.fee_amount,
            net_amount:       txn.net_amount,
            mpos_txn_id:      txn.mpos_txn_id,
            card_number:      txn.card_number,
            email_message_id: txn.email_message_id,
            imported_at:      new Date().toISOString(),
            description:      'MPOS - Quẹt thẻ',
          });

        if (insertError) {
          // Unique constraint violation = duplicate — safe to ignore
          if (insertError.code === '23505') {
            results.duplicates++;
          } else {
            results.errors.push(`Insert error ${msg.id}: ${insertError.message}`);
          }
        } else {
          results.imported++;
        }
      } catch (msgErr) {
        results.errors.push(`Message ${msg.id}: ${(msgErr as Error).message}`);
      }
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message, results }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, results }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
