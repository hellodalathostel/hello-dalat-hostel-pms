// Edge Function: telegram-finance-bot
// Nhận tin nhắn Telegram (text hoặc ảnh chuyển khoản), parse chi tiêu,
// insert vào brain.personal_finances (qua RPC) hoặc public.expenses.
// Text: $0, keyword mapping. Ảnh: Claude Haiku vision (co phi nho, dang test 1 thang).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_FINANCE_BOT_TOKEN')!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_FINANCE_WEBHOOK_SECRET')!;
const ALLOWED_CHAT_ID = Deno.env.get('TELEGRAM_FINANCE_ALLOWED_CHAT_ID')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// escapeHtml bắt buộc cho mọi text động chèn vào Telegram message (parse_mode="HTML")
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

// Parse số tiền dạng "25k", "1.2tr", "500000" từ text
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

// $0 — keyword mapping cho category hostel. Không khớp -> 'Khác', sửa tay sau.
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

// Tải ảnh từ Telegram bằng file_id, trả về base64
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

  // Encode base64 theo chunk, tránh stack overflow với String.fromCharCode(...bytes) trên ảnh lớn
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Gọi Claude Haiku vision để trích số tiền + nội dung từ ảnh chuyển khoản
// (ZaloPay/MoMo/ShopeePay không gửi email nên không dùng được pipeline email hiện có)
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
        max_tokens: 200,
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
                text: `Đây là ảnh chụp màn hình xác nhận chuyển khoản (ZaloPay/MoMo/ShopeePay).
Trích ra CHÍNH XÁC số tiền giao dịch (VNĐ, chỉ số nguyên, không dấu chấm/phẩy)
và nội dung/mục đích chuyển khoản (ngắn gọn, dưới 10 từ, tiếng Việt).
Trả lời DUY NHẤT dạng JSON, không thêm gì khác:
{"amount": <số>, "description": "<mô tả ngắn>"}
Nếu không đọc được số tiền rõ ràng, trả về {"amount": 0, "description": ""}`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    const raw = data.content?.[0]?.text?.trim();
    if (!raw) return null;

    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    if (typeof parsed.amount === 'number' && parsed.amount > 0) {
      return { amount: parsed.amount, description: parsed.description || 'chuyen khoan' };
    }
    return null;
  } catch (err) {
    console.error('extractFromScreenshot error:', err);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    // Verify webhook secret — bắt buộc, endpoint này public
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

    // Chỉ chấp nhận chat_id đã whitelist — không reply để tránh lộ thông tin cho chat lạ
    if (chatId !== ALLOWED_CHAT_ID) {
      console.warn('Rejected message from unauthorized chat_id:', chatId);
      return new Response('OK', { status: 200 });
    }

    let amount: number;
    let description: string;
    let isHostel = false;
    let source = 'telegram_bot';

    if (message.photo && message.photo.length > 0) {
      // Xử lý ảnh chuyển khoản: lấy bản lớn nhất (phần tử cuối trong mảng photo)
      const largestPhoto = message.photo[message.photo.length - 1];
      const caption: string = message.caption || '';
      isHostel = /#hostel\b/i.test(caption);
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
      description = extracted.description;
    } else if (message.text) {
      const text: string = message.text.trim();
      isHostel = /#hostel\b/i.test(text);
      const cleanText = text.replace(/#hostel\b/i, '').trim();

      const parsed = parseAmount(cleanText);
      if (!parsed) {
        await sendTelegramMessage(
          chatId,
          '⚠️ Không nhận diện được số tiền. Ví dụ hợp lệ: "cafe 25k" hoặc "#hostel bong den 45k"'
        );
        return new Response('OK', { status: 200 });
      }
      amount = parsed.amount;
      description = parsed.rest;
    } else {
      // Bỏ qua update không phải text/photo (sticker, voice, v.v.)
      return new Response('OK', { status: 200 });
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    if (isHostel) {
      // Ghi vào public.expenses (hostel) — bảng expose trực tiếp qua PostgREST
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
      // Ghi vào brain.personal_finances qua RPC — brain schema không expose qua PostgREST
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
    return new Response('OK', { status: 200 }); // Luôn trả 200 để Telegram không retry liên tục
  }
});