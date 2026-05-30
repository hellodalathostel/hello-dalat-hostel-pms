// Parse file export từ hệ thống KBTT (tbltkbtt.bocongan.gov.vn)
// Hỗ trợ 2 format: Khách VN (có "Loại giấy tờ") và Khách NNN (có "QT")

import * as XLSX from 'xlsx';

export type KBTTGender = 'Nam' | 'Nữ';
export type DocumentType = 'CCCD' | 'Hộ chiếu' | 'Giấy tờ khác';

export interface KBTTGuest {
  stt: number;
  full_name: string;
  date_of_birth: string | null;  // dd/MM/yyyy
  gender: KBTTGender | null;
  id_type_raw: string;           // giá trị gốc từ file
  id_number: string;
  nationality: string | null;    // null với khách VN
  check_in_date: string;         // dd/MM/yyyy
  check_out_date: string;        // dd/MM/yyyy
  room_id: string;               // '101', '202', ... khớp rooms.id
}

export type KBTTFormat = 'VN' | 'NNN';

export interface KBTTParseResult {
  format: KBTTFormat;
  file_date: string;
  guests: KBTTGuest[];
}

function normalizeHeader(h: unknown): string {
  return String(h ?? '').trim();
}

function detectFormat(headerRow: unknown[]): KBTTFormat | null {
  const headers = headerRow.map(normalizeHeader);
  if (headers.includes('Loại giấy tờ')) return 'VN';
  if (headers.includes('QT'))           return 'NNN';
  return null;
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    if (normalizeHeader(rows[i][0]) === 'STT') return i;
  }
  return -1;
}

function parseDate(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  return null;
}

export function parseKBTTExcel(file: File): Promise<KBTTParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: 'array', cellDates: false });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
          header: 1, defval: null, raw: false,
        });

        const headerIdx = findHeaderRow(rows);
        if (headerIdx === -1) {
          reject(new Error('Không tìm thấy dòng tiêu đề (STT). File có đúng format KBTT không?'));
          return;
        }

        const format = detectFormat(rows[headerIdx]);
        if (!format) {
          reject(new Error('Không nhận diện được format VN hay NNN. Kiểm tra lại file KBTT.'));
          return;
        }

        const dateRaw   = String(rows[2]?.[0] ?? '').trim();
        const dateMatch = dateRaw.match(/Ngày\s+(\d+)\s+tháng\s+(\d+)\s+năm\s+(\d{4})/);
        const file_date = dateMatch
          ? `${dateMatch[1].padStart(2,'0')}/${dateMatch[2].padStart(2,'0')}/${dateMatch[3]}`
          : '';

        const guests: KBTTGuest[] = [];
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i];
          const stt = Number(row[0]);
          if (!stt || isNaN(stt)) continue;

          const room_id = String(row[9] ?? '').trim();

          if (format === 'VN') {
            guests.push({
              stt,
              full_name:     String(row[1] ?? '').trim(),
              date_of_birth: parseDate(row[2]),
              gender:        (row[3] as KBTTGender) ?? null,
              id_type_raw:   String(row[4] ?? '').trim(),
              id_number:     String(row[5] ?? '').trim(),
              nationality:   null,
              check_in_date:  parseDate(row[6]) ?? '',
              check_out_date: parseDate(row[7]) ?? '',
              room_id,
            });
          } else {
            guests.push({
              stt,
              full_name:     String(row[1] ?? '').trim(),
              date_of_birth: parseDate(row[2]),
              gender:        (row[3] as KBTTGender) ?? null,
              id_type_raw:   'Hộ chiếu',
              id_number:     String(row[5] ?? '').trim(),
              nationality:   String(row[4] ?? '').trim(),
              check_in_date:  parseDate(row[6]) ?? '',
              check_out_date: parseDate(row[7]) ?? '',
              room_id,
            });
          }
        }

        if (guests.length === 0) {
          reject(new Error('File không có dữ liệu khách nào.'));
          return;
        }

        resolve({ format, file_date, guests });
      } catch (err) {
        reject(new Error(`Lỗi đọc file: ${String(err)}`));
      }
    };
    reader.onerror = () => reject(new Error('Không đọc được file.'));
    reader.readAsArrayBuffer(file);
  });
}

export function mapDocumentType(raw: string): DocumentType {
  const s = raw.toLowerCase();
  if (s.includes('cccd') || s.includes('căn cước') || s.includes('thẻ cccd')) return 'CCCD';
  if (s.includes('hộ chiếu') || s.includes('passport'))                        return 'Hộ chiếu';
  return 'Giấy tờ khác';
}

export function kbttDateToISO(ddmmyyyy: string): string {
  if (!ddmmyyyy) return '';
  const [d, m, y] = ddmmyyyy.split('/');
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}
