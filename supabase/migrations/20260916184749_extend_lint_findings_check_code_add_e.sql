ALTER TABLE brain.lint_findings DROP CONSTRAINT lint_findings_check_code_check;
ALTER TABLE brain.lint_findings ADD CONSTRAINT lint_findings_check_code_check
  CHECK (check_code = ANY (ARRAY['A','B','C','D','E']));
