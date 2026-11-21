// Gửi báo cáo qua bot 2 (bot report, trước đây là bot finance).
// KHÔNG BAO GIỜ fallback về TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (bot 1 là bot vận hành).
// Thiếu secret -> ném lỗi rõ ràng để job báo "error" thay vì gửi nhầm bot.

export interface SendReportOptions {
  /** "HTML" nếu text có thẻ HTML. Bỏ trống = plain text. */
  parseMode?: "HTML";
  disableWebPagePreview?: boolean;
}

function getReportConfig(): { token: string; chatId: string } {
  const token = Deno.env.get("TELEGRAM_REPORT_BOT_TOKEN") ??
    Deno.env.get("TELEGRAM_FINANCE_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_REPORT_CHAT_ID") ??
    Deno.env.get("TELEGRAM_FINANCE_ALLOWED_CHAT_ID");
  if (!token || !chatId) {
    throw new Error(
      "Thieu secret bot report: can TELEGRAM_REPORT_BOT_TOKEN/TELEGRAM_REPORT_CHAT_ID " +
        "hoac TELEGRAM_FINANCE_BOT_TOKEN/TELEGRAM_FINANCE_ALLOWED_CHAT_ID",
    );
  }
  return { token, chatId };
}

/** Gửi 1 tin nhắn qua bot report. Ném lỗi nếu Telegram trả không ok (không nuốt 400). */
export async function sendReport(
  text: string,
  options: SendReportOptions = {},
): Promise<void> {
  const { token, chatId } = getReportConfig();

  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (options.parseMode) body.parse_mode = options.parseMode;
  if (options.disableWebPagePreview) body.disable_web_page_preview = true;

  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Loi mang cua Deno chua nguyen URL (kem token) -> che token truoc khi ném lên
    const raw = err instanceof Error ? err.message : String(err);
    throw new Error(`Telegram fetch that bai: ${raw.replaceAll(token, "***")}`);
  }

  if (!res.ok) {
    throw new Error(`Telegram sendMessage that bai: ${res.status} ${await res.text()}`);
  }
}
