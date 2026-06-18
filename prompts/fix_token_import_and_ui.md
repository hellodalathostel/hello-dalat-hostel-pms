# Fix Room Board — import tokens.css (root cause mobile vỡ) + 3 cải tiến UI

## Root cause đã xác nhận
`getComputedStyle(document.documentElement).getPropertyValue('--row-height')` trả về `""` (rỗng)
trên trang thật → `src/theme/tokens.css` (chứa `--row-height`, `--space-*`, `--rule`, `--signal-*`, `--ink`...)
**chưa được import vào app**. `RoomBoard.module.css` dùng toàn biến rỗng → mất hết `padding`/`gap`/`height`/`border`,
lộ rõ nhất trên mobile breakpoint vì layout phụ thuộc các biến đó nhiều hơn desktop.

---

## File 1 — `src/main.tsx` (patch — thêm 1 dòng import)

Mở file, tìm phần import CSS hiện có (thường gần đầu file, cạnh `import './index.css'` hoặc tương đương).

```tsx
// TÌM (dòng import CSS hiện tại, có thể đang chỉ có 1 dòng kiểu):
import './index.css'

// THAY (thêm tokens.css — PHẢI import TRƯỚC index.css để index.css có thể override nếu cần,
// nhưng thực tế 2 file không đụng tên biến nên thứ tự không quan trọng, chỉ cần có mặt cả 2):
import './theme/tokens.css'
import './index.css'
```

> Nếu `main.tsx` import CSS theo cách khác (ví dụ từ `App.tsx`, hoặc đường dẫn `index.css` không phải `./index.css`), giữ đúng cấu trúc hiện có — chỉ cần thêm đúng 1 dòng `import './theme/tokens.css'` vào cùng file đang import `index.css`, đặt trước hoặc sau đều được.

**Sau khi thêm dòng này, đây là fix thật cho toàn bộ bug mobile vỡ** — không chỉ Room Board, mọi nơi khác trong app dùng biến từ `tokens.css` (nếu có) cũng sẽ được fix theo.

---

## File 2 — `src/features/dashboard/components/RoomBoard.tsx` (patch — xoá debug + áp 2 thay đổi UI)

**Bước 1 — Xoá đoạn debug tạm đã thêm trước đó:**

```tsx
// TÌM và XOÁ:
  // DEBUG TẠM — xoá sau khi xác nhận xong
  const debugRowHeight = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--row-height')
    : 'SSR'

```

```tsx
// TÌM và XOÁ:
      {/* DEBUG TẠM — xoá sau khi xác nhận xong */}
      <div style={{ background: 'yellow', color: 'black', padding: 8, fontSize: 14 }}>
        DEBUG --row-height = "{debugRowHeight}"
      </div>

```

**Bước 2 — Bỏ cột "Loại" khỏi header row:**

```tsx
// TÌM:
        <div className={`${styles.row} ${styles.head}`}>
          <span>Phòng</span>
          <span>Loại</span>
          <span>Khách</span>
          <span style={{ textAlign: 'right' }}>Giá/đêm</span>
          <span style={{ textAlign: 'right' }}>Trạng thái</span>
          <span />
        </div>

// THAY:
        <div className={`${styles.row} ${styles.head}`}>
          <span>Phòng</span>
          <span>Khách</span>
          <span style={{ textAlign: 'right' }}>Giá/đêm</span>
          <span style={{ textAlign: 'right' }}>Trạng thái</span>
          <span />
        </div>
```

**Bước 3 — Bỏ cột "Loại" khỏi mỗi dòng phòng:**

```tsx
// TÌM:
            <div key={room.room_id} className={styles.row}>
              <span className={styles.id}>{room.room_id}</span>
              <span className={styles.type}>{room.room_type}</span>
              <span className={styles.guest}>{renderGuestCell(room, state)}</span>

// THAY:
            <div key={room.room_id} className={styles.row}>
              <span className={styles.id}>{room.room_id}</span>
              <span className={styles.guest}>{renderGuestCell(room, state)}</span>
```

---

## File 3 — `src/features/dashboard/components/RoomBoard.module.css` (patch — bỏ track Loại, header đậm hơn, dòng cách rõ hơn)

**Bước 1 — `.row`: bỏ track 130px (Loại), còn 5 track; tăng border để cách dòng rõ hơn:**

