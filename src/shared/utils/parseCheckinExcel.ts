import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import type { ExcelGuestRow } from '@/types/checkin';

dayjs.extend(customParseFormat);

// Map giới tính tiếng Việt -> enum DB
const GENDER_MAP: Record<string, ExcelGuestRow['gender']> = {
  nam: 'male',
  'nữ': 'female',
};

// Map loại giấy tờ -> enum DB
const ID_TYPE_MAP: Record<string, ExcelGuestRow['id_type']> = {
  cccd: 'cccd',
  'hộ chiếu': 'passport',
  passport: 'passport',
};

function toCellString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// Parse ngày dd/mm/yyyy -> YYYY-MM-DD
export function parseDate(raw: string): string {
  const d = dayjs(raw.trim(), 'DD/MM/YYYY', true);
  return d.isValid() ? d.format('YYYY-MM-DD') : '';
}

// Parse datetime dd/mm/yyyy hh:mm:ss -> YYYY-MM-DD
export function parseDateTime(raw: string): string {
  const d = dayjs(raw.trim(), ['DD/MM/YYYY HH:mm:ss', 'DD/MM/YYYY', 'YYYY-MM-DD'], true);
  return d.isValid() ? d.format('YYYY-MM-DD') : '';
}

export function parseCheckinExcel(file: File): Promise<ExcelGuestRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];

        // raw: false để lấy text đã render từ Excel, giữ ổn định cho tiếng Việt/ngày
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
          raw: false,
          defval: '',
        });

        const guests: ExcelGuestRow[] = [];

        for (const row of rows) {
          const sttRaw = toCellString(row['STT']);
          const stt = Number.parseInt(sttRaw, 10);

          // Bỏ qua hàng header mẫu và hàng trống
          if (Number.isNaN(stt)) continue;

          const genderRaw = toCellString(row['Giới tính (*)']).toLowerCase();
          const idTypeRaw = toCellString(row['Loại giấy tờ (*)']).toLowerCase();

          // Ghép địa chỉ đầy đủ từ các cột thành phần
          const addressParts = [
            toCellString(row['Địa chỉ chi tiết (*)']),
            toCellString(row['Phường/Xã/ Đặc khu (*)']),
            toCellString(row['Quận/Huyện_cũ (*)']),
            toCellString(row['Tỉnh/TP (*)']),
          ].filter(Boolean);
          const address =
            addressParts.join(', ') || toCellString(row['Địa chỉ chi tiết (*)']);

          guests.push({
            stt,
            full_name: toCellString(row['Họ và tên (*)']),
            date_of_birth: parseDate(toCellString(row['Ngày, tháng, năm sinh (*)'])),
            gender: GENDER_MAP[genderRaw] ?? 'other',
            nationality: toCellString(row['Quốc tịch (*)']),
            id_type: ID_TYPE_MAP[idTypeRaw] ?? 'other',
            id_number: toCellString(row['Số giấy tờ (*)']),
            phone: toCellString(row['Số điện thoại']),
            address,
            check_in: toCellString(row['Thời gian lưu trú  (từ ngày) (*)']),
            check_out: toCellString(row['Thời gian lưu trú  (đến ngày)']),
            room_number: toCellString(row['Tên phòng / Khoa (*)']),
          });
        }

        resolve(guests);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('Không đọc được file'));
    reader.readAsArrayBuffer(file);
  });
}

// Group rows theo (room_number, check_in_date)
export function groupByRoomAndDate(
  rows: ExcelGuestRow[]
): Map<string, ExcelGuestRow[]> {
  const map = new Map<string, ExcelGuestRow[]>();

  for (const row of rows) {
    const checkInDate = parseDateTime(row.check_in);
    const key = `${row.room_number}__${checkInDate}`;

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key)?.push(row);
  }

  return map;
}
