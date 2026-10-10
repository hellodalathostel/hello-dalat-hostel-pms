-- Them pg_temp vao CUOI search_path cho moi ham SECURITY DEFINER trong public da co search_path.
-- Giu nguyen phan schema hien co (public | brain, public | public, brain | rong), chi them pg_temp.
-- Loai rls_auto_enable: ham nen tang (search_path=pg_catalog), khong dong vao.
-- search_path rong ("") -> SET search_path TO pg_temp (vi `"", pg_temp` loi zero-length identifier).
DO $$
DECLARE
  r     record;
  v_cfg text;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, c AS cfg_item
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL unnest(p.proconfig) c
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef
      AND p.proname <> 'rls_auto_enable'
      AND c LIKE 'search_path=%'
      AND c NOT ILIKE '%pg_temp%'
  LOOP
    v_cfg := substr(r.cfg_item, length('search_path=') + 1);
    IF v_cfg IN ('', '""') THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path TO pg_temp', r.sig);
    ELSE
      EXECUTE format('ALTER FUNCTION %s SET search_path TO %s, pg_temp', r.sig, v_cfg);
    END IF;
  END LOOP;
END $$;
