# Fix QR size — tăng gấp đôi 110px → 220px

File: `src/features/documents/documentTemplates.ts`

Áp dụng đúng 1 str_replace patch sau. Không thay đổi gì khác.

---

## PATCH — BASE_STYLE: tăng kích thước QR image

### FIND (exact):
```
  .qr-img { width:110px; height:110px; background:#fff; border:0.5px solid #d0c8b8; border-radius:4px; display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden; }
    .qr-img img { width:110px; height:110px; object-fit:contain; }
    ```

    ### REPLACE WITH:
    ```
      .qr-img { width:220px; height:220px; background:#fff; border:0.5px solid #d0c8b8; border-radius:4px; display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden; }
        .qr-img img { width:220px; height:220px; object-fit:contain; }
        ```

        ---

        ## Kiểm tra sau khi apply

        ```bash
        npx tsc --noEmit
        ```

        Commit message gợi ý:
        ```
        fix(documents): increase QR code size 110px → 220px
        ```