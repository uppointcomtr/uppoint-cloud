-- Keep AuditLog immutable by default.
-- Deletion is allowed only for retention cleanup when session variable is set.

CREATE OR REPLACE FUNCTION "prevent_audit_log_delete_unless_retention"()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('uppoint.audit_retention_delete', true) = '1' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'AuditLog rows are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "tr_audit_log_no_delete" ON "AuditLog";

CREATE TRIGGER "tr_audit_log_no_delete"
BEFORE DELETE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION "prevent_audit_log_delete_unless_retention"();
