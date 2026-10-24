// src/features/documents/utils/escapeHtml.ts
// Escape giá trị tự do (tên khách, ghi chú, tên dịch vụ, ...) trước khi nội suy vào
// HTML chứng từ. Preview dùng document.write / iframe srcdoc nên markup trong dữ liệu
// (vd. tên khách từ form công khai /book) sẽ bị render nguyên nếu không escape.
// Chỉ dùng cho phần HTML — KHÔNG dùng cho zaloText (plain text copy vào clipboard).

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}
