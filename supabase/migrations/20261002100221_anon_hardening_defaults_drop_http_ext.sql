-- 20261002_anon_hardening_defaults v2 (Hieu duyet 02/10/2026; dry-run rollback dat)
-- A. Default privileges: object moi do postgres tao khong tu cap cho anon / PUBLIC
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA brain      GRANT EXECUTE ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA automation GRANT EXECUTE ON FUNCTIONS TO service_role;

DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES    FROM anon';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Bo qua default privileges cua supabase_admin (khong du quyen).';
END $$;

-- B. Go extension http (khong CASCADE; 0 object phu thuoc, pg_net khong bi anh huong)
DROP EXTENSION IF EXISTS http;

-- C. Ham trigger / event trigger trong public: go EXECUTE khoi anon / authenticated / PUBLIC
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prorettype IN ('trigger'::regtype, 'event_trigger'::regtype)
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e' AND d.classid = 'pg_proc'::regclass
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- D. current_user_role(): chi authenticated + service_role
GRANT  EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;
REVOKE ALL     ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
