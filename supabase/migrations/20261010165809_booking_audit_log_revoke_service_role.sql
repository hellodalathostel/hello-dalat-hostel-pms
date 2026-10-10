-- Dong lo hong append-only: service_role bypass RLS va mac dinh duoc cap ALL tren bang moi.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.booking_audit_log FROM service_role;
-- service_role giu SELECT. Chi trigger (SECURITY DEFINER, owner postgres) ghi duoc.
