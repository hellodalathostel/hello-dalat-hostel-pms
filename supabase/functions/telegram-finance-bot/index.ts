// Edge Function: telegram-finance-bot
// Nhan tin nhan Telegram (text hoac anh chuyen khoan), parse chi tieu,
// insert vao brain.personal_finances (qua RPC), public.expenses, hoac
// public.pass_through_transactions (thanh toan ho doi tac).
// Text: $0, keyword mapping. Anh: Claude Haiku vision (co phi nho, dang test).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_FINANCE_BOT_TOKEN')!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_FINANCE_WEBHOOK_SECRET')!;
const ALLOWED_CHAT_ID = Deno.env.get('TELEGRAM_FINANCE_ALLOWED_CHAT_ID')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// escapeHtml bat buoc cho moi text dong chen vao Telegram message (parse_mode="HTML")
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendTelegramMessage(chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error('Telegram sendMessage failed:', res.status, errBody);
  }
  return res;
}

// Parse so tien dang "25k", "1.2tr", "500000" tu text
function parseAmount(text: string): { amount: number; rest: string } | null {
  const trMatch = text.match(/(\d+(?:[.,]\d+)?)\s*tr\b/i);
  if (trMatch) {
    const amount = Math.round(parseFloat(trMatch[1].replace(',', '.')) * 1_000_000);
    return { amount, rest: text.replace(trMatch[0], '').trim() };
  }

  const kMatch = text.match(/(\d+(?:[.,]\d+)?)\s*k\b/i);
  if (kMatch) {
    const amount = Math.round(parseFloat(kMatch[1].replace(',', '.')) * 1_000);
    return { amount, rest: text.replace(kMatch[0], '').trim() };
  }

  const rawMatch = text.match(/\b(\d{4,})\b/);
  if (rawMatch) {
    const amount = parseInt(rawMatch[1], 10);
    return { amount, rest: text.replace(rawMatch[0], '').trim() };
  }

  return null;
}

// $0 - keyword mapping cho category hostel. Khong khop -> 'Khac', sua tay sau.
function classifyCategory(description: string): string {
  const desc = description.toLowerCase();

  const keywordMap: [string, string][] = [
    ['điện', 'Điện nước'], ['dien', 'Điện nước'], ['nước', 'Điện nước'], ['nuoc', 'Điện nước'],
    ['lương', 'Lương nhân viên'], ['luong', 'Lương nhân viên'], ['lợi', 'Lương nhân viên'],
    ['vệ sinh', 'Vệ sinh'], ['ve sinh', 'Vệ sinh'], ['dọn phòng', 'Vệ sinh'], ['don phong', 'Vệ sinh'],
    ['sửa', 'Sửa chữa'], ['sua', 'Sửa chữa'], ['bóng đèn', 'Sửa chữa'], ['bong den', 'Sửa chữa'],
    ['hỏng', 'Sửa chữa'], ['hong', 'Sửa chữa'], ['thay', 'Sửa chữa'],
    ['marketing', 'Marketing'], ['quảng cáo', 'Marketing'], ['quang cao', 'Marketing'], ['ads', 'Marketing'],
    ['thuế', 'Thuế & Phí'], ['thue', 'Thuế & Phí'], ['phí', 'Thuế & Phí'], ['phi', 'Thuế & Phí'],
  ];

  for (const [keyword, category] of keywordMap) {
    if (desc.includes(keyword)) return category;
  }
  return 'Khác';
}

// Tai anh tu Telegram bang file_id, tra ve base64
async function getTelegramFileBase64(fileId: string): Promise<string> {
  const fileInfoRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
  );
  const fileInfo = await fileInfoRes.json();
  const filePath = fileInfo.result.file_path;

  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`
  );
  const arrayBuffer = await fileRes.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Encode base64 theo chunk, tranh stack overflow voi String.fromCharCode(...bytes) tren anh lon
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Goi Claude Haiku vision de trich so tien + noi dung tu anh chuyen khoan
// (ZaloPay/MoMo/ShopeePay khong gui email nen khong dung duoc pipeline email co san)
async function extractFromScreenshot(
  base64Image: string
): Promise<{ amount: number; description: string } | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: base64Image },
              },
              {
                type: 'text',
                text: `Đây là ảnh chi tiết giao dịch từ ví điện tử (ZaloPay/MoMo/ShopeePay).

