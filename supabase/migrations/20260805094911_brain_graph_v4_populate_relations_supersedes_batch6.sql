-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 05/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================

-- Batch 6: predicate 'supersedes' — decision -> decision
-- Case duy nhat xac dinh chac chan: OTA PDF import kien truc cu (Telegram+Haiku OCR, 24/07)
-- bi thay the boi Claude.ai doc PDF truc tiep (30/07). Kien truc cu chua tung build
-- (khong co ota_import_draft/convert_ota_draft_txn that trong DB) nen day la quan he
-- decision-decision, khong phai entity ky thuat-entity ky thuat nhu 5 batch truoc.

SELECT brain.resolve_entity(
  p_canonical_key := 'decision:fb6d5ff2-813d-4a47-9c91-b8084febd958',
  p_display_name := 'Auto-import booking OTA: Telegram Share PDF to Haiku OCR to draft to PMS (24/07/2026)'
);

SELECT brain.resolve_entity(
  p_canonical_key := 'decision:868a018a-2489-4116-a19d-0f9de4c91cbe',
  p_display_name := 'OTA PDF import: bo Telegram+Haiku OCR, chuyen sang Claude.ai doc PDF truc tiep (30/07/2026)'
);

SELECT brain.add_relation(
  p_subject_canonical_key := 'decision:868a018a-2489-4116-a19d-0f9de4c91cbe',
  p_predicate := 'supersedes',
  p_object_canonical_key := 'decision:fb6d5ff2-813d-4a47-9c91-b8084febd958',
  p_source := 'claude_suggested',
  p_review_status := 'suggested',
  p_note := 'Quyet dinh 30/07 thay the kien truc Telegram+Haiku OCR (24/07) bang Claude.ai doc PDF truc tiep. Kien truc cu chua tung build (khong co ota_import_draft table/convert_ota_draft_txn RPC that trong DB) nen supersedes noi decision-decision, khong phai entity ky thuat-entity ky thuat.'
);
