// scan-rpc-imports.mjs
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, 'src');

// Danh sách 97 RPC hợp lệ hiện có trong brain.entities (entity_type='rpc')
// QUAN TRỌNG: paste đúng danh sách này, không tự đoán thêm/bớt
const VALID_RPCS = new Set([
  'check_room_availability',
  'get_suggested_price',
  'create_group_booking_txn',
  'add_booking_to_group_txn',
  'update_booking_txn',
  'checkin_booking_txn',
  'checkout_booking_txn',
  'checkout_group_txn',
  'void_checkedout_booking_txn',
  'confirm_booking_request_txn',
  'reject_booking_request_txn',
  'create_room_txn',
  'update_room_txn',
  'toggle_room_active_txn',
  'complete_task_txn',
  'skip_task_txn',
  'extend_task_txn',
  'add_booking_service_txn',
  'delete_booking_service_txn',
  'add_discount_txn',
  'delete_booking_discount_txn',
  'add_early_late_txn',
  'record_payment_txn',
  'void_payment_txn',
  'mark_room_clean_txn',
  'update_housekeeping_status',
  'log_room_issue_txn',
  'create_room_block_txn',
  'delete_room_block_txn',
  'cancel_ota_block',
  'create_manual_revenue_txn',
  'get_tax_threshold_summary',
  'create_document_log',
  'current_user_role',
  // Lưu ý: nếu Code CLI biết còn RPC khác trong brain.entities (tổng 97, danh sách trên
  // chỉ là các RPC "chính" liệt kê trong system prompt), hãy VẪN GIỮ toàn bộ regex match
  // ra hết — không lọc theo whitelist này. Sẽ lọc lại phía Claude.ai bằng cách so khớp
  // với brain.entities thật khi populate. Set VALID_RPCS chỉ để tham khảo, KHÔNG dùng
  // để filter trong script — xem bước match bên dưới.
]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.next' || entry === 'build') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (['.ts', '.tsx'].includes(extname(entry)) && !entry.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

function extractRpcCalls(content) {
  // Bắt các pattern: supabase.rpc('name', ...) hoặc supabase.rpc("name", ...)
  const regex = /\.rpc\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g;
  const found = new Set();
  let m;
  while ((m = regex.exec(content)) !== null) {
    found.add(m[1]);
  }
  return [...found];
}

const files = walk(SRC_DIR);
const result = [];

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const rpcs = extractRpcCalls(content);
  if (rpcs.length > 0) {
    result.push({
      file: relative(ROOT, file).replace(/\\/g, '/'), // chuẩn hoá path dùng forward slash
      rpcs: rpcs.sort(),
    });
  }
}

result.sort((a, b) => a.file.localeCompare(b.file));

console.log(JSON.stringify(result, null, 2));
console.error(`\n--- Tổng: ${result.length} file có gọi RPC, ${result.reduce((s, r) => s + r.rpcs.length, 0)} lượt gọi (có thể trùng RPC giữa các file) ---`);