Ảnh có thể chứa NHIỀU số tiền khác nhau (số tiền ban đầu, số tiền giảm giá,
phí dịch vụ, số dư ví...). Chỉ lấy ĐÚNG 1 số: SỐ TIỀN GIAO DỊCH THỰC TẾ —
thường là số lớn nhất, đậm nhất, nằm ngay dưới tiêu đề "Thanh toán đơn hàng"
hoặc "Chuyển tiền", thường có dấu trừ (-) phía trước, đơn vị đ hoặc VNĐ.
BỎ QUA các dòng "Số tiền ban đầu", "Số tiền giảm", "Số dư ví sau giao dịch",
"Phí dịch vụ" — đó KHÔNG phải số tiền giao dịch chính.

Nội dung/mục đích: lấy từ dòng mô tả giao dịch, viết ngắn gọn dưới 10 từ tiếng Việt.

Trả lời DUY NHẤT dạng JSON thuần, KHÔNG kèm chữ giải thích, KHÔNG markdown fence:
{"amount": <số nguyên VNĐ>, "description": "<mô tả ngắn>"}

Nếu không đọc rõ số tiền: {"amount": 0, "description": ""}`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    console.log('extractFromScreenshot HTTP status:', response.status);
    console.log('extractFromScreenshot full response:', JSON.stringify(data));

    if (!response.ok) {
      console.error('Anthropic API error:', data.error?.message || 'Unknown error');
      return null;
    }

    const raw = data.content?.[0]?.text?.trim();
    if (!raw) {
      console.error('No text in response content:', JSON.stringify(data.content));
      return null;
    }

    const clean = raw.replace(/```json|```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : clean;

    const parsed = JSON.parse(jsonStr);

    if (typeof parsed.amount === 'number' && parsed.amount > 0) {
      return { amount: parsed.amount, description: parsed.description || 'chuyen khoan' };
    }
    return null;
  } catch (err) {
    console.error('extractFromScreenshot error:', err);
    return null;
  }
}

// Xac dinh nhanh dich (ca nhan / hostel / partner) tu 1 doan text (text hoac caption anh)
// Tra ve: nhanh + partner_name (neu co) + text da lam sach (bo prefix)
function detectTarget(rawText: string): {
  target: 'personal' | 'hostel' | 'partner';
  partnerName: string;
  cleanText: string;
} {
  const partnerMatch = rawText.match(/#partner\s+(\S+)/i);
  if (partnerMatch) {
    return {
      target: 'partner',
      partnerName: partnerMatch[1],
      cleanText: rawText.replace(/#partner\s+\S+/i, '').trim(),
    };
  }

  if (/#hostel\b/i.test(rawText)) {
    return {
      target: 'hostel',
      partnerName: '',
      cleanText: rawText.replace(/#hostel\b/i, '').trim(),
    };
  }

  return { target: 'personal', partnerName: '', cleanText: rawText.trim() };
}

Deno.serve(async (req) => {
  try {
    // Verify webhook secret - bat buoc, endpoint nay public
    const secretHeader = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secretHeader !== TELEGRAM_WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    const update = await req.json();
    const message = update.message;

    if (!message) {
      return new Response('OK', { status: 200 });
    }

    const chatId = String(message.chat.id);

    // Chi chap nhan chat_id da whitelist - khong reply de tranh lo thong tin cho chat la
    if (chatId !== ALLOWED_CHAT_ID) {
      console.warn('Rejected message from unauthorized chat_id:', chatId);
      return new Response('OK', { status: 200 });
    }

    let amount: number;
    let description: string;
    let target: 'personal' | 'hostel' | 'partner';
    let partnerName = '';
    let source = 'telegram_bot';

    if (message.photo && message.photo.length > 0) {
      // Xu ly anh chuyen khoan: lay ban lon nhat (phan tu cuoi trong mang photo)
      const largestPhoto = message.photo[message.photo.length - 1];
      const caption: string = message.caption || '';
      const detected = detectTarget(caption);
      target = detected.target;
      partnerName = detected.partnerName;
      source = 'telegram_bot_ocr';

      await sendTelegramMessage(chatId, '🔍 Đang đọc ảnh...');

      const base64Image = await getTelegramFileBase64(largestPhoto.file_id);
      const extracted = await extractFromScreenshot(base64Image);

      if (!extracted) {
        await sendTelegramMessage(
          chatId,
          '⚠️ Không đọc được số tiền từ ảnh. Vui lòng nhập tay, ví dụ: "momo 200k tien phong"'
        );
        return new Response('OK', { status: 200 });
      }

      amount = extracted.amount;
      // Uu tien mo ta nguoi dung go trong caption (sau khi bo prefix), fallback ve mo ta OCR
      description = detected.cleanText || extracted.description;
    } else if (message.text) {
      const text: string = message.text.trim();
      const detected = detectTarget(text);
      target = detected.target;
      partnerName = detected.partnerName;

      const parsed = parseAmount(detected.cleanText);
      if (!parsed) {
        await sendTelegramMessage(
          chatId,
          '⚠️ Không nhận diện được số tiền. Ví dụ: "cafe 25k", "#hostel bong den 45k", hoặc "#partner Tuan tien phong 500k"'
        );
        return new Response('OK', { status: 200 });
      }
      amount = parsed.amount;
      description = parsed.rest;
    } else {
      // Bo qua update khong phai text/photo (sticker, voice, v.v.)
      return new Response('OK', { status: 200 });
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    if (target === 'partner') {
      // Ghi vao public.pass_through_transactions - khoan thanh toan ho doi tac,
      // KHONG phai chi phi that (Hieu se thu lai tu doi tac sau)
      const { error } = await supabase.from('pass_through_transactions').insert({
        direction: 'paid_out',
        partner_name: partnerName,
        amount,
        transaction_date: today,
        note: description || null,
      });

      if (error) {
        console.error('Insert pass_through_transactions error:', error);
        await sendTelegramMessage(chatId, '❌ Lỗi khi ghi khoản thanh toán hộ. Kiểm tra logs.');
        return new Response('OK', { status: 200 });
      }

      await sendTelegramMessage(
        chatId,
        `✅ Đã ghi [Thanh toán hộ]: ${escapeHtml(partnerName)} - ${escapeHtml(description || '(không mô tả)')} - ${amount.toLocaleString('vi-VN')}đ\n💡 Nhớ theo dõi thu lại từ ${escapeHtml(partnerName)}`
      );
    } else if (target === 'hostel') {
      // Ghi vao public.expenses (hostel) - bang expose truc tiep qua PostgREST
      const category = classifyCategory(description || 'Khác');

      const { error } = await supabase.from('expenses').insert({
        category,
        description: description || null,
        amount,
        date: today,
      });

      if (error) {
        console.error('Insert expenses error:', error);
        await sendTelegramMessage(chatId, '❌ Lỗi khi ghi vào hostel expenses. Kiểm tra logs.');
        return new Response('OK', { status: 200 });
      }

      await sendTelegramMessage(
        chatId,
        `✅ Đã ghi [Hostel]: ${escapeHtml(description || '(không mô tả)')} - ${amount.toLocaleString('vi-VN')}đ\nCategory: ${escapeHtml(category)}`
      );
    } else {
      // Ghi vao brain.personal_finances qua RPC - brain schema khong expose qua PostgREST
      const { error } = await supabase.rpc('insert_personal_finance_txn', {
        p_date: today,
        p_category: 'Chi tiêu hàng ngày',
        p_description: description || null,
        p_amount: amount,
        p_source: source,
      });

      if (error) {
        console.error('Insert personal_finances error:', error);
        await sendTelegramMessage(chatId, '❌ Lỗi khi ghi vào personal finances. Kiểm tra logs.');
        return new Response('OK', { status: 200 });
      }

      await sendTelegramMessage(
        chatId,
        `✅ Đã ghi [Cá nhân]: ${escapeHtml(description || '(không mô tả)')} - ${amount.toLocaleString('vi-VN')}đ`
      );
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('telegram-finance-bot error:', err);
    return new Response('OK', { status: 200 }); // Luon tra 200 de Telegram khong retry lien tuc
  }
});