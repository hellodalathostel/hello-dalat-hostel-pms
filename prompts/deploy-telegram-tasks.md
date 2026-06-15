# Deploy: Telegram Task Management Commands

## Bước 1: Copy file vào repo

1. Copy nội dung file `telegram-webhook-v18.ts` → `supabase/functions/telegram-webhook/index.ts` (REPLACE toàn bộ)
2. Copy nội dung file `task-reminder.ts` → `supabase/functions/task-reminder/index.ts` (REPLACE toàn bộ)

## Bước 2: Deploy via Supabase CLI

```bash
cd D:\hello-dalat-hostel-pms
supabase functions deploy telegram-webhook
supabase functions deploy task-reminder
```

## Bước 3: Verify

Test /tasks trong Telegram group.