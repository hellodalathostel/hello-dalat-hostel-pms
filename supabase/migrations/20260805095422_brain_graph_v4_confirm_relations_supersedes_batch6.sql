
-- Confirm relation supersedes duy nhat vua populate (batch6)
-- Dung dung RPC confirm_relation()

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM brain.relations WHERE predicate = 'supersedes' AND review_status = 'suggested'
  LOOP
    PERFORM brain.confirm_relation(r.id);
  END LOOP;
END $$;