```css
/* TÌM: */
.row {
  display: grid;
  grid-template-columns: 56px 1fr minmax(80px, 120px) 130px 150px 110px;
  align-items: center;
  height: var(--row-height);
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--rule);
  font-size: var(--text-base);
  gap: var(--space-2);
}

/* THAY: */
.row {
  display: grid;
  grid-template-columns: 56px 1fr 150px 150px 110px;
  align-items: center;
  height: var(--row-height);
  padding: 0 var(--space-4);
  border-bottom: 2px solid var(--rule);
  font-size: var(--text-base);
  gap: var(--space-2);
}
```

**Bước 2 — `.head`: đậm hơn, to hơn, đường ngăn cách rõ ràng:**

```css
/* TÌM: */
.head {
  height: auto;
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  background: var(--surface-subtle);
}

/* THAY: */
.head {
  height: auto;
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--ink);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--surface-raised);
  border-bottom: 2px solid var(--ink);
}
```

> Lưu ý: đổi `var(--text-muted)` → `var(--ink)` và `var(--surface-subtle)` → `var(--surface-raised)` vì 2 biến cũ (`--text-muted`, `--surface-subtle`) **không tồn tại trong `tokens.css`** (tokens.css dùng tên `--ink-dim`, `--surface-raised`). Dùng đúng tên biến đã định nghĩa để tránh lặp lại đúng lỗi root cause vừa fix.

**Bước 3 — Xoá rule `.type` (không còn dùng, tránh code mồ côi):**

```css
/* TÌM và XOÁ: */
.type {
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

```

**Bước 4 — Mobile breakpoint: bớt ẩn `.type` (đã xoá khỏi JSX, không cần ẩn nữa):**

```css
/* TÌM: */
@media (max-width: 640px) {
  .row {
    grid-template-columns: 48px 1fr 110px;
    height: auto;
    padding: var(--space-2) var(--space-3);
    row-gap: 4px;
  }
  .type,
  .price {
    display: none;
  }
  .status {
    grid-column: 1 / -1;
    justify-content: flex-start;
    order: 3;
  }
  .action {
    grid-column: 1 / -1;
    justify-content: flex-start;
    margin-top: 4px;
    order: 4;
  }
}

/* THAY: */
@media (max-width: 640px) {
  .row {
    grid-template-columns: 48px 1fr 110px;
    height: auto;
    padding: var(--space-2) var(--space-3);
    row-gap: 4px;
  }
  .price {
    display: none;
  }
  .status {
    grid-column: 1 / -1;
    justify-content: flex-start;
    order: 3;
  }
  .action {
    grid-column: 1 / -1;
    justify-content: flex-start;
    margin-top: 4px;
    order: 4;
  }
}
```

---

## Quét toàn bộ codebase tìm biến CSS không tồn tại (bắt buộc — phòng lặp lại root cause)

Vì root cause lần này là dùng biến CSS không được định nghĩa đúng nơi, chạy lệnh sau để tìm các chỗ khác trong
`src/` có thể đang dùng tên biến **không tồn tại trong `tokens.css`** (ví dụ `--text-muted`, `--surface-subtle`
là 2 cái đã phát hiện — `tokens.css` dùng `--ink-dim`, `--surface-raised`):

```bash
grep -rn "var(--text-muted\|var(--surface-subtle" src/ --include="*.css"
```

Nếu còn chỗ khác dùng các tên biến không tồn tại này, báo lại danh sách file/dòng để xử lý tiếp — không tự ý
sửa hàng loạt nếu chưa xác nhận, vì có thể các file đó cố ý dùng theme `index.css` (biến `--text-secondary`)
chứ không phải `tokens.css`.

---

## Checklist verify sau khi áp xong

1. `tsc --noEmit`, `eslint`, `npm run build` — sạch.
2. Reload Codespace preview, mở DevTools Console (hoặc dùng lại debug tạm nếu cần), gõ:
   `getComputedStyle(document.documentElement).getPropertyValue('--row-height')`
   → phải trả về `"44px"`, không còn rỗng.
3. **Test tay trên điện thoại thật** — đây là bug ban đầu được phát hiện trên mobile, bắt buộc xác nhận lại
   trên đúng thiết bị/màn hình đã thấy lỗi trước khi tin tưởng đã fix.
4. Xác nhận: cột "Loại" đã biến mất, header đậm/to hơn có đường kẻ dưới rõ, các dòng phòng có viền dưới rõ hơn
   (2px thay 1px).
5. Sau khi confirm ổn cả desktop + mobile → mới commit + push `main` → đợi Vercel deploy → test lại lần cuối
   trên `pms.hellodalathostel.com` thật.