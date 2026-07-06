// @ts-nocheck — Deno Edge Function, khong dung tsconfig cua repo chinh (Node/Vite). Runtime tu typecheck khi deploy qua Supabase CLI.
// Edge Function: telegram-finance-bot
// Nhận tin nhắn Telegram, parse chi tiêu, insert vào brain.personal_finances hoặc public.expenses
// $0 — không gọi LLM ngoài, dùng keyword mapping

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_FINANCE_BOT_TOKEN')!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_FINANCE_WEBHOOK_SECRET')!;
const ALLOWED_CHAT_ID = Deno.env.get('TELEGRAM_FINANCE_ALLOWED_CHAT_ID')!;

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

// $0 — keyword mapping thay LLM. Không khớp → 'Khác', sửa tay sau.
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

Deno.serve(async (req) => {
  try {
    const secretHeader = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secretHeader !== TELEGRAM_WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    const update = await req.json();
    const message = update.message;

    if (!message || !message.text) {
      return new Response('OK', { status: 200 });
    }

    const chatId = String(message.chat.id);
    const text: string = message.text.trim();

    if (chatId !== ALLOWED_CHAT_ID) {
      console.warn('Rejected message from unauthorized chat_id:', chatId);
      return new Response('OK', { status: 200 });
    }

    const isHostel = /#hostel\b/i.test(text);
    const cleanText = text.replace(/#hostel\b/i, '').trim();

    const parsed = parseAmount(cleanText);
    if (!parsed) {
      await sendTelegramMessage(
        chatId,
        '⚠️ Không nhận diện được số tiền. Ví dụ hợp lệ: "cafe 25k" hoặc "#hostel bong den 45k"'
      );
      return new Response('OK', { status: 200 });
    }

    const { amount, rest: description } = parsed;
    const today = new Date().toISOString().split('T')[0];

    if (isHostel) {
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
      // Ghi vào brain.personal_finances qua RPC (brain schema không expose qua PostgREST trực tiếp)
      const { error } = await supabase.rpc('insert_personal_finance_txn', {
        p_date: today,
        p_category: 'Chi tiêu hàng ngày',
        p_description: description || null,
        p_amount: amount,
        p_source: 'telegram_bot',
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
    return new Response('OK', { status: 200 });
  }
});