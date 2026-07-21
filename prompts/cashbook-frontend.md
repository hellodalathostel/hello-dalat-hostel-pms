# Task: Implement module Sổ quỹ tiền mặt (Cash Book)

Repo: `hello-dalat-hostel-pms`
Stack: React 18 + TypeScript + Vite + Ant Design 5 + TanStack Query v5 + dayjs

## Bối cảnh

DB đã sẵn sàng hoàn toàn — **không cần viết SQL, không cần tạo migration**. Toàn bộ view/RPC đã deploy production.

Module này Lợi (staff) là người dùng chính trên mobile: đếm két, chốt ca, ghi chi vặt. Ưu tiên mobile-first.

## Nguyên tắc bắt buộc

1. **DB là source of truth** — tồn quỹ, chênh lệch do DB tính. Frontend KHÔNG tính lại.
2. **Mọi mutation qua RPC** — không INSERT/UPDATE/DELETE trực tiếp.
3. **KHÔNG thêm role-check** (`isOwner`, `ownerOnly`) vào bất kỳ đâu trong module này. Lợi và Hiếu đều full quyền. Đây là chủ ý.
4. Comment tiếng Việt. Error handling + loading state đầy đủ.
5. Code mới dùng v3 path (`@/lib`, `@/hooks`, `@/utils`). Code cũ giữ legacy path, không move.

## Cần verify trước khi code

Kiểm tra 3 điểm sau trong repo, nếu khác thì điều chỉnh import cho khớp:

- Alias `@/` đã cấu hình trong `vite.config.ts` + `tsconfig.json` chưa? Nếu chưa, dùng đường dẫn tương đối.
- `src/shared/hooks/useAppFeedback.ts` export gì? Code dưới giả định `{ showSuccess, showError }`.
- `src/shared/utils/normalizeError.ts` — giả định `normalizeError(err): string`.
- Supabase client ở `src/api/supabase.ts`, export tên `supabase`.

---

## Schema DB (tham chiếu, KHÔNG cần tạo)

### View `cash_book_daily` — tổng hợp theo ngày

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `entry_date` | date | |
| `thu_trong_ngay` | int | |
| `chi_trong_ngay` | int | |
| `thuan_trong_ngay` | int | thu − chi |
| `so_giao_dich` | int | |
| `ton_luy_ke` | int | **Tồn quỹ hiện tại** |
| `opening_balance` | int \| null | Tồn đầu ngày (0h00) |
| `counted_balance` | int \| null | Số đếm được khi chốt ca |
| `expected_balance` | int \| null | Sổ sách tính ra |
| `discrepancy` | int \| null | ⚠️ xem cảnh báo dưới |
| `closed_at` | timestamptz \| null | **NULL = chưa chốt ca** |
| `is_opening_entry` | bool | Mốc khai sổ |

> ⚠️ **`discrepancy` là GENERATED column** `COALESCE(counted,0) - COALESCE(expected,0)`. Ngày CHƯA chốt sẽ trả **0**, không phải NULL. **Phải dùng `closed_at !== null` để biết đã chốt hay chưa. TUYỆT ĐỐI không dựa vào `discrepancy`.**

### View `cash_book_detail` — chi tiết giao dịch

Gộp tự động 4 nguồn tiền mặt, đã lọc bỏ giao dịch void:

| `ref_table` | Nguồn | Nhập tay? |
|---|---|---|
| `payment_history` | Thu khách (method=cash) | Không |
| `expenses` | Chi phí (payment_method=cash) | Không |
| `pass_through_transactions` | Thu chi hộ | Không |
| `cash_book_entries` | Nhập tay | **Có** |

Cột: `entry_date`, `direction` (`in`/`out`), `entry_type`, `amount`, `description`, `ref_id`, `ref_table`, `created_at`.

Chỉ giao dịch có `ref_table === 'cash_book_entries'` mới sửa/huỷ được.

### RPC

```
add_cash_book_entry_txn(p_direction text, p_entry_type text, p_amount int,
                        p_description text, p_entry_date date DEFAULT CURRENT_DATE,
                        p_note text DEFAULT NULL) -> json
  Trả: { id, entry_date, direction, entry_type, amount }
  Lỗi: sai chiều / loại lạ / ngày trước khai sổ / ngày đã chốt ca

update_cash_book_entry_txn(p_entry_id uuid, p_entry_type text, p_amount int,
                           p_description text, p_note text DEFAULT NULL) -> json
  Trả: { id, entry_date, direction, entry_type, amount, message }
  Lỗi: không tìm thấy / đã void / ngày đã chốt ca

void_cash_book_entry_txn(p_entry_id uuid, p_reason text) -> json
  Trả: { id, entry_date, amount, message }
  Lỗi: thiếu lý do / đã void / ngày đã chốt ca

close_cash_shift_txn(p_shift_date date, p_counted_balance int,
                     p_note text DEFAULT NULL) -> json
  Trả: { shift_date, counted_balance, expected_balance, discrepancy, message }

reopen_cash_shift_txn(p_shift_date date, p_reason text) -> json
  Trả: { shift_date, message }
  Lỗi: thiếu lý do / ca chưa chốt / có ca ngày sau đã chốt
```

