// Chênh lệch (đ) giữa tổng PMS (giá/đêm × số đêm) và tổng OTA gốc khi import PDF.
// Chỉ phục vụ HIỂN THỊ cảnh báo — không dùng để ghi room_subtotal/grand_total.
// Trả về 0 khi không có tổng OTA hoặc số đêm không hợp lệ.
export function getOtaRoundingDiff(otaTotal: number, pricePerNight: number, nights: number): number {
  if (otaTotal <= 0 || nights <= 0) return 0
  return pricePerNight * nights - otaTotal
}
