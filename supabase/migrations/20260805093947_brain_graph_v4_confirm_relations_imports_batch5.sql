
-- Confirm toan bo 47 relation predicate='imports' vua populate (batch5)
-- Dung dung RPC confirm_relation() tung dong, khong UPDATE truc tiep

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM brain.relations WHERE predicate = 'imports' AND review_status = 'suggested'
  LOOP
    PERFORM brain.confirm_relation(r.id);
  END LOOP;
END $$;
