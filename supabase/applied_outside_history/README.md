# Migration áp ngoài lịch sử
Các file SQL trong thư mục này đã được áp lên production nhưng KHÔNG có version tương ứng trong `supabase_migrations.schema_migrations`.
KHÔNG replay bằng `supabase db push` / `db reset`: chúng chỉ được giữ lại để tra cứu.
Các file dùng `CREATE TABLE` không có `IF NOT EXISTS`, chạy lại sẽ lỗi vì đối tượng đã tồn tại.
Muốn thay đổi các đối tượng này: viết migration mới trong `supabase/migrations/`.
