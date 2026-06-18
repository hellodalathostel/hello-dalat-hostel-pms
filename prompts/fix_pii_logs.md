# FIX: Xóa PII logging trong check-in flow

## Bối cảnh
Codex code review phát hiện 2 vị trí log PII (CCCD/Passport) vi phạm nguyên tắc số 6
(PII không log/cache/URL params). Đây là fix bảo mật, không phải refactor — chỉ xóa/thay log,
KHÔNG đổi logic nghiệp vụ.

---

## FILE 1: `src/features/checkin/hooks/useCheckIn.ts`

### Vấn đề
Dòng 26-28 log toàn bộ payload `guests` (chứa `document_number`, `full_name`, ngày sinh...)
ra console khi `import.meta.env.DEV === true`. Dù chỉ chạy ở DEV, đây vẫn là PII trong console
log — có thể lộ qua remote debugging, session recording, hoặc dev tunnel.

### Tìm đoạn này:
```ts
		mutationFn: async ({ booking_id, guests }: CheckinPayload) => {
			if (import.meta.env.DEV) {
				console.log('checkin payload:', JSON.stringify({ p_booking_id: booking_id, p_guests: guests }, null, 2))
			}
			
			const { data, error } = await supabase.rpc('checkin_booking_txn', {
```

### Thay bằng:
```ts
		mutationFn: async ({ booking_id, guests }: CheckinPayload) => {
			if (import.meta.env.DEV) {
				// Chỉ log metadata, KHÔNG log nội dung guests (chứa PII: document_number, full_name, ngày sinh)
				console.log('checkin payload:', { booking_id, guests_count: guests.length })
			}

			const { data, error } = await supabase.rpc('checkin_booking_txn', {
```

**Lý do:** vẫn giữ khả năng debug (biết booking_id nào, bao nhiêu khách) nhưng không serialize
object `guests` chứa PII.

---

## FILE 2: `supabase/functions/checkin-processor/index.ts`

### Vấn đề A — log Gemini response structure có `text_preview`
Đoạn log debug bao gồm `text_preview` — 500 ký tự đầu của text response từ Gemini, đây CHÍNH LÀ
JSON chứa thông tin trích xuất từ CCCD/Passport (document_number, full_name, address...).

### Tìm đoạn này (trong hàm `callGeminiVision`):
```ts
  // DEBUG: log Gemini response structure (khong log image data / PII)
  console.log("[checkin-processor] Gemini response:", JSON.stringify({
    candidates_count: data?.candidates?.length,
    finish_reason: data?.candidates?.[0]?.finishReason,
    parts_count: data?.candidates?.[0]?.content?.parts?.length,
    text_preview: (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").substring(0, 500),
    prompt_feedback: data?.promptFeedback,
    usage: data?.usageMetadata,
  }));
```

### Thay bằng:
```ts
  // DEBUG: log chi metadata, KHONG log text_preview vi day la noi dung trich xuat tu CCCD/Passport (PII)
  console.log("[checkin-processor] Gemini response:", JSON.stringify({
    candidates_count: data?.candidates?.length,
    finish_reason: data?.candidates?.[0]?.finishReason,
    parts_count: data?.candidates?.[0]?.content?.parts?.length,
    has_text: Boolean(data?.candidates?.[0]?.content?.parts?.[0]?.text),
    prompt_feedback: data?.promptFeedback,
    usage: data?.usageMetadata,
  }));
```

### Vấn đề B — log `parseGeminiOutput preview`
### Tìm đoạn này (trong hàm `parseGeminiOutput`):
```ts
  // DEBUG: log truoc khi parse
  console.log("[checkin-processor] parseGeminiOutput preview:", jsonStr.substring(0, 300));
```

### Thay bằng:
```ts
  // DEBUG: log do dai string truoc khi parse, KHONG log noi dung (chua PII tu CCCD/Passport)
  console.log("[checkin-processor] parseGeminiOutput length:", jsonStr.length);
```

### Vấn đề C — log raw output khi parse fail (error path)
### Tìm đoạn này:
```ts
  try {
    result = parseGeminiOutput(rawOutput);
  } catch (err) {
    // Log day du de debug — raw output khong chua PII vi la JSON schema
    console.error("[checkin-processor] Parse failed:", (err as Error).message);
    console.error("[checkin-processor] Raw output (500 chars):", rawOutput.substring(0, 500));
    return new Response(
      JSON.stringify({
        error: "Khong doc duoc thong tin tu anh. Vui long chup lai ro hon.",
        detail: (err as Error).message,
        raw_preview: rawOutput.substring(0, 200),
      }),
      { status: 422, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
```

**Lưu ý quan trọng:** comment gốc nói "raw output khong chua PII vi la JSON schema" — ĐIỀU NÀY SAI.
`rawOutput` là JSON do Gemini trả về, chính là `document_number`, `full_name`, `address_detail`
trích xuất từ CCCD/Passport thật. Đây là PII, không phải schema rỗng.

### Thay bằng:
```ts
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
```

**Lưu ý:** đã xóa cả field `raw_preview` trong response trả về frontend — vì response này có thể
hiện trong Network tab của browser DevTools, vẫn là một dạng "log"/lưu trữ PII không cần thiết.

---

## FILE 3 (dọn dẹp, không bắt buộc nhưng nên làm): `src/hooks/useCheckIn.ts`

### Vấn đề
File này là **bản trùng tên với FILE 1**, nằm ở path khác (`src/hooks/` thay vì
`src/features/checkin/hooks/`). Nội dung gần giống nhưng cũ hơn — dùng `import { message } from 'antd'`
trực tiếp thay vì `useAppFeedback`, không có debug log PII (vì là bản cũ chưa thêm log).

`CheckInModal.tsx` import từ `@/features/checkin/hooks/useCheckIn` — tức FILE 1 đang được dùng thật.
File này (`src/hooks/useCheckIn.ts`) **nghi là dead code**.

### Hành động đề xuất
1. Chạy global search trong repo: `grep -r "from '@/hooks/useCheckIn'" src/` (hoặc tương đương trong IDE)
2. Nếu KHÔNG có import nào trỏ tới `src/hooks/useCheckIn.ts` → xóa file này luôn (dead code, giảm rủi ro
   nhầm lẫn sau này khi có người sửa nhầm bản không dùng).
3. Nếu CÓ import trỏ tới file này ở đâu đó → báo lại cho Claude.ai biết chỗ nào dùng, để quyết định
   merge 2 bản hay giữ tách riêng có chủ đích.

**KHÔNG tự xóa nếu chưa chạy bước 1 — chỉ xóa khi xác nhận chắc chắn không có import nào dùng.**

---

## Checklist sau khi sửa
- [ ] FILE 1: build `tsc --noEmit` không lỗi
- [ ] FILE 2: deploy lại Edge Function `checkin-processor` (`supabase functions deploy checkin-processor --no-verify-jwt`
      nếu function này cần no-verify-jwt — kiểm tra `config.toml` trước khi quyết định flag này)
- [ ] FILE 3: đã chạy grep xác nhận dead code trước khi xóa (nếu xóa)
- [ ] Test thử 1 lần check-in thật (manual hoặc qua KBTT import) để chắc flow vẫn hoạt động đúng
- [ ] Không còn `text_preview`, `raw_preview`, `JSON.stringify(...guests...)` nào log ra console
      trong 2 file trên