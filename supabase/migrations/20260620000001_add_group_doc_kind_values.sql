-- M2: Thêm 3 giá trị doc_kind cho document nhóm (group_invoice, group_confirmation,
-- group_deposit_request). Trước đây code gọi create_document_log với các giá trị này
-- nhưng enum chưa có → RPC throw lỗi invalid enum input, audit trail bị mất 100%
-- cho 3 loại document này (confirm qua query: 0 dòng log group_* trong document_logs).
-- Ngày: 2026-06-20

ALTER TYPE doc_kind ADD VALUE 'group_invoice';
ALTER TYPE doc_kind ADD VALUE 'group_confirmation';
ALTER TYPE doc_kind ADD VALUE 'group_deposit_request';