**Quan trọng:** DB tự suy `direction` từ `entry_type` và báo lỗi nếu frontend truyền lệch. Frontend vẫn truyền `p_direction` đúng theo bảng `CASH_ENTRY_DIRECTION`.

### 7 loại giao dịch nhập tay

| `entry_type` | Chiều | Nhãn |
|---|---|---|
| `withdraw_from_bank` | in | Rút từ ngân hàng |
| `owner_contribution` | in | Chủ góp tiền |
| `other_in` | in | Thu khác |
| `deposit_to_bank` | out | Nộp vào ngân hàng |
| `petty_expense` | out | Chi vặt |
| `owner_withdrawal` | out | Chủ rút tiền |
| `other_out` | out | Chi khác |

---

## FILE 1 — `src/types/cashBook.ts` (mới)

```typescript
// Kieu du lieu cho module So quy tien mat

/** Chieu tien: vao ket hoac ra khoi ket */
export type CashDirection = 'in' | 'out';

/** Loai giao dich NHAP TAY (bang cash_book_entries) */
export type CashEntryType =
  | 'deposit_to_bank'
  | 'withdraw_from_bank'
  | 'petty_expense'
  | 'owner_withdrawal'
  | 'owner_contribution'
  | 'other_in'
  | 'other_out';

/** Loai giao dich TU DONG tu he thong (view cash_book_detail gop vao) */
export type CashAutoEntryType = 'guest_payment' | 'expense' | 'pass_through';

/** Nguon goc giao dich */
export type CashRefTable =
  | 'payment_history'
  | 'expenses'
  | 'pass_through_transactions'
  | 'cash_book_entries';

/** Mot dong trong view cash_book_detail */
export interface CashBookDetailRow {
  entry_date: string;
  direction: CashDirection;
  entry_type: CashEntryType | CashAutoEntryType;
  amount: number;
  description: string | null;
  ref_id: string;
  ref_table: CashRefTable;
  created_at: string;
}

/** Mot dong trong view cash_book_daily */
export interface CashBookDailyRow {
  entry_date: string;
  thu_trong_ngay: number;
  chi_trong_ngay: number;
  thuan_trong_ngay: number;
  so_giao_dich: number;
  ton_luy_ke: number;
  opening_balance: number | null;
  counted_balance: number | null;
  expected_balance: number | null;
  /** CANH BAO: cot generated, ngay chua chot tra 0 chu khong phai null.
   *  Dung closed_at de biet da chot hay chua. */
  discrepancy: number | null;
  closed_at: string | null;
  is_opening_entry: boolean;
}

export interface AddCashEntryResult {
  id: string;
  entry_date: string;
  direction: CashDirection;
  entry_type: CashEntryType;
  amount: number;
}

export interface UpdateCashEntryResult extends AddCashEntryResult {
  message: string;
}

export interface VoidCashEntryResult {
  id: string;
  entry_date: string;
  amount: number;
  message: string;
}

export interface CloseCashShiftResult {
  shift_date: string;
  counted_balance: number;
  expected_balance: number;
  discrepancy: number;
  message: string;
}

export interface ReopenCashShiftResult {
  shift_date: string;
  message: string;
}
```

---

## FILE 2 — `src/constants/cashBook.ts` (mới)

