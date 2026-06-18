import ExcelJS from 'exceljs'
import dayjs from 'dayjs'
import type { S1aRow } from '../hooks/useS1aReport'

// Thông tin cố định HKD — không query, lấy từ hồ sơ đăng ký kinh doanh
const HKD_INFO = {
  name: 'Chào Đà Lạt',
  address: '33/18/2 Phan Đình Phùng, P.1, Đà Lạt',
  taxCode: '068060000252',
}

const FONT_NAME = 'Times New Roman'
const FONT_SIZE = 13

const mediumBorder: Partial<ExcelJS.Border> = { style: 'medium' }
const fullBorder: Partial<ExcelJS.Borders> = {
  top: mediumBorder,
  bottom: mediumBorder,
  left: mediumBorder,
  right: mediumBorder,
}

/**
 * Xuất file Excel "Sổ chi tiết doanh thu bán hàng hóa, dịch vụ" — Mẫu số S1a-HKD
 * theo đúng layout Thông tư 152 (header HKD/MST, border medium, dòng ký tên).
 * Dùng ExcelJS để giữ style đầy đủ (font, border, bold) — xlsx/SheetJS không hỗ trợ đủ.
 */
export async function exportS1aExcel(rows: S1aRow[], nam: number): Promise<void> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Mẫu số S1a-HKD')

  ws.columns = [
    { width: 14 }, // A - Ngày tháng
    { width: 50 }, // B - Giao dịch
    { width: 18 }, // C - Số tiền
  ]

  // ─── Header HKD ─────────────────────────────────────────
  const headerRows: [string, boolean][] = [
    [`HỘ, CÁ NHÂN KINH DOANH: ${HKD_INFO.name}`, true],
    [`Địa chỉ: ${HKD_INFO.address}`, true],
    [`Mã số thuế: ${HKD_INFO.taxCode}`, true],
  ]
  headerRows.forEach(([text, bold]) => {
    const row = ws.addRow([text])
    row.getCell(1).font = { name: FONT_NAME, size: FONT_SIZE, bold }
    row.getCell(1).alignment = { vertical: 'middle' }
  })

  ws.addRow([]) // dòng trống

  // ─── Title (centerContinuous A:C) ──────────────────────
  const titleRows: [string, boolean, boolean][] = [
    ['SỔ CHI TIẾT DOANH THU BÁN HÀNG HÓA, DỊCH VỤ', true, false],
    [`Địa điểm kinh doanh: ${HKD_INFO.address}`, false, false],
    [`Kỳ kê khai: Năm ${nam}`, false, false],
  ]
  titleRows.forEach(([text, bold]) => {
    const row = ws.addRow([text])
    ws.mergeCells(row.number, 1, row.number, 3)
    row.getCell(1).font = { name: FONT_NAME, size: FONT_SIZE, bold }
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  })

  ws.addRow([]) // dòng trống

  // ─── Header bảng ────────────────────────────────────────
  const tableHeaderRow = ws.addRow(['Ngày tháng', 'Giao dịch', 'Số tiền'])
  tableHeaderRow.eachCell((cell) => {
    cell.font = { name: FONT_NAME, size: FONT_SIZE, bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = fullBorder
  })

  const labelRow = ws.addRow(['A', 'B', 1])
  labelRow.eachCell((cell) => {
    cell.font = { name: FONT_NAME, size: FONT_SIZE }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = { bottom: mediumBorder, left: mediumBorder, right: mediumBorder }
  })

  // ─── Dữ liệu thật từ v_s1a_hkd ──────────────────────────
  const dataStartRow = ws.rowCount + 1
  rows.forEach((r) => {
    const row = ws.addRow([
      dayjs(r.ngay_ghi_so).format('DD/MM/YYYY'),
      r.dien_giai,
      r.so_tien,
    ])
    row.getCell(1).font = { name: FONT_NAME, size: FONT_SIZE }
    row.getCell(2).font = { name: FONT_NAME, size: FONT_SIZE }
    row.getCell(3).font = { name: FONT_NAME, size: FONT_SIZE }
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
    row.getCell(2).alignment = { vertical: 'middle', wrapText: true }
    row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' }
    row.getCell(3).numFmt = '#,##0'
    row.eachCell((cell) => {
      cell.border = { left: mediumBorder, right: mediumBorder }
    })
  })
  const dataEndRow = ws.rowCount

  // ─── Dòng Tổng cộng — dùng SUM thật, không hardcode ────
  const totalRow = ws.addRow(['', 'Tổng cộng', { formula: `SUM(C${dataStartRow}:C${dataEndRow})` }])
  totalRow.getCell(2).font = { name: FONT_NAME, size: FONT_SIZE, bold: true }
  totalRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' }
  totalRow.getCell(3).font = { name: FONT_NAME, size: FONT_SIZE }
  totalRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' }
  totalRow.getCell(3).numFmt = '#,##0'
  totalRow.eachCell((cell) => {
    cell.border = { bottom: mediumBorder, left: mediumBorder, right: mediumBorder }
  })

  ws.addRow([]) // dòng trống

  // ─── Footer ký tên (centerContinuous B:C) ──────────────
  const footerRows: [string, boolean, boolean][] = [
    [`Ngày ${dayjs().format('DD')} tháng ${dayjs().format('MM')} năm ${dayjs().format('YYYY')}`, false, true],
    ['NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/', true, false],
    ['CÁ NHÂN KINH DOANH', true, false],
    ['(Ký, ghi rõ họ tên, đóng dấu (nếu có))', false, true],
  ]
  footerRows.forEach(([text, bold, italic]) => {
    const row = ws.addRow(['', text])
    ws.mergeCells(row.number, 2, row.number, 3)
    row.getCell(2).font = { name: FONT_NAME, size: FONT_SIZE, bold, italic }
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' }
  })

  // ─── Xuất file ───────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `s1a_hkd_${nam}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
