
-- Mo rong entity_type enum de them 'decision', phuc vu predicate 'supersedes'
-- (quan he giua 2 brain.decisions, khac cac predicate ky thuat khac chi noi code/schema)
-- canonical_key convention rieng cho decision: 'decision:<uuid>' vi brain.decisions
-- khong co unique key dang text nhu brain.knowledge, chi co id bat bien.

ALTER TABLE brain.entities DROP CONSTRAINT entities_entity_type_check;

ALTER TABLE brain.entities ADD CONSTRAINT entities_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'module'::text, 'db_table'::text, 'db_view'::text, 'db_function'::text,
    'rpc'::text, 'migration'::text, 'frontend_file'::text, 'cron_job'::text,
    'edge_function'::text, 'decision'::text
  ]));