```typescript
import type {
  CashDirection,
  CashEntryType,
  CashAutoEntryType,
  CashRefTable,
} from '@/types/cashBook';

/** Nhan tieng Viet cho loai giao dich nhap tay */
export const CASH_ENTRY_TYPE_LABEL: Record<CashEntryType, string> = {
  withdraw_from_bank: 'Rút từ ngân hàng',
  owner_contribution: 'Chủ góp tiền',
  other_in: 'Thu khác',
  deposit_to_bank: 'Nộp vào ngân hàng',
  petty_expense: 'Chi vặt',
  owner_withdrawal: 'Chủ rút tiền',
  other_out: 'Chi khác',
};

/** Nhan tieng Viet cho loai giao dich tu dong tu he thong */
export const CASH_AUTO_ENTRY_TYPE_LABEL: Record<CashAutoEntryType, string> = {
  guest_payment: 'Thu khách',
  expense: 'Chi phí',
  pass_through: 'Thu chi hộ',
};

/** Chieu tien co dinh theo loai — DB da rang buoc, day chi de hien thi */
export const CASH_ENTRY_DIRECTION: Record<CashEntryType, CashDirection> = {
  withdraw_from_bank: 'in',
  owner_contribution: 'in',
  other_in: 'in',
  deposit_to_bank: 'out',
  petty_expense: 'out',
  owner_withdrawal: 'out',
  other_out: 'out',
};

/** Thu tu hien thi trong dropdown, nhom theo chieu */
export const CASH_ENTRY_TYPE_OPTIONS = [
  {
    label: 'Tiền vào két',
    options: [
      { label: CASH_ENTRY_TYPE_LABEL.withdraw_from_bank, value: 'withdraw_from_bank' as const },
      { label: CASH_ENTRY_TYPE_LABEL.owner_contribution, value: 'owner_contribution' as const },
      { label: CASH_ENTRY_TYPE_LABEL.other_in, value: 'other_in' as const },
    ],
  },
  {
    label: 'Tiền ra khỏi két',
    options: [
      { label: CASH_ENTRY_TYPE_LABEL.deposit_to_bank, value: 'deposit_to_bank' as const },
      { label: CASH_ENTRY_TYPE_LABEL.petty_expense, value: 'petty_expense' as const },
      { label: CASH_ENTRY_TYPE_LABEL.owner_withdrawal, value: 'owner_withdrawal' as const },
      { label: CASH_ENTRY_TYPE_LABEL.other_out, value: 'other_out' as const },
    ],
  },
];

/** Lay nhan hien thi cho bat ky entry_type nao (tu dong hoac nhap tay) */
export function getCashEntryLabel(entryType: string): string {
  return (
    CASH_ENTRY_TYPE_LABEL[entryType as CashEntryType] ??
    CASH_AUTO_ENTRY_TYPE_LABEL[entryType as CashAutoEntryType] ??
    entryType
  );
}

/** Giao dich tu he thong thi khong sua/huy duoc tu So quy */
export function isAutoEntry(refTable: CashRefTable): boolean {
  return refTable !== 'cash_book_entries';
}

/** Dinh dang tien Viet: 3896000 -> "3.896.000" */
export function formatVnd(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n);
}
```

---

## FILE 3 — `src/features/cashbook/hooks/useCashBook.ts` (mới)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { supabase } from '@/api/supabase';
import { useAppFeedback } from '@/shared/hooks/useAppFeedback';
import { normalizeError } from '@/shared/utils/normalizeError';
import { CASH_ENTRY_DIRECTION } from '@/constants/cashBook';
import type {
  CashBookDailyRow,
  CashBookDetailRow,
  CashEntryType,
  AddCashEntryResult,
  UpdateCashEntryResult,
  VoidCashEntryResult,
  CloseCashShiftResult,
  ReopenCashShiftResult,
} from '@/types/cashBook';

const CASH_BOOK_KEY = ['cash-book'] as const;

/** Tong hop theo ngay, moi nhat truoc */
export function useCashBookDaily(limit = 30) {
  return useQuery({
    queryKey: [...CASH_BOOK_KEY, 'daily', limit],
    queryFn: async (): Promise<CashBookDailyRow[]> => {
      const { data, error } = await supabase
        .from('cash_book_daily')
        .select('*')
        .order('entry_date', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as CashBookDailyRow[];
    },
  });
}

/** Chi tiet giao dich cua mot ngay cu the */
export function useCashBookDetail(date: string) {
  return useQuery({
    queryKey: [...CASH_BOOK_KEY, 'detail', date],
    queryFn: async (): Promise<CashBookDetailRow[]> => {
      const { data, error } = await supabase
        .from('cash_book_detail')
        .select('*')
        .eq('entry_date', date)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CashBookDetailRow[];
    },
    enabled: Boolean(date),
  });
}

interface AddEntryInput {
  entryType: CashEntryType;
  amount: number;
  description: string;
  entryDate?: string;
  note?: string;
}

/** Them giao dich nhap tay */
export function useAddCashEntry() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useAppFeedback();

  return useMutation({
    mutationFn: async (input: AddEntryInput): Promise<AddCashEntryResult> => {
      const { data, error } = await supabase.rpc('add_cash_book_entry_txn', {
        p_direction: CASH_ENTRY_DIRECTION[input.entryType],
        p_entry_type: input.entryType,
        p_amount: input.amount,
        p_description: input.description,
        p_entry_date: input.entryDate ?? dayjs().format('YYYY-MM-DD'),
        p_note: input.note ?? null,
      });
      if (error) throw error;
      return data as AddCashEntryResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CASH_BOOK_KEY });
      showSuccess('Đã ghi giao dịch vào sổ quỹ');
    },
    onError: (err) => showError(normalizeError(err)),
  });
}

interface UpdateEntryInput {
  entryId: string;
  entryType: CashEntryType;
  amount: number;
  description: string;
  note?: string;
}

