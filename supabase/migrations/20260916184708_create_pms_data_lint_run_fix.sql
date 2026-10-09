CREATE OR REPLACE FUNCTION brain.lint_run_pms_data(p_persist boolean DEFAULT true)
RETURNS TABLE (
  severity text,
  check_code text,
  subcheck text,
  object_table text,
  object_label text,
  related_label text,
  detail text,
  metric numeric,
  status text,
  first_seen timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_run_id uuid := gen_random_uuid();
BEGIN
  CREATE TEMP TABLE _pms_lint_findings (
    severity text, check_code text, subcheck text,
    object_table text, object_label text, related_label text,
    detail text, metric numeric,
    fingerprint text
  ) ON COMMIT DROP;

  -- E1: check_out <= check_in
  INSERT INTO _pms_lint_findings
  SELECT '🔴', 'E', 'ngay_khong_hop_le', 'public.bookings',
    'booking ' || coalesce(b.code, b.id::text),
    NULL,
    format('check_in=%s, check_out=%s — check_out phải sau check_in', b.check_in, b.check_out),
    NULL,
    'E:ngay_khong_hop_le:' || b.id::text
  FROM public.bookings b
  WHERE b.check_out <= b.check_in AND b.is_deleted = false;

  -- E2: price_per_night <= 0 trên booking đang hoạt động
  INSERT INTO _pms_lint_findings
  SELECT '🟠', 'E', 'gia_khong_hop_le', 'public.bookings',
    'booking ' || coalesce(b.code, b.id::text),
    NULL,
    format('price_per_night=%s trên booking status=%s', b.price_per_night, b.status),
    b.price_per_night,
    'E:gia_khong_hop_le:' || b.id::text
  FROM public.bookings b
  WHERE b.price_per_night <= 0
    AND b.status <> 'cancelled'
    AND b.is_deleted = false;

  -- E3: guests_count vượt capacity của phòng
  INSERT INTO _pms_lint_findings
  SELECT '🟠', 'E', 'vuot_suc_chua', 'public.bookings',
    'booking ' || coalesce(b.code, b.id::text),
    'phòng ' || r.id,
    format('guests_count=%s > capacity=%s (phòng %s)', b.guests_count, r.capacity, r.id),
    (b.guests_count - r.capacity)::numeric,
    'E:vuot_suc_chua:' || b.id::text
  FROM public.bookings b
  JOIN public.rooms r ON r.id = b.room_id
  WHERE b.guests_count > r.capacity
    AND b.status IN ('booked','checked-in')
    AND b.is_deleted = false;

  -- E4: booking chồng ngày trên cùng 1 phòng
  INSERT INTO _pms_lint_findings
  SELECT '🔴', 'E', 'trung_lap_phong', 'public.bookings',
    'booking ' || coalesce(b1.code, b1.id::text),
    'booking ' || coalesce(b2.code, b2.id::text) || ' (cùng phòng ' || b1.room_id || ')',
    format('Hai booking cùng phòng %s chồng ngày: [%s→%s] và [%s→%s]',
      b1.room_id, b1.check_in, b1.check_out, b2.check_in, b2.check_out),
    NULL,
    'E:trung_lap_phong:' || least(b1.id::text, b2.id::text) || ':' || greatest(b1.id::text, b2.id::text)
  FROM public.bookings b1
  JOIN public.bookings b2
    ON b1.room_id = b2.room_id
    AND b1.id < b2.id
    AND b1.check_in < b2.check_out
    AND b2.check_in < b1.check_out
  WHERE b1.status IN ('booked','checked-in')
    AND b2.status IN ('booked','checked-in')
    AND b1.is_deleted = false AND b2.is_deleted = false;

  -- E5: quá check_out >3 ngày mà status vẫn booked/checked-in
  INSERT INTO _pms_lint_findings
  SELECT '🟡', 'E', 'status_tre', 'public.bookings',
    'booking ' || coalesce(b.code, b.id::text),
    NULL,
    format('check_out=%s (quá %s ngày) nhưng status vẫn "%s"',
      b.check_out, (CURRENT_DATE - b.check_out), b.status),
    (CURRENT_DATE - b.check_out)::numeric,
    'E:status_tre:' || b.id::text
  FROM public.bookings b
  WHERE b.check_out < CURRENT_DATE - interval '3 days'
    AND b.status IN ('booked','checked-in')
    AND b.is_deleted = false;

  -- E6: groups.source NULL
  INSERT INTO _pms_lint_findings
  SELECT '🟡', 'E', 'group_thieu_source', 'public.groups',
    'group ' || coalesce(g.customer_name, g.id::text),
    NULL,
    'groups.source đang NULL — booking thuộc group này sẽ mất nguồn khi báo cáo theo kênh',
    NULL,
    'E:group_thieu_source:' || g.id::text
  FROM public.groups g
  WHERE g.source IS NULL AND g.is_deleted = false;

  -- E7: phòng active thiếu base_price hợp lý
  INSERT INTO _pms_lint_findings
  SELECT '🔴', 'E', 'phong_thieu_gia', 'public.rooms',
    'phòng ' || r.id,
    NULL,
    format('base_price=%s trên phòng active — mọi booking mới tính giá từ đây', r.base_price),
    r.base_price::numeric,
    'E:phong_thieu_gia:' || r.id
  FROM public.rooms r
  WHERE r.is_active = true AND (r.base_price IS NULL OR r.base_price <= 0);

  IF p_persist THEN
    INSERT INTO brain.lint_findings
      (fingerprint, run_id, run_date, check_code, subcheck, severity,
       object_table, object_label, related_label, detail, metric,
       status, first_seen_at, last_seen_at)
    SELECT
      f.fingerprint, v_run_id, CURRENT_DATE, f.check_code, f.subcheck, f.severity,
      f.object_table, f.object_label, f.related_label, f.detail, f.metric,
      'open', now(), now()
    FROM _pms_lint_findings f
    ON CONFLICT (fingerprint) DO UPDATE SET
      last_seen_at = now(),
      run_id = v_run_id,
      run_date = CURRENT_DATE,
      status = CASE WHEN brain.lint_findings.status IN ('fixed','auto_resolved')
                     THEN 'reopened' ELSE brain.lint_findings.status END,
      detail = EXCLUDED.detail,
      metric = EXCLUDED.metric;
  END IF;

  RETURN QUERY
    SELECT f.severity, f.check_code, f.subcheck, f.object_table, f.object_label,
           f.related_label, f.detail, f.metric, 'open'::text, now()
    FROM _pms_lint_findings f
    ORDER BY
      CASE f.severity WHEN '🔴' THEN 1 WHEN '🟠' THEN 2 ELSE 3 END,
      f.check_code, f.subcheck;
END;
$$;
