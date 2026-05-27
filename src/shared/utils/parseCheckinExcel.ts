import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import type { ExcelGuestRow } from '@/types/checkin';

dayjs.extend(customParseFormat);

const GENDER_MAP: Record<string, ExcelGuestRow['gender']> = {
  nam: 'male',
  male: 'male',
  m: 'male',
  'nữ': 'female',
  nu: 'female',
  female: 'female',
  f: 'female',
};

const ID_TYPE_MAP: Record<string, ExcelGuestRow['id_type']> = {
  cccd: 'cccd',
  cmnd: 'cccd',
  'căn cước': 'cccd',
  'hộ chiếu': 'passport',
  passport: 'passport',
};

type ExcelFormat = 'template' | 'export' | 'unknown';

const HEADER_ALIASES = {
  common: {
    stt: ['STT'],
  },
  template: {
    full_name: ['Họ và tên (*)', 'Họ và tên'],
    date_of_birth: ['Ngày, tháng, năm sinh (*)', 'Ngày, tháng, năm sinh', 'Ngày sinh'],
    gender: ['Giới tính (*)', 'Giới tính'],
    nationality: ['Quốc tịch (*)', 'Quốc tịch'],
    id_type: ['Loại giấy tờ (*)', 'Loại giấy tờ'],
    id_number: ['Số giấy tờ (*)', 'Số giấy tờ'],
    phone: ['Số điện thoại'],
    check_in: ['Thời gian lưu trú  (từ ngày) (*)', 'Thời gian lưu trú (từ ngày) (*)', 'Thời gian lưu trú (từ ngày)'],
    check_out: [
      'Thời gian lưu trú  (đến ngày)',
      'Thời gian lưu trú (đến ngày)',
      'Thời gian lưu trú  (đến ngày) (*)',
      'Thời gian lưu trú (đến ngày) (*)',
    ],
    room_number: ['Tên phòng / Khoa (*)', 'Tên phòng / Khoa', 'Số phòng'],
    address_detail: ['Địa chỉ chi tiết (*)', 'Địa chỉ chi tiết'],
    ward: ['Phường/Xã/ Đặc khu (*)', 'Phường/Xã/Đặc khu (*)', 'Phường/Xã'],
    district: ['Quận/Huyện_cũ (*)', 'Quận/Huyện'],
    province: ['Tỉnh/TP (*)', 'Tỉnh/TP'],
  },
  export: {
    full_name: ['Họ tên', 'Họ và tên'],
    date_of_birth: ['Ngày sinh', 'Ngày, tháng, năm sinh'],
    gender: ['GT', 'Giới tính'],
    nationality: ['QT', 'Quốc tịch'],
    passport_number: ['Số hộ chiếu'],
    id_number: ['Số CMND/CCCD', 'Số giấy tờ'],
    id_type: ['Loại giấy tờ', 'Loại giấy tờ (*)'],
    check_in: ['Ngày đến'],
    check_out: ['Ngày đi dự kiến', 'Ngày đi thực tế', 'Ngày đi'],
    room_number: ['Số phòng', 'Tên phòng / Khoa'],
    address: ['Địa chỉ', 'Địa chỉ chi tiết'],
    phone: ['Số điện thoại'],
  },
} as const;

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function hasAnyHeader(keys: string[], aliases: readonly string[]): boolean {
  const normalizedKeys = keys.map(normalizeHeader);
  const normalizedAliases = aliases.map(normalizeHeader);
  return normalizedKeys.some((key) => normalizedAliases.includes(key));
}

function findKey(row: Record<string, unknown>, aliases: readonly string[]): unknown {
  const normalizedAliases = aliases.map(normalizeHeader);
  const key = Object.keys(row).find((candidateKey) => normalizedAliases.includes(normalizeHeader(candidateKey)));
  return key ? row[key] : '';
}

function toCellString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function parseDate(raw: string): string {
  const d = dayjs(raw.trim(), 'DD/MM/YYYY', true);
  return d.isValid() ? d.format('YYYY-MM-DD') : '';
}

export function parseDateTime(raw: string): string {
  const d = dayjs(raw.trim(), ['DD/MM/YYYY HH:mm:ss', 'DD/MM/YYYY', 'YYYY-MM-DD'], true);
  return d.isValid() ? d.format('YYYY-MM-DD') : '';
}