/** Sua giao dich nhap tay ghi nham */
export function useUpdateCashEntry() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useAppFeedback();

  return useMutation({
    mutationFn: async (input: UpdateEntryInput): Promise<UpdateCashEntryResult> => {
      const { data, error } = await supabase.rpc('update_cash_book_entry_txn', {
        p_entry_id: input.entryId,
        p_entry_type: input.entryType,
        p_amount: input.amount,
        p_description: input.description,
        p_note: input.note ?? null,
      });
      if (error) throw error;
      return data as UpdateCashEntryResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: CASH_BOOK_KEY });
      showSuccess(result.message);
    },
    onError: (err) => showError(normalizeError(err)),
  });
}

/** Huy giao dich nhap tay (soft-delete, giu dau vet) */
export function useVoidCashEntry() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useAppFeedback();

  return useMutation({
    mutationFn: async (input: { entryId: string; reason: string }): Promise<VoidCashEntryResult> => {
      const { data, error } = await supabase.rpc('void_cash_book_entry_txn', {
        p_entry_id: input.entryId,
        p_reason: input.reason,
      });
      if (error) throw error;
      return data as VoidCashEntryResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: CASH_BOOK_KEY });
      showSuccess(result.message);
    },
    onError: (err) => showError(normalizeError(err)),
  });
}

interface CloseShiftInput {
  shiftDate: string;
  countedBalance: number;
  note?: string;
}

/** Chot ca cuoi ngay */
export function useCloseCashShift() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useAppFeedback();

  return useMutation({
    mutationFn: async (input: CloseShiftInput): Promise<CloseCashShiftResult> => {
      const { data, error } = await supabase.rpc('close_cash_shift_txn', {
        p_shift_date: input.shiftDate,
        p_counted_balance: input.countedBalance,
        p_note: input.note ?? null,
      });
      if (error) throw error;
      return data as CloseCashShiftResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: CASH_BOOK_KEY });
      showSuccess(result.message);
    },
    onError: (err) => showError(normalizeError(err)),
  });
}

/** Mo lai ca da chot de sua giao dich */
export function useReopenCashShift() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useAppFeedback();

  return useMutation({
    mutationFn: async (input: { shiftDate: string; reason: string }): Promise<ReopenCashShiftResult> => {
      const { data, error } = await supabase.rpc('reopen_cash_shift_txn', {
        p_shift_date: input.shiftDate,
        p_reason: input.reason,
      });
      if (error) throw error;
      return data as ReopenCashShiftResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: CASH_BOOK_KEY });
      showSuccess(result.message);
    },
    onError: (err) => showError(normalizeError(err)),
  });
}
```

---

## FILE 4 — `src/features/cashbook/components/CashEntryModal.tsx` (mới)

Modal dùng chung cho cả THÊM và SỬA. Truyền `editingEntry` để vào chế độ sửa.

```typescript
import { Modal, Form, Select, InputNumber, Input, Alert } from 'antd';
import { useEffect } from 'react';
import { CASH_ENTRY_TYPE_OPTIONS, CASH_ENTRY_DIRECTION } from '@/constants/cashBook';
import { useAddCashEntry, useUpdateCashEntry } from '../hooks/useCashBook';
import type { CashEntryType, CashBookDetailRow } from '@/types/cashBook';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Ngay ghi giao dich (chi dung khi them moi) */
  entryDate: string;
  /** Co gia tri = che do SUA. null = che do THEM MOI */
  editingEntry?: CashBookDetailRow | null;
}

interface FormValues {
  entryType: CashEntryType;
  amount: number;
  description: string;
  note?: string;
}

