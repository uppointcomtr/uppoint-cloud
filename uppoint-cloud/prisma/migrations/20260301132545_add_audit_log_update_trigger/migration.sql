-- Audit log rows must stay immutable after insertion.
-- Retention cleanup still uses DELETE for old rows.

CREATE OR REPLACE FUNCTION "prevent_audit_log_update"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog rows are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "tr_audit_log_no_update" ON "AuditLog";

CREATE TRIGGER "tr_audit_log_no_update"
BEFORE UPDATE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION "prevent_audit_log_update"();
