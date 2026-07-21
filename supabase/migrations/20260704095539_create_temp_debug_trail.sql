-- Bang debug tam thoi, se DROP sau khi xong
CREATE TABLE IF NOT EXISTS public.debug_trail (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  step text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.debug_trail ENABLE ROW LEVEL SECURITY;

-- Chi service_role duoc ghi/doc (dung tam, khong expose qua API cong khai)
REVOKE ALL ON public.debug_trail FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.debug_trail TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.debug_trail_id_seq TO service_role;