export function CashEntryModal({ open, onClose, entryDate, editingEntry }: Props) {
  const [form] = Form.useForm<FormValues>();
  const addEntry = useAddCashEntry();
  const updateEntry = useUpdateCashEntry();
  const entryType = Form.useWatch('entryType', form);

  const isEditing = Boolean(editingEntry);
  const isPending = addEntry.isPending || updateEntry.isPending;

  // Do du lieu vao form khi mo o che do sua
  useEffect(() => {
    if (!open) {
      form.resetFields();
      return;
    }
    if (editingEntry) {
      form.setFieldsValue({
        entryType: editingEntry.entry_type as CashEntryType,
        amount: editingEntry.amount,
        description: editingEntry.description ?? '',
      });
    }
  }, [open, editingEntry, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editingEntry) {
      await updateEntry.mutateAsync({ entryId: editingEntry.ref_id, ...values });
    } else {
      await addEntry.mutateAsync({ ...values, entryDate });
    }
    onClose();
  };

  const direction = entryType ? CASH_ENTRY_DIRECTION[entryType] : null;

  return (
    <Modal
      open={open}
      title={isEditing ? 'Sửa giao dịch' : 'Thêm giao dịch sổ quỹ'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={isEditing ? 'Lưu thay đổi' : 'Ghi sổ'}
      cancelText="Huỷ"
      confirmLoading={isPending}
      destroyOnClose
      width="min(520px, 92vw)"
    >
      {!isEditing && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Thu khách và chi phí đã tự động vào sổ. Chỉ ghi tay các khoản chưa có trong hệ thống."
        />
      )}

      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="entryType"
          label="Loại giao dịch"
          rules={[{ required: true, message: 'Chọn loại giao dịch' }]}
        >
          <Select options={CASH_ENTRY_TYPE_OPTIONS} placeholder="Chọn loại" size="large" />
        </Form.Item>

        {direction && (
          <Alert
            type={direction === 'in' ? 'success' : 'warning'}
            showIcon
            style={{ marginBottom: 16 }}
            message={direction === 'in' ? 'Tiền VÀO két' : 'Tiền RA khỏi két'}
          />
        )}

        <Form.Item
          name="amount"
          label="Số tiền (₫)"
          rules={[
            { required: true, message: 'Nhập số tiền' },
            { type: 'number', min: 1, message: 'Số tiền phải lớn hơn 0' },
          ]}
        >
          <InputNumber
            style={{ width: '100%' }}
            size="large"
            min={1}
            step={1000}
            inputMode="numeric"
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
            parser={(v) => Number((v ?? '').replace(/\./g, ''))}
            placeholder="0"
          />
        </Form.Item>

        <Form.Item
          name="description"
          label="Nội dung"
          rules={[{ required: true, message: 'Nhập nội dung giao dịch' }]}
        >
          <Input size="large" placeholder="VD: Mua nước rửa chén" maxLength={200} />
        </Form.Item>

        <Form.Item name="note" label="Ghi chú (không bắt buộc)">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

---

## FILE 5 — `src/features/cashbook/components/VoidEntryModal.tsx` (mới)

```typescript
import { Modal, Form, Input, Alert, Typography } from 'antd';
import { useEffect } from 'react';
import { formatVnd, getCashEntryLabel } from '@/constants/cashBook';
import { useVoidCashEntry } from '../hooks/useCashBook';
import type { CashBookDetailRow } from '@/types/cashBook';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  entry: CashBookDetailRow | null;
}

export function VoidEntryModal({ open, onClose, entry }: Props) {
  const [form] = Form.useForm<{ reason: string }>();
  const voidEntry = useVoidCashEntry();

  useEffect(() => {
    if (!open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    if (!entry) return;
    const { reason } = await form.validateFields();
    await voidEntry.mutateAsync({ entryId: entry.ref_id, reason });
    onClose();
  };

  return (
    <Modal
      open={open}
      title="Huỷ giao dịch"
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Huỷ giao dịch"
      okButtonProps={{ danger: true }}
      cancelText="Quay lại"
      confirmLoading={voidEntry.isPending}
      destroyOnClose
      width="min(480px, 92vw)"
    >
      {entry && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <>
              <Text strong>{entry.description}</Text>
              <br />
              <Text type="secondary">
                {getCashEntryLabel(entry.entry_type)} ·{' '}
                {entry.direction === 'in' ? '+' : '−'}
                {formatVnd(entry.amount)}₫
              </Text>
            </>
          }
          description="Giao dịch sẽ bị loại khỏi sổ quỹ nhưng vẫn lưu dấu vết."
        />
      )}

      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="reason"
          label="Lý do huỷ"
          rules={[{ required: true, message: 'Bắt buộc ghi lý do huỷ' }]}
        >
          <Input.TextArea rows={3} maxLength={500} placeholder="VD: Ghi nhầm số tiền" autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

---

## FILE 6 — `src/features/cashbook/components/CloseShiftModal.tsx` (mới)

```typescript
import { Modal, Form, InputNumber, Input, Statistic, Row, Col, Alert } from 'antd';
import { useEffect } from 'react';
import { formatVnd } from '@/constants/cashBook';
import { useCloseCashShift } from '../hooks/useCashBook';

interface Props {
  open: boolean;
  onClose: () => void;
  shiftDate: string;
  /** Ton quy he thong tinh ra, de doi chieu */
  expectedBalance: number;
}

interface FormValues {
  countedBalance: number;
  note?: string;
}

export function CloseShiftModal({ open, onClose, shiftDate, expectedBalance }: Props) {
  const [form] = Form.useForm<FormValues>();
  const closeShift = useCloseCashShift();
  const counted = Form.useWatch('countedBalance', form);

  useEffect(() => {
    if (!open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    await closeShift.mutateAsync({ shiftDate, ...values });
    onClose();
  };

  // Chenh lech tinh tam de thay ngay khi go — DB van la nguon chinh thuc
  const diff = typeof counted === 'number' ? counted - expectedBalance : null;

  return (
    <Modal
      open={open}
      title={`Chốt ca ngày ${shiftDate}`}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Chốt ca"
      cancelText="Huỷ"
      confirmLoading={closeShift.isPending}
      destroyOnClose
      width="min(520px, 92vw)"
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="Sau khi chốt ca sẽ không thêm/sửa được giao dịch cho ngày này. Cần sửa thì phải mở lại ca."
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Statistic
            title="Sổ sách tính ra"
            value={expectedBalance}
            formatter={(v) => formatVnd(Number(v))}
            suffix="₫"
          />
        </Col>
        <Col span={12}>
          {diff !== null && (
            <Statistic
              title={diff === 0 ? 'Khớp' : diff > 0 ? 'Thừa' : 'Thiếu'}
              value={Math.abs(diff)}
              formatter={(v) => formatVnd(Number(v))}
              suffix="₫"
              valueStyle={{ color: diff === 0 ? '#3f8600' : '#cf1322' }}
            />
          )}
        </Col>
      </Row>

      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="countedBalance"
          label="Số tiền đếm được trong két (₫)"
          rules={[
            { required: true, message: 'Nhập số tiền đếm được' },
            { type: 'number', min: 0, message: 'Số tiền không thể âm' },
          ]}
        >
          <InputNumber
            style={{ width: '100%' }}
            size="large"
            min={0}
            step={1000}
            inputMode="numeric"
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
            parser={(v) => Number((v ?? '').replace(/\./g, ''))}
            placeholder="0"
            autoFocus
          />
        </Form.Item>

        <Form.Item
          name="note"
          label={diff !== null && diff !== 0 ? 'Lý do chênh lệch (nên ghi)' : 'Ghi chú'}
        >
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

---

## FILE 7 — `src/features/cashbook/components/ReopenShiftModal.tsx` (mới)

```typescript
import { Modal, Form, Input, Alert } from 'antd';
import { useEffect } from 'react';
import { useReopenCashShift } from '../hooks/useCashBook';

interface Props {
  open: boolean;
  onClose: () => void;
  shiftDate: string;
}

export function ReopenShiftModal({ open, onClose, shiftDate }: Props) {
  const [form] = Form.useForm<{ reason: string }>();
  const reopenShift = useReopenCashShift();

  useEffect(() => {
    if (!open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    const { reason } = await form.validateFields();
    await reopenShift.mutateAsync({ shiftDate, reason });
    onClose();
  };

  return (
    <Modal
      open={open}
      title={`Mở lại ca ngày ${shiftDate}`}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Mở lại ca"
      cancelText="Quay lại"
      confirmLoading={reopenShift.isPending}
      destroyOnClose
      width="min(480px, 92vw)"
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="Số đếm được và chênh lệch của ca này sẽ bị xoá."
        description="Nếu có ca ngày sau đã chốt, phải mở lại các ca đó trước (từ ngày mới nhất)."
      />

      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="reason"
          label="Lý do mở lại"
          rules={[{ required: true, message: 'Bắt buộc ghi lý do' }]}
        >
          <Input.TextArea rows={3} maxLength={500} placeholder="VD: Ghi sót khoản chi vặt" autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

---

## FILE 8 — `src/features/cashbook/CashBookPage.tsx` (mới)

```typescript
import { useState } from 'react';
import {
  Card, Statistic, Row, Col, Button, List, Tag, Empty, Spin,
  Typography, Space, Result, DatePicker, Dropdown,
} from 'antd';
import {
  PlusOutlined, LockOutlined, UnlockOutlined, ArrowUpOutlined, ArrowDownOutlined,
  RobotOutlined, EditOutlined, MoreOutlined, DeleteOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useCashBookDaily, useCashBookDetail } from './hooks/useCashBook';
import { CashEntryModal } from './components/CashEntryModal';
import { VoidEntryModal } from './components/VoidEntryModal';
import { CloseShiftModal } from './components/CloseShiftModal';
import { ReopenShiftModal } from './components/ReopenShiftModal';
import { getCashEntryLabel, isAutoEntry, formatVnd } from '@/constants/cashBook';
import type { CashBookDetailRow } from '@/types/cashBook';

const { Text, Title } = Typography;

export default function CashBookPage() {
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CashBookDetailRow | null>(null);
  const [voidingEntry, setVoidingEntry] = useState<CashBookDetailRow | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);

  const dateStr = selectedDate.format('YYYY-MM-DD');
  const { data: dailyRows, isLoading: loadingDaily } = useCashBookDaily(30);
  const { data: details, isLoading: loadingDetail } = useCashBookDetail(dateStr);

  const today = dailyRows?.find((r) => r.entry_date === dateStr);
  const hasOpening = dailyRows?.some((r) => r.is_opening_entry) ?? false;
  // QUAN TRONG: dung closed_at, KHONG dung discrepancy
  const isClosed = Boolean(today?.closed_at);

  const openAddModal = () => {
    setEditingEntry(null);
    setEntryModalOpen(true);
  };

  const openEditModal = (entry: CashBookDetailRow) => {
    setEditingEntry(entry);
    setEntryModalOpen(true);
  };

  if (loadingDaily) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  // Chua khai so quy
  if (!hasOpening) {
    return (
      <Result
        status="info"
        title="Chưa khai sổ quỹ"
        subTitle="Cần khai số tồn két ban đầu trước khi dùng sổ quỹ. Liên hệ chủ để khai sổ."
      />
    );
  }

  return (
    <div style={{ padding: '16px 12px', maxWidth: 720, margin: '0 auto' }}>
      <Space
        style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
        wrap
      >
        <Title level={4} style={{ margin: 0 }}>Sổ quỹ tiền mặt</Title>
        <DatePicker
          value={selectedDate}
          onChange={(d) => d && setSelectedDate(d)}
          allowClear={false}
          format="DD/MM/YYYY"
          inputReadOnly
        />
      </Space>

      {/* The tong quan */}
      <Card style={{ marginBottom: 16 }}>
        <Statistic
          title="Tồn quỹ"
          value={today?.ton_luy_ke ?? 0}
          formatter={(v) => formatVnd(Number(v))}
          suffix="₫"
          valueStyle={{ fontSize: 32, fontWeight: 600 }}
        />

        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={12}>
            <Statistic
              title="Thu"
              value={today?.thu_trong_ngay ?? 0}
              formatter={(v) => formatVnd(Number(v))}
              suffix="₫"
              prefix={<ArrowUpOutlined />}
              valueStyle={{ color: '#3f8600', fontSize: 18 }}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="Chi"
              value={today?.chi_trong_ngay ?? 0}
              formatter={(v) => formatVnd(Number(v))}
              suffix="₫"
              prefix={<ArrowDownOutlined />}
              valueStyle={{ color: '#cf1322', fontSize: 18 }}
            />
          </Col>
        </Row>

        {isClosed && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
            <Space wrap>
              <Tag color="default" icon={<LockOutlined />}>Đã chốt ca</Tag>
              <Text type="secondary">
                Đếm được {formatVnd(today?.counted_balance ?? 0)}₫
              </Text>
              {(today?.discrepancy ?? 0) !== 0 && (
                <Tag color="error">
                  {(today?.discrepancy ?? 0) > 0 ? 'Thừa ' : 'Thiếu '}
                  {formatVnd(Math.abs(today?.discrepancy ?? 0))}₫
                </Tag>
              )}
            </Space>
          </div>
        )}
      </Card>

      {/* Nut thao tac */}
      <Space style={{ width: '100%', marginBottom: 16 }} size="middle">
        {isClosed ? (
          <Button
            icon={<UnlockOutlined />}
            size="large"
            onClick={() => setReopenOpen(true)}
            block
          >
            Mở lại ca
          </Button>
        ) : (
          <>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="large"
              onClick={openAddModal}
              block
            >
              Thêm giao dịch
            </Button>
            <Button
              icon={<LockOutlined />}
              size="large"
              onClick={() => setCloseOpen(true)}
              block
            >
              Chốt ca
            </Button>
          </>
        )}
      </Space>

      {/* Danh sach giao dich */}
      <Card
        title={`Giao dịch ngày ${selectedDate.format('DD/MM/YYYY')}`}
        styles={{ body: { padding: details?.length ? 0 : 24 } }}
      >
        {loadingDetail ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : !details?.length ? (
          <Empty description="Chưa có giao dịch" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            dataSource={details}
            renderItem={(item) => {
              const isIn = item.direction === 'in';
              const auto = isAutoEntry(item.ref_table);
              // Chi sua/huy duoc giao dich nhap tay va ngay chua chot ca
              const canModify = !auto && !isClosed;

              return (
                <List.Item
                  style={{ padding: '12px 16px' }}
                  actions={
                    canModify
                      ? [
                          <Dropdown
                            key="menu"
                            trigger={['click']}
                            menu={{
                              items: [
                                {
                                  key: 'edit',
                                  icon: <EditOutlined />,
                                  label: 'Sửa',
                                  onClick: () => openEditModal(item),
                                },
                                {
                                  key: 'void',
                                  icon: <DeleteOutlined />,
                                  label: 'Huỷ giao dịch',
                                  danger: true,
                                  onClick: () => setVoidingEntry(item),
                                },
                              ],
                            }}
                          >
                            <Button type="text" icon={<MoreOutlined />} />
                          </Dropdown>,
                        ]
                      : undefined
                  }
                >
                  <List.Item.Meta
                    title={
                      <Space size={4} wrap>
                        <Text strong style={{ fontSize: 14 }}>
                          {item.description || getCashEntryLabel(item.entry_type)}
                        </Text>
                        {auto ? (
                          <Tag icon={<RobotOutlined />} color="blue" style={{ fontSize: 11 }}>
                            Tự động
                          </Tag>
                        ) : (
                          <Tag icon={<EditOutlined />} style={{ fontSize: 11 }}>
                            Nhập tay
                          </Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {getCashEntryLabel(item.entry_type)} ·{' '}
                        {dayjs(item.created_at).format('HH:mm')}
                      </Text>
                    }
                  />
                  <Text
                    strong
                    style={{
                      color: isIn ? '#3f8600' : '#cf1322',
                      fontSize: 15,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isIn ? '+' : '−'}{formatVnd(item.amount)}₫
                  </Text>
                </List.Item>
              );
            }}
          />
        )}
      </Card>

      <CashEntryModal
        open={entryModalOpen}
        onClose={() => {
          setEntryModalOpen(false);
          setEditingEntry(null);
        }}
        entryDate={dateStr}
        editingEntry={editingEntry}
      />
      <VoidEntryModal
        open={Boolean(voidingEntry)}
        onClose={() => setVoidingEntry(null)}
        entry={voidingEntry}
      />
      <CloseShiftModal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        shiftDate={dateStr}
        expectedBalance={today?.ton_luy_ke ?? 0}
      />
      <ReopenShiftModal
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        shiftDate={dateStr}
      />
    </div>
  );
}
```

---

## FILE 9 — `src/app/router.tsx` (sửa)

Thêm lazy import và route. Đặt cạnh các route feature khác trong children của `MainLayout`:

```typescript
// Them vao cac lazy import o dau file
const CashBookPage = lazy(() => import('@/features/cashbook/CashBookPage'));

// Them vao mang children cua MainLayout route
{
  path: 'so-quy',
  element: <CashBookPage />,
},
```

## FILE 10 — `BottomNav.tsx` (sửa)

Tìm file này (nhiều khả năng `src/app/layouts/BottomNav.tsx` hoặc `src/shared/components/BottomNav.tsx`). Thêm tab mới vào mảng items, **đặt trước tab Tài chính**:

```typescript
// Them import icon
import { WalletOutlined } from '@ant-design/icons';

// Them vao mang nav items
{
  key: '/so-quy',
  icon: <WalletOutlined />,
  label: 'Sổ quỹ',
  // KHONG co ownerOnly — Loi la nguoi dung chinh cua so quy
},
```

> Tab "Tài chính" hiện có `ownerOnly: true` — **giữ nguyên**. Sổ quỹ là tab riêng để Lợi dùng được mà không thấy P&L.

---

## Checklist nghiệm thu

- [ ] `npm run typecheck` sạch
- [ ] Trang `/so-quy` hiển thị tồn quỹ đúng (hiện tại: 3.896.000 ₫ ngày 21/07/2026)
- [ ] Tab "Sổ quỹ" hiện ở BottomNav, **không** bị ẩn với staff
- [ ] Thêm giao dịch chi vặt → tồn quỹ giảm tương ứng
- [ ] Giao dịch tự động (thu khách) có tag "Tự động", **không** có menu sửa/huỷ
- [ ] Giao dịch nhập tay có tag "Nhập tay" + menu ba chấm với Sửa/Huỷ
- [ ] Sửa giao dịch → số tiền cập nhật, tồn quỹ tính lại
- [ ] Huỷ giao dịch (bắt buộc ghi lý do) → biến mất khỏi danh sách, tồn quỹ tính lại
- [ ] Chốt ca → hiện tag "Đã chốt ca" + chênh lệch nếu có
- [ ] Sau khi chốt ca: nút Thêm/Chốt biến mất, chỉ còn "Mở lại ca"; menu sửa/huỷ trên từng dòng cũng biến mất
- [ ] Mở lại ca (bắt buộc ghi lý do) → quay lại trạng thái chưa chốt
- [ ] Test trên viewport mobile (375px): modal không tràn, nút bấm đủ lớn
- [ ] Mọi lỗi từ DB hiện qua toast, không crash trang

## Lỗi DB có thể gặp (đã có message tiếng Việt sẵn)

| Tình huống | Message |
|---|---|
| Thêm/sửa vào ngày đã chốt | `Ngay ... da chot ca luc ... Mo lai ca truoc khi sua.` |
| Huỷ mà không ghi lý do | `Phai ghi ly do huy giao dich` |
| Mở lại ca khi có ca sau đã chốt | `Co N ca sau ngay ... da chot. Mo lai cac ca do truoc` |
| Ghi giao dịch trước ngày khai sổ | `Khong the ghi giao dich ngay ... vi truoc ngay khai so ...` |

Các message này đã tiếng Việt không dấu từ DB — hiển thị nguyên văn qua toast là đủ, không cần map lại.
