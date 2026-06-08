# Task: Add Language Toggle to DocumentActionsMenu

## Context
Hello Dalat PMS — React 18 + TypeScript + Ant Design 5.
File cần sửa: `src/features/documents/DocumentActionsMenu.tsx`

## What to do
Thêm language toggle VI/EN vào DocumentActionsMenu.
Không sửa file nào khác.

## Exact changes

### 1. Thêm `Segmented` vào import antd
Dòng import antd hiện tại:
```ts
import {
  Dropdown,
  Button,
  Modal,
  Input,
  DatePicker,
  InputNumber,
  Space,
  Typography,
  Divider,
} from 'antd'
```
Thêm `Segmented` vào cuối list:
```ts
import {
  Dropdown,
  Button,
  Modal,
  Input,
  DatePicker,
  InputNumber,
  Space,
  Typography,
  Divider,
  Segmented,
} from 'antd'
```

### 2. Thêm state `lang` sau các state hiện có
Sau dòng:
```ts
const [zaloPreviewOpen, setZaloPreviewOpen] = useState(false)
```
Thêm:
```ts
// Ngôn ngữ template — mặc định VI
const [lang, setLang] = useState<'vi' | 'en'>('vi')
```

### 3. Pass `lang` vào generateAndPrint trong triggerGenerate
Tìm:
```ts
    if (format === 'print') {
      await generateAndPrint({ kind })
    } else {
      await generateAndCopyZalo({ kind })
```
Thay bằng:
```ts
    if (format === 'print') {
      await generateAndPrint({ kind, lang })
    } else {
      await generateAndCopyZalo({ kind, lang })
```

### 4. Pass `lang` vào confirmDepositGenerate
Tìm:
```ts
    if (pendingFormat === 'print') {
      await generateAndPrint({
        kind: pendingKind,
        depositAmount: depositOpts.amount,
        depositDeadline: depositOpts.deadline,
      })
    } else {
      await generateAndCopyZalo({
        kind: pendingKind,
        depositAmount: depositOpts.amount,
        depositDeadline: depositOpts.deadline,
      })
```
Thay bằng:
```ts
    if (pendingFormat === 'print') {
      await generateAndPrint({
        kind: pendingKind,
        lang,
        depositAmount: depositOpts.amount,
        depositDeadline: depositOpts.deadline,
      })
    } else {
      await generateAndCopyZalo({
        kind: pendingKind,
        lang,
        depositAmount: depositOpts.amount,
        depositDeadline: depositOpts.deadline,
      })
```

### 5. Wrap Dropdown trong Space.Compact + thêm Segmented toggle
Tìm JSX:
```tsx
      <Dropdown
        menu={{ items: menuItems }}
        trigger={['click']}
        disabled={isGenerating}
      >
        <Button
          icon={<FileTextOutlined />}
          loading={isGenerating}
        >
          Tài liệu <DownOutlined />
        </Button>
      </Dropdown>
```
Thay bằng:
```tsx
      <Space.Compact>
        <Segmented<'vi' | 'en'>
          value={lang}
          onChange={setLang}
          options={[
            { label: 'VI', value: 'vi' },
            { label: 'EN', value: 'en' },
          ]}
          size="small"
          style={{ alignSelf: 'center' }}
          disabled={isGenerating}
        />
        <Dropdown
          menu={{ items: menuItems }}
          trigger={['click']}
          disabled={isGenerating}
        >
          <Button
            icon={<FileTextOutlined />}
            loading={isGenerating}
          >
            Tài liệu <DownOutlined />
          </Button>
        </Dropdown>
      </Space.Compact>
```

### 6. Update Zalo modal title + footer text để reflect lang
Tìm:
```tsx
      <Modal
        title="Text Zalo đã copy"
```
Thay bằng:
```tsx
      <Modal
        title={lang === 'en' ? 'Zalo text (copied)' : 'Text Zalo đã copy'}
```

Tìm:
```tsx
        <Button
            icon={<CopyOutlined />}
            onClick={() => {
              if (zaloText) navigator.clipboard.writeText(zaloText)
            }}
          >
            Copy lại
          </Button>
```
Thay bằng:
```tsx
        <Button
            icon={<CopyOutlined />}
            onClick={() => {
              if (zaloText) navigator.clipboard.writeText(zaloText)
            }}
          >
            {lang === 'en' ? 'Copy again' : 'Copy lại'}
          </Button>
```

Tìm:
```tsx
        <Text type="secondary" style={{ fontSize: 12 }}>
          Text đã được copy vào clipboard. Paste vào Zalo để gửi cho khách.
        </Text>
```
Thay bằng:
```tsx
        <Text type="secondary" style={{ fontSize: 12 }}>
          {lang === 'en'
            ? 'Text copied to clipboard. Paste into Zalo to send.'
            : 'Text đã được copy vào clipboard. Paste vào Zalo để gửi cho khách.'}
        </Text>
```

## Constraints
- Chỉ sửa `src/features/documents/DocumentActionsMenu.tsx`
- Không sửa `useDocumentGenerator.ts`, `documentTemplates.ts`, hay bất kỳ file nào khác
- Không thêm logic mới ngoài những thay đổi trên
- Không format lại code không liên quan

## Done when
- `Segmented` import có trong antd imports
- State `lang` tồn tại với type `'vi' | 'en'`
- Tất cả calls `generateAndPrint` và `generateAndCopyZalo` đều có `lang` được pass
- UI render `Segmented` VI/EN liền kề nút "Tài liệu" trong `Space.Compact`
- TypeScript không có lỗi mới