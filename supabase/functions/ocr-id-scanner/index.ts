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

// ============================================================
// System prompt cho Gemini Vision
// Trả về JSON thuần — KHÔNG có markdown backtick, KHÔNG có text ngoài JSON
// Field names khớp chính xác với bảng customers trong DB
// ============================================================
const SYSTEM_PROMPT = `
Bạn là OCR engine chuyên đọc CCCD Việt Nam và Passport quốc tế.
Trả về JSON hợp lệ. TUYỆT ĐỐI KHÔNG thêm markdown backtick, KHÔNG có text nào ngoài JSON.

Schema bắt buộc (trả về đúng tên field này):
{
  "full_name": string,
  "date_of_birth": string,
  "gender": "Nam" | "Nữ",
  "nationality": string,
  "country": string,
  "document_type": "CCCD" | "Hộ chiếu" | "Giấy tờ khác",
  "document_number": string,
  "province": string,
  "district": string | null,
  "ward": string,
  "address_detail": string,
  "residency_type": "Tạm trú" | null
}

RULES bắt buộc:

[Họ tên]
- CCCD Việt Nam: tiếng Việt có dấu chuẩn, dạng Hoa Đầu Chữ.
  Nếu ảnh in hoa không dấu (NGUYEN VAN AN) → tự phục dựng dấu chuẩn (Nguyễn Văn An).
  Nếu không chắc → trả về tên in hoa không dấu, KHÔNG được đoán sai.
- Passport nước ngoài: dạng Hoa Đầu Chữ Latin (John Smith).
  Ưu tiên đọc từ MRZ (đã chuẩn ASCII).
  Loại bỏ diacritics/accents: François → Francois, Müller → Muller.
  Chỉ dùng ký tự Latin cơ bản.

[Ngày sinh]
- Format: DD/MM/YYYY (ví dụ: 08/05/1998)

[Giới tính]
- Nam / Nữ (không dùng M/F)

[Quốc gia & Quốc tịch]
- CCCD Việt Nam → nationality = "VNM", country = "VNM"
- Passport → mã ISO 3166-1 alpha-3 (USA, GBR, FRA, AUS, JPN, KOR, CHN, DEU, v.v.)
- nationality = country (lấy cùng giá trị)

[Loại giấy tờ]
- CCCD Việt Nam → "CCCD"
- Passport bất kỳ quốc gia → "Hộ chiếu"
- Khác → "Giấy tờ khác"

[Số giấy tờ]
- Số CCCD (12 số) hoặc số Passport
- Không có dấu cách, không có ký tự lạ

[Địa chỉ — CHỈ ÁP DỤNG cho CCCD Việt Nam]
- Xác định đây là CCCD mặt trước (địa chỉ cũ) hay mặt sau (địa chỉ mới):
  * Địa chỉ CŨ (mặt trước CCCD): điền đủ province + district + ward + address_detail
  * Địa chỉ MỚI (mặt sau CCCD/VneID): district = null, chỉ điền province + ward + address_detail
- address_detail: CHỈ ghi số nhà và tên đường/ấp/khu phố. KHÔNG lặp lại phường/quận/tỉnh.
- Ví dụ đúng: "33/18/2 Phan Đình Phùng" hoặc "Tổ Dân Phố Số 3"
- Ví dụ SAI: "33/18/2 Phan Đình Phùng, Phường 1, Đà Lạt, Lâm Đồng"
- KHÔNG tra cứu, KHÔNG ánh xạ tỉnh sáp nhập — ghi đúng tên tỉnh trên CCCD dù tỉnh đó không còn tồn tại.
- residency_type = "Tạm trú" cho khách VN

[Địa chỉ — Passport nước ngoài]
- province = "", district = null, ward = "", residency_type = null
- address_detail = tên quốc gia bằng tiếng Anh (ví dụ: "United Kingdom", "France", "Australia")
  Nếu Passport có địa chỉ thì dùng địa chỉ đó.

[Trường không đọc được]
- Trả về chuỗi rỗng "" (KHÔNG trả về null), ngoại trừ district và residency_type được phép null.
`.trim();

// ============================================================
// Validate input cơ bản
// ============================================================
function validateInput(
  body: unknown
): { image: string; mime_type: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.image !== "string" || b.image.length === 0) return null;
  // mime_type mặc định jpeg nếu không truyền
  const mime_type =
    typeof b.mime_type === "string" ? b.mime_type : "image/jpeg";
  // Giới hạn kích thước base64 ~15MB (Gemini inline limit)
  if (b.image.length > 20_000_000) return null;
  return { image: b.image, mime_type };
}

// ============================================================
// Gọi Gemini Vision API (gemini-2.0-flash)
// ============================================================
async function callGeminiVision(
  base64Image: string,
  mimeType: string,
  apiKey: string
): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `gemini-2.5-flash:generateContent?key=${apiKey}`;

  const payload = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image,
            },
          },
          {
            text: "Đọc thông tin trên giấy tờ tùy thân này và trả về JSON theo schema đã định nghĩa.",
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,       // Low temp để giảm hallucination
      maxOutputTokens: 1024,
      responseMimeType: "application/json", // Yêu cầu Gemini trả JSON trực tiếp
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
function parseGeminiOutput(raw: string): Record<string, unknown> {
  // Strip markdown backticks nếu Gemini vẫn trả về (defensive)
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned); // Throw nếu không phải JSON hợp lệ

  // Validate các field bắt buộc
  const required = ["full_name", "document_type", "document_number"];
  for (const field of required) {
    if (typeof parsed[field] !== "string") {
      throw new Error(`Field bắt buộc thiếu hoặc sai type: ${field}`);
    }
  }

  // Normalize: đảm bảo các field string không phải undefined
  const stringFields = [
    "full_name", "date_of_birth", "gender", "nationality", "country",
    "document_type", "document_number", "province", "ward", "address_detail",
  ];
  for (const f of stringFields) {
    if (parsed[f] === undefined || parsed[f] === null) {
      parsed[f] = "";
    }
  }

  // district và residency_type được phép null
  if (parsed.district === undefined) parsed.district = null;
  if (parsed.residency_type === undefined) parsed.residency_type = null;

  return parsed;
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
        error: "Thiếu trường 'image' (base64) hoặc ảnh quá lớn (>15MB)",
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
    rawOutput = await callGeminiVision(
      input.image,
      input.mime_type,
      geminiApiKey
    );
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
  let result: Record<string, unknown>;
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
    `[ocr-id-scanner] OK — user=${user.id} doc_type=${result.document_type}`
  );

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