function detectFormat(keys: string[]): ExcelFormat {
  const isExport =
    hasAnyHeader(keys, HEADER_ALIASES.export.full_name) &&
    hasAnyHeader(keys, HEADER_ALIASES.export.gender) &&
    (hasAnyHeader(keys, HEADER_ALIASES.export.nationality) || hasAnyHeader(keys, HEADER_ALIASES.export.passport_number));

  if (isExport) return 'export';

  const isTemplate =
    hasAnyHeader(keys, HEADER_ALIASES.template.full_name) &&
    hasAnyHeader(keys, HEADER_ALIASES.template.gender) &&
    hasAnyHeader(keys, HEADER_ALIASES.template.id_type) &&
    hasAnyHeader(keys, HEADER_ALIASES.template.check_in) &&
    hasAnyHeader(keys, HEADER_ALIASES.template.room_number);

  if (isTemplate) return 'template';

  return 'unknown';
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

        if (rows.length === 0) {
          resolve([]);
          return;
        }

        const firstDataRow = rows.find((row) => {
          const stt = Number.parseInt(toCellString(findKey(row, HEADER_ALIASES.common.stt)), 10);
          return !Number.isNaN(stt);
        });

        if (!firstDataRow) {
          resolve([]);
          return;
        }

        const format = detectFormat(Object.keys(firstDataRow));

        const guests: ExcelGuestRow[] = [];

        for (const row of rows) {
          const sttRaw = toCellString(findKey(row, HEADER_ALIASES.common.stt));
          const stt = Number.parseInt(sttRaw, 10);
          if (Number.isNaN(stt)) continue;

          if (format === 'unknown') {
            continue;
          }

          if (format === 'template') {
            const genderRaw = toCellString(findKey(row, HEADER_ALIASES.template.gender)).toLowerCase();
            const idTypeRaw = toCellString(findKey(row, HEADER_ALIASES.template.id_type)).toLowerCase();

            const addressParts = [
              toCellString(findKey(row, HEADER_ALIASES.template.address_detail)),
              toCellString(findKey(row, HEADER_ALIASES.template.ward)),
              toCellString(findKey(row, HEADER_ALIASES.template.district)),
              toCellString(findKey(row, HEADER_ALIASES.template.province)),
            ].filter(Boolean);

            guests.push({
              stt,
              full_name: toCellString(findKey(row, HEADER_ALIASES.template.full_name)),
              date_of_birth: parseDate(toCellString(findKey(row, HEADER_ALIASES.template.date_of_birth))),
              gender: GENDER_MAP[genderRaw] ?? 'other',
              nationality: toCellString(findKey(row, HEADER_ALIASES.template.nationality)),
              id_type: ID_TYPE_MAP[idTypeRaw] ?? 'other',
              id_number: toCellString(findKey(row, HEADER_ALIASES.template.id_number)),
              phone: toCellString(findKey(row, HEADER_ALIASES.template.phone)),
              address: addressParts.join(', '),
              check_in: toCellString(findKey(row, HEADER_ALIASES.template.check_in)),
              check_out: toCellString(findKey(row, HEADER_ALIASES.template.check_out)),
              room_number: toCellString(findKey(row, HEADER_ALIASES.template.room_number)),
            });
            continue;
          }

          const genderRaw = toCellString(findKey(row, HEADER_ALIASES.export.gender)).toLowerCase();
          const idTypeRaw = toCellString(findKey(row, HEADER_ALIASES.export.id_type)).toLowerCase();
          const passportNumber = toCellString(findKey(row, HEADER_ALIASES.export.passport_number));
          const idNumberFallback = toCellString(findKey(row, HEADER_ALIASES.export.id_number));

          guests.push({
            stt,
            full_name: toCellString(findKey(row, HEADER_ALIASES.export.full_name)),
            date_of_birth: parseDate(toCellString(findKey(row, HEADER_ALIASES.export.date_of_birth))),
            gender: GENDER_MAP[genderRaw] ?? 'other',
            nationality: toCellString(findKey(row, HEADER_ALIASES.export.nationality)),
            id_type: passportNumber ? 'passport' : (ID_TYPE_MAP[idTypeRaw] ?? 'other'),
            id_number: passportNumber || idNumberFallback,
            phone: toCellString(findKey(row, HEADER_ALIASES.export.phone)),
            address: toCellString(findKey(row, HEADER_ALIASES.export.address)),
            check_in: toCellString(findKey(row, HEADER_ALIASES.export.check_in)),
            check_out: toCellString(findKey(row, HEADER_ALIASES.export.check_out)),
            room_number: toCellString(findKey(row, HEADER_ALIASES.export.room_number)),
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
