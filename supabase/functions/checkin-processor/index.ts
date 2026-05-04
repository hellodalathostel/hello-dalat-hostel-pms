// supabase/functions/ocr-id-scanner/index.ts
// Nhận ảnh CCCD/Passport (base64), gọi Gemini Vision API, trả về JSON chuẩn customers schema

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// CORS headers — bắt buộc cho Supabase Edge Functions
// ============================================================
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface OcrRequestBody {
  images: Array<{ data: string; mime_type: string }>;
  booking_id?: string;
}

const OCR_PROMPT = `Bạn là hệ thống OCR trích xuất thông tin từ CCCD/hộ chiếu Việt Nam.
Các ảnh có thể là:
- Nhiều mặt của cùng 1 CCCD (mặt trước + mặt sau) -> trả về 1 object
- Nhiều CCCD khác nhau -> trả về nhiều object

Trả về JSON array, KHÔNG có markdown, KHÔNG có giải thích:
[
  {
    "full_name": "...",
    "document_type": "CCCD" | "Hộ chiếu" | "Giấy tờ khác",
    "document_number": "...",
    "document_name": "...",
    "date_of_birth": "YYYY-MM-DD",
    "gender": "Nam" | "Nữ",
    "nationality": "VNM",
    "country": "VNM",
    "residency_type": "Thường trú" | "Tạm trú" | "Địa chỉ khác" | null,
    "province": "...",
    "district": "...",
    "ward": "...",
    "address_detail": "..."
  }
]
Nếu không đọc được trường nào -> để null. Luôn trả về array dù chỉ có 1 người.`;

// ============================================================
// Validate input cơ bản
// ============================================================
function validateInput(body: unknown): OcrRequestBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as OcrRequestBody;

  if (!Array.isArray(b.images) || b.images.length === 0) return null;

  for (const img of b.images) {
    if (!img || typeof img.data !== "string" || img.data.length === 0) {
      return null;
    }

    if (typeof img.mime_type !== "string" || img.mime_type.length === 0) {
      return null;
    }

    // Giới hạn kích thước base64 ~15MB (Gemini inline limit)
    if (img.data.length > 20_000_000) return null;
  }

  return {
    images: b.images,
    booking_id: typeof b.booking_id === "string" ? b.booking_id : undefined,
  };
}

// ============================================================
// Gọi Gemini Vision API (gemini-2.0-flash)
// ============================================================
async function callGeminiVision(
  body: OcrRequestBody,
  apiKey: string
): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `gemini-2.5-flash:generateContent?key=${apiKey}`;

  const imageParts = body.images.map((img) => ({
    inline_data: { mime_type: img.mime_type, data: img.data },
  }));

  const payload = {
    contents: [
      {
        parts: [
          ...imageParts,
          {
            text: OCR_PROMPT,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText}`);
  }

  const data = await response.json();

  // Trích xuất text từ response Gemini
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    throw new Error("Gemini trả về response rỗng");
  }
  return text;
}

// ============================================================
// Parse và validate JSON output từ Gemini
// ============================================================
function parseGeminiOutput(raw: string): Array<Record<string, unknown>> {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  if (Array.isArray(parsed)) return parsed;
  return [parsed];
}

// ============================================================
// Main handler
// ============================================================
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS, status: 204 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // ── Auth check ──────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Verify JWT với Supabase
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  // ────────────────────────────────────────────────────────

  // Parse và validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const input = validateInput(body);
  if (!input) {
    return new Response(
      JSON.stringify({
        error: "Thiếu trường 'images[]' hợp lệ hoặc ảnh quá lớn (>15MB)",
      }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  // Lấy Gemini API key từ Supabase Secrets
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) {
    console.error("[ocr-id-scanner] GEMINI_API_KEY chưa được set");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  // Gọi Gemini Vision
  let rawOutput: string;
  try {
    rawOutput = await callGeminiVision(input, geminiApiKey);
  } catch (err) {
    console.error("[ocr-id-scanner] Gemini call failed:", err);
    return new Response(
      JSON.stringify({
        error: "Không thể kết nối AI. Vui lòng thử lại.",
        detail: (err as Error).message,
      }),
      {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  // Parse JSON output
  let result: Array<Record<string, unknown>>;
  try {
    result = parseGeminiOutput(rawOutput);
  } catch (err) {
    console.error("[ocr-id-scanner] Parse failed. Raw output:", rawOutput);
    return new Response(
      JSON.stringify({
        error: "Không đọc được thông tin từ ảnh. Vui lòng chụp lại rõ hơn.",
        detail: (err as Error).message,
      }),
      {
        status: 422,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  // Thành công — KHÔNG log PII (số CCCD/Passport)
  console.log(
    `[ocr-id-scanner] OK — user=${user.id} guests=${result.length}`
  );

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
