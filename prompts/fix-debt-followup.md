# Fix-up: lỗi mới phát sinh sau khi sửa bug /debt (groups.grand_total)

## Bối cảnh
Đã chạy `/debt` thật trên Telegram sau khi deploy fix trước đó. Kết quả:
```
❌ Lỗi: invalid input syntax for type integer: "net_revenue"
```

Đây là lỗi MỚI, khác lỗi gốc (lỗi gốc là "column grand_total does not exist").
Lỗi này nghĩa là ở đâu đó trong code xử lý `/debt`, chuỗi `"net_revenue"` đang bị
truyền vào một chỗ Postgres/JS expect kiểu `integer` — nhiều khả năng đây là lỗi
thao tác khi đổi tên field: thay `grand_total` thành `net_revenue` nhưng quên đây
là tên CỘT cần dùng làm field reference (vd trong object property access hoặc
trong câu SQL string interpolation), không phải literal string truyền trực tiếp
vào RPC param hoặc filter value.

## Việc cần làm

1. Mở `supabase/functions/telegram-webhook/index.ts`, tìm đúng đoạn xử lý `/debt`
   (đã sửa ở lần trước, dùng `net_revenue` thay `grand_total`).

   2. Đọc kỹ context xung quanh chỗ dùng `net_revenue` — tìm chỗ nào nó được dùng
      SAI vai trò. Các khả năng cụ thể cần kiểm tra:
         - Có đang truyền `"net_revenue"` như một GIÁ TRỊ (string) vào `.eq()`, `.gt()`,
              hoặc param của 1 RPC call thay vì dùng nó như TÊN CỘT trong `.select()`?
                   Ví dụ sai: `.eq('net_revenue', someValue)` khi ý đồ thực ra là đọc field
                        `b.net_revenue` từ object đã fetch.
                           - Có đang nối chuỗi SQL kiểu `WHERE amount = ${net_revenue}` mà
                                `net_revenue` ở đây là tên cột (string) chứ không phải giá trị?
                                   - Có chỗ nào `parseInt()` hoặc cộng trừ số học đang nhận `"net_revenue"`
                                        (chuỗi tên cột) làm operand thay vì giá trị số thật của field đó?

                                        3. KHÔNG đoán mò sửa khi chưa đọc rõ dòng code gây lỗi. Nếu cần, thêm tạm
                                           `console.log` để in ra object `groups`/`booking` thực tế đang xử lý trước
                                              khi tính debt, xác nhận field nào đúng tên đúng kiểu, rồi mới sửa logic
                                                 tính `debt = net_revenue - paid` (hoặc công thức đúng theo business logic
                                                    đã thấy ở phần code khác xử lý hiển thị số tiền).

                                                    4. Sau khi sửa, deploy lại `telegram-webhook`, rồi báo lại Claude.ai dòng code
                                                       gây lỗi cụ thể là gì (để ghi vào brain.decisions làm bài học, tránh lặp lại
                                                          kiểu lỗi "đổi tên field nhưng sai vai trò field/value" này).

                                                          ## Test bắt buộc trước khi báo done
                                                          Tự gọi `/debt` thật qua Telegram (không chỉ deploy thành công là đủ) — bug
                                                          trước đã từng "deploy OK, không lỗi log" nhưng vẫn crash khi gọi thật, nên
                                                          lần này phải thấy output `/debt` hiển thị đúng số tiền, không còn error message.

                                                          ## Commit
                                                          `fix(telegram-webhook): correct net_revenue field usage in /debt command (follow-up)`