# Hotfix — TS2554 build error trên useRoomBlocks.ts

Lỗi build Vercel:
```
src/hooks/useRoomBlocks.ts(91,37): error TS2554: Expected 1 arguments, but got 2.
src/hooks/useRoomBlocks.ts(127,37): error TS2554: Expected 1 arguments, but got 2.
```

Nguyên nhân: `normalizeError(error: unknown): Error` chỉ nhận 1 argument, nhưng code
gọi `normalizeError(error, describeBlockError(error))` — 2 arguments. Lỗi này có từ
session trước (Fix #4 — RPC create_room_block_txn/delete_room_block_txn), không liên
quan tới M3/M5/M6.

## File: src/hooks/useRoomBlocks.ts

### Patch 1 — dòng ~91, trong `useCreateBlock`

Thay:
```typescript
        return data
      } catch (error) {
        throw normalizeError(error, describeBlockError(error))
      }
    },
    onSuccess: async () => {
      await invalidateOperationalQueries(queryClient)
    },
```

Bằng:
```typescript
        return data
      } catch (error) {
        // describeBlockError đã map message tiếng Việt cho mã lỗi P0040-P0042;
        // không đi qua normalizeError nữa vì message đã xử lý xong.
        throw new Error(describeBlockError(error))
      }
    },
    onSuccess: async () => {
      await invalidateOperationalQueries(queryClient)
    },
```

### Patch 2 — dòng ~127, trong `useDeleteBlock`

Thay:
```typescript
        return data
      } catch (error) {
        throw normalizeError(error, describeBlockError(error))
      }
    },
    onSuccess: () => {
      message.success('Mở block thành công')
```

Bằng:
```typescript
        return data
      } catch (error) {
        throw new Error(describeBlockError(error))
      }
    },
    onSuccess: () => {
      message.success('Mở block thành công')
```

## Lưu ý quan trọng — không sửa gì khác
- `onError` callback của cả 2 mutation vẫn gọi `normalizeError(error)` với 1 argument
  như cũ — KHÔNG đổi. `mapKnownRpcMessage` trong normalizeError dùng prefix-match
  (`BOOKING_NOT_FOUND`, `ROOM_CONFLICT:`...) nên message tiếng Việt từ
  `describeBlockError` sẽ không bị ghi đè (rơi vào fallback `return message`).
- `useBlocksForRoom` (dòng ~165) vẫn gọi `normalizeError(error)` 1 argument bình
  thường — không đổi.

## Sau khi sửa
- Chạy `tsc -b` hoặc `pnpm run build` để confirm hết lỗi TS2554.
- Commit: `fix: correct normalizeError call signature in useRoomBlocks (build hotfix)`
- Push để trigger lại Vercel deploy.