-- Reconstructed 2026-07-31 from live schema introspection: this migration was
-- applied directly to production (not via a local migration file), so the
-- original SQL text was never captured in git. Content below matches the
-- live enum state exactly (verified via pg_enum).

ALTER TYPE public.expense_category ADD VALUE IF NOT EXISTS 'Amenities';
