# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Hello Dalat Hostel PMS** — Property management system for an 8-room hostel in Da Lat, Vietnam.

- **Operators**: Owner (Nguyễn Thanh Hiếu) + Staff (Lợi/Housekeeping)
- **Deployment**: Vercel auto-deploy from `main` branch
- **Database**: Supabase project `rcfhhgywjdwqcgnpkbtl` (PostgreSQL 17, ap-southeast-1)
- **URL**: https://hello-dalat-hostel-pms.vercel.app

## Tech Stack

```
Frontend:  React 18 + TypeScript + Vite
UI:        Ant Design 5
State:     Zustand (auth) + TanStack Query v5 (server state)
Forms:     React Hook Form + Zod validation
Dates:     dayjs (NOT moment.js)
Routing:   React Router v6
Backend:   Supabase (Auth + RLS + Storage + Edge Functions + Realtime)
```

## Development Commands

```bash
npm run dev       # Start dev server (Vite)
npm run build     # Build for production (TypeScript check + Vite build)
npm run lint      # Run ESLint (note: known errors exist in router.tsx, CheckoutModal)
npm run preview   # Preview production build locally
```

## Core Architecture Principles

### 1. Database is Source of Truth

**Computed fields are trigger-managed** — never calculate these in frontend:
- `bookings.grand_total` — computed by trigger
- `bookings.room_subtotal` — computed by trigger  
- `bookings.nights` — `GENERATED ALWAYS AS (check_out - check_in) STORED`
- `groups.net_revenue` — computed by trigger

Frontend reads these values from the database, never recalculates them.

### 2. All Mutations Via RPC — No Direct INSERT/UPDATE/DELETE

```typescript
// ✅ Correct
const { data } = await supabase.rpc('create_group_booking_txn', { ... })

// ❌ Wrong — bypasses business logic
await supabase.from('bookings').insert({ ... })
```

All mutations to `bookings`, `payment_history`, `booking_guests` must go through RPC functions to maintain data integrity and trigger business logic.

### 3. Mandatory Import Paths

```typescript
// ✅ Always use these
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { useBreakpoint } from '@/shared/hooks/useBreakpoint'
import { normalizeError } from '@/shared/utils/normalizeError'

// ❌ Never use these
import { supabase } from '@/lib/supabase'  // Wrong path
import { message } from 'antd'  // Use useAppFeedback instead
```

**Rationale**: 
- `@/api/supabase` is the single source for the Supabase client
- `useAppFeedback` wraps Ant Design's static API with React context (required for App component)
- `useBreakpoint` is the single source for responsive breakpoints
- `normalizeError` parses PostgreSQL `RAISE EXCEPTION` messages from the `message` field

### 4. Error Handling Pattern

```typescript
import { normalizeError } from '@/shared/utils/normalizeError'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

const { message } = useAppFeedback()

try {
  const { data, error } = await supabase.rpc('some_function', { ... })
  if (error) throw error
  return data
} catch (err) {
  const normalized = normalizeError(err)
  message.error(normalized.message)
  throw normalized
}
```

`normalizeError` maps PostgreSQL error codes to user-friendly Vietnamese messages.

### 5. Booking Status Enum — Use Hyphens

```typescript
type BookingStatus = 'booked' | 'checked-in' | 'checked-out' | 'cancelled'

// ✅ Correct: 'checked-in'
// ❌ Wrong: 'checked_in' or 'checkedin'
```

### 6. Soft Deletes

Bookings have `is_deleted` column. Always filter:

```typescript
.or('is_deleted.is.null,is_deleted.eq.false')
```

## Active RPC Functions

| Function | Purpose |
|----------|---------|
| `create_group_booking_txn` | Create booking (group + bookings + services + discounts) |
| `update_booking_txn` | Update booking (pass `p_cancel: true` to cancel) |
| `checkin_booking_txn` | Check-in (upsert customers + link guests + update status) |
| `checkout_booking_txn` | Checkout single booking |
| `checkout_group_txn` | Checkout multiple bookings in a group |
| `record_payment_txn` | Record payment (auto-adds 4% surcharge if method='card') |
| `void_checkedout_booking_txn` | Soft-delete checked-out booking (owner only) |
| `void_payment_txn` | Void a payment |
| `add_early_late_txn` | Early check-in / late checkout |
| `check_room_availability` | Check if room is available for date range |
| `get_suggested_price` | Get price suggestion based on pricing rules |
| `current_user_role` | Get current user's role |
| `create_document_log` | Log document generation |

**Legacy functions (DO NOT USE)**:
- `create_booking`
- `check_booking_conflict`
- `checkout_booking`
- `process_checkout`

## Key Database Tables

### bookings
- `price_per_night` — the ONLY price input field (formerly `price`)
- `room_subtotal` — trigger-computed (`price_per_night × nights`)
- `grand_total` — trigger-computed (subtotal + surcharge + tax + services - discounts)
- `nights` — generated column (`check_out - check_in`)
- `status` — `'booked' | 'checked-in' | 'checked-out' | 'cancelled'`
- `is_deleted` — soft delete flag

### rooms
- `housekeeping_status` — `'clean' | 'dirty' | 'cleaning' | 'out_of_order'`
- Auto-flips to `'dirty'` on checkout via trigger `trg_room_dirty_on_checkout`

### groups
- `net_revenue` — trigger-computed
- `paid` — sum of payments
- Links multiple bookings for the same customer/reservation

## TanStack Query v5 Patterns

### Query Keys
```typescript
// Common query keys used across the app
['dashboard', 'today']
['room-calendar']
['booking-detail', groupId]
['bookings']
['groups']
```

### Mutation Pattern
```typescript
const mutation = useMutation({
  mutationFn: async (payload) => {
    const { data, error } = await supabase.rpc('some_function', payload)
    if (error) throw error
    return data
  },
  onSuccess: () => {
    // Always invalidate relevant queries
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
    queryClient.invalidateQueries({ queryKey: ['room-calendar'] })
    message.success('Thành công')
  },
  onError: (err) => {
    message.error(normalizeError(err).message)
  }
})
```

## Responsive UI Patterns

```typescript
const { isMobile, isTablet, isDesktop } = useBreakpoint()

// Use Flex instead of Space for header rows
<Flex justify="space-between" align="center">
  <Title level={4}>...</Title>
  <Button>...</Button>
</Flex>
```

## Date Formatting

```typescript
import dayjs from 'dayjs'

// Display format
dayjs(date).format('DD/MM/YYYY')

// ISO string for database
dayjs(date).format('YYYY-MM-DD')
```

## Currency Formatting

```typescript
new Intl.NumberFormat('vi-VN', { 
  style: 'currency', 
  currency: 'VND' 
}).format(amount)
```

## Migration Rules (Since 2026-05-30)

All new tables in `public` or `brain` schema MUST include at end of migration:

```sql
ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.new_table TO anon;
GRANT ALL ON public.new_table TO authenticated;
GRANT ALL ON public.new_table TO service_role;
```

## Folder Structure

```
src/
  api/
    supabase.ts              # ← ONLY source for Supabase client
  features/
    bookings/
      hooks/                 # useCheckIn, useCheckout, useRecordPayment, useVoidBooking
      components/            # BookingDetailDrawer, CheckInModal, CheckoutModal
    rooms/
    documents/
      documentTemplates.ts   # Document generation templates
    finance/
    housekeeping/
    ota-calendar/
    telegram/
  shared/
    hooks/
      useBreakpoint.ts       # ← ONLY source for responsive breakpoints
      useAppFeedback.ts      # ← ONLY source for toast/notifications
      useCurrentUserRole.ts
    utils/
      normalizeError.ts      # ← Parse PostgreSQL RAISE EXCEPTION
    components/
      BottomNav.tsx
```

## Important Views

```typescript
// Today's dashboard — all rooms with current bookings/blocks
supabase.from('dashboard_today').select('*')

// Calendar view — bookings + blocks merged
supabase.from('room_calendar').select('*')

// DK14 compliance report (19 columns)
supabase.from('dk14_luu_tru').select('*')

// Finance revenue (use this, NOT monthly_revenue)
supabase.from('finance_monthly_revenue').select('*')
```

## Business Rules (Decided)

1. No public Register page — only Owner creates Staff accounts
2. After checkout → room automatically becomes "dirty" (trigger-managed)
3. CCCD not required at booking creation, REQUIRED at check-in
4. Checkout with outstanding balance: ALLOWED with confirmation checkbox (`p_confirm_debt: true`)
5. Card payment surcharge: 4% auto-added when `method = 'card'`, must pass `p_first_booking_id`
6. Default check-in time: 14:00, check-out time: 12:00
7. Never bypass RLS — no `service_role` key in frontend code
8. `ocr-id-scanner` Edge Function exists but is NOT called from UI
9. `bot_leads` table has no UI — managed by Telegram bot only
10. Finance view: use `finance_monthly_revenue`, NOT `monthly_revenue`

## Known Issues (Do Not Fix Without Approval)

- Lint errors in `router.tsx` and `CheckoutModal` — acknowledged, not blocking
- `app_users.firebase_uid` is legacy — pending removal
- iCal DTSTAMP uses `ZZ` suffix instead of `Z` — pending confirmation

## Workflow

This repo follows a multi-AI workflow:

1. **Claude.ai** (Lead Developer) → architecture, schema design, code review
2. **Claude Code** (you) → implementation in the repo based on specs
3. **Hiếu** (Product Owner) → final review and merge approval

**Important**: Do NOT make architecture or schema decisions independently. Database changes require approval from Claude.ai first.

## Current Development Phase

- **Phase 3**: Complete
- **Phase 4 in progress**:
  - ✅ 4.1 Telegram bot integration
  - ❌ 4.2 Dynamic pricing (CANCELLED — replaced by Telegram price-alert-bot)
  - ⏳ 4.4 Zalo OA guest messaging
  - ⏳ 4.5 WhatsApp guest messaging

## What NOT to Do

- ❌ Change database schema without Claude.ai approval
- ❌ Direct INSERT/UPDATE/DELETE on `bookings`, `payment_history`, `booking_guests`
- ❌ Create new Edge Functions without checking the existing 8 functions
- ❌ Use `any` in TypeScript
- ❌ Hardcode Supabase URL/key (use `import.meta.env`)
- ❌ Bypass RLS with `service_role` key in frontend
- ❌ Use legacy RPC functions: `checkout_booking`, `process_checkout`
- ❌ Use field name `price` in bookings (must be `price_per_night`)
- ❌ Calculate `room_subtotal` or `grand_total` in frontend (read from DB)
- ❌ Use `import { message } from 'antd'` static API (use `useAppFeedback`)
