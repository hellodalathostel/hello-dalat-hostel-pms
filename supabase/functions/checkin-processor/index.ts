// supabase/functions/checkin-processor/index.ts
// v17 — thêm debug logging để tìm nguyên nhân 422

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const OCR_PROMPT = `Ban la he thong OCR trich xuat thong tin tu CCCD/ho chieu Viet Nam.
Cac anh co the la:
- Nhieu mat cua cung 1 CCCD (mat truoc + mat sau) -> tra ve 1 object
- Nhieu CCCD khac nhau -> tra ve nhieu object

Tra ve JSON array, KHONG co markdown, KHONG co giai thich:
[
  {
    "full_name": "...",
    "document_type": "CCCD",
    "document_number": "...",
    "document_name": "...",
    "date_of_birth": "YYYY-MM-DD",
    "gender": "Nam",
    "nationality": "VNM",
    "country": "VNM",
    "residency_type": null,
    "province": "...",
    "district": "...",
    "ward": "...",
    "address_detail": "..."
  }
]
Neu khong doc duoc truong nao -> de null. Luon tra ve array du chi co 1 nguoi.`;

function validateInput(body: unknown): OcrRequestBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as OcrRequestBody;
  if (!Array.isArray(b.images) || b.images.length === 0) return null;
  for (const img of b.images) {
    if (!img || typeof img.data !== "string" || img.data.length === 0) return null;
    if (typeof img.mime_type !== "string" || img.mime_type.length === 0) return null;
    if (img.data.length > 20_000_000) return null;
  }
  return {
    images: b.images,
    booking_id: typeof b.booking_id === "string" ? b.booking_id : undefined,
  };
}

async function callGeminiVision(body: OcrRequestBody, apiKey: string): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `gemini-2.5-flash:generateContent?key=${apiKey}`;

  const imageParts = body.images.map((img) => ({
    inline_data: { mime_type: img.mime_type, data: img.data },
  }));

  const payload = {
    contents: [{
      parts: [
        ...imageParts,
        { text: OCR_PROMPT },
      ],
    }],
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

  // DEBUG: log chi metadata, KHONG log text_preview vi day la noi dung trich xuat tu CCCD/Passport (PII)
  console.log("[checkin-processor] Gemini response:", JSON.stringify({
    candidates_count: data?.candidates?.length,
    finish_reason: data?.candidates?.[0]?.finishReason,
    parts_count: data?.candidates?.[0]?.content?.parts?.length,
    has_text: Boolean(data?.candidates?.[0]?.content?.parts?.[0]?.text),
    prompt_feedback: data?.promptFeedback,
    usage: data?.usageMetadata,
  }));

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    const blockReason = data?.promptFeedback?.blockReason;
    const finishReason = data?.candidates?.[0]?.finishReason;
    throw new Error(`Gemini response rong. blockReason=${blockReason}, finishReason=${finishReason}`);
  }
  return text;
}

function parseGeminiOutput(raw: string): Array<Record<string, unknown>> {
  // Bước 1: Strip markdown fences nếu có
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Bước 2: Tìm block JSON cân bằng ngoặc (ưu tiên array, fallback object)
  const extractBalanced = (input: string, openChar: "[" | "{", closeChar: "]" | "}") => {
    const start = input.indexOf(openChar);
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < input.length; i++) {
      const ch = input[i];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === openChar) {
        depth++;
      } else if (ch === closeChar) {
        depth--;
        if (depth === 0) {
          return input.slice(start, i + 1);
        }
      }
    }

    return null;
  };

  const jsonStr =
    extractBalanced(cleaned, "[", "]") ??
    extractBalanced(cleaned, "{", "}") ??
    cleaned;

  // DEBUG: log do dai string truoc khi parse, KHONG log noi dung (chua PII tu CCCD/Passport)
  console.log("[checkin-processor] parseGeminiOutput length:", jsonStr.length);

  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // Fallback cho lỗi JSON phổ biến: trailing commas
    const normalized = jsonStr
      .replace(/,\s*([}\]])/g, "$1")
      .trim();
    const parsed = JSON.parse(normalized);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS, status: 204 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

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
      JSON.stringify({ error: "Thieu truong 'images[]' hop le hoac anh qua lon (>15MB)" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) {
    console.error("[checkin-processor] GEMINI_API_KEY chua duoc set");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  let rawOutput: string;
  try {
    rawOutput = await callGeminiVision(input, geminiApiKey);
  } catch (err) {
    console.error("[checkin-processor] Gemini call failed:", (err as Error).message);
    return new Response(
      JSON.stringify({
        error: "Khong the ket noi AI. Vui long thu lai.",
        detail: (err as Error).message,
      }),
      { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  let result: Array<Record<string, unknown>>;
  try {
    result = parseGeminiOutput(rawOutput);
  } catch (err) {
    // Khong log raw output / raw_preview ra response hoac console — day la PII tu CCCD/Passport
    console.error("[checkin-processor] Parse failed:", (err as Error).message);
    console.error("[checkin-processor] Raw output length:", rawOutput.length);
    return new Response(
      JSON.stringify({
        error: "Khong doc duoc thong tin tu anh. Vui long chup lai ro hon.",
        detail: (err as Error).message,
      }),
      { status: 422, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  console.log(`[checkin-processor] OK — user=${user.id} guests=${result.length}`);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});