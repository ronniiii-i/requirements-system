-- ============================================================
-- ReqGen: Fix audit_log id default + orphaned messages cleanup
-- Run this once against your database.
-- ============================================================

-- ── Fix 1: audit_log.id has no DEFAULT, causing NOT NULL violation ────────
-- Every INSERT into audit_log from the trigger gets id=NULL.
-- Adding gen_random_uuid() as default fixes it permanently.

ALTER TABLE audit_log
    ALTER COLUMN id SET DEFAULT gen_random_uuid();


-- ── Fix 2: also explicitly set it in the trigger function ────────────────
-- Belt and suspenders: the trigger now always passes an explicit id,
-- so it works even if the column default ever gets dropped.

CREATE OR REPLACE FUNCTION log_requirement_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (
            id, project_id, requirement_id, changed_by,
            change_type, snapshot
        )
        VALUES (
            gen_random_uuid(),
            NEW.project_id, NEW.id, NEW.created_by,
            'created', row_to_json(NEW)
        );

    ELSIF TG_OP = 'UPDATE' THEN
        -- Status changes
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO audit_log (
                id, project_id, requirement_id, change_type,
                field_changed, old_value, new_value, snapshot
            )
            VALUES (
                gen_random_uuid(),
                NEW.project_id, NEW.id, 'status_changed',
                'status', OLD.status::TEXT, NEW.status::TEXT, row_to_json(NEW)
            );
        END IF;

        -- Priority changes
        IF OLD.priority IS DISTINCT FROM NEW.priority THEN
            INSERT INTO audit_log (
                id, project_id, requirement_id, change_type,
                field_changed, old_value, new_value, snapshot
            )
            VALUES (
                gen_random_uuid(),
                NEW.project_id, NEW.id, 'priority_changed',
                'priority', OLD.priority::TEXT, NEW.priority::TEXT, row_to_json(NEW)
            );
        END IF;

        -- Content updates
        IF OLD.statement IS DISTINCT FROM NEW.statement
            OR OLD.title IS DISTINCT FROM NEW.title THEN
            INSERT INTO audit_log (
                id, project_id, requirement_id, change_type,
                field_changed, snapshot
            )
            VALUES (
                gen_random_uuid(),
                NEW.project_id, NEW.id, 'updated',
                'statement/title', row_to_json(NEW)
            );
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (
            id, project_id, requirement_id, change_type, snapshot
        )
        VALUES (
            gen_random_uuid(),
            OLD.project_id, OLD.id, 'deleted', row_to_json(OLD)
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger definition is unchanged — just recreating after function update
DROP TRIGGER IF EXISTS trg_audit_requirements ON requirements;
CREATE TRIGGER trg_audit_requirements
    AFTER INSERT OR UPDATE OR DELETE ON requirements
    FOR EACH ROW EXECUTE FUNCTION log_requirement_changes();


-- ── Fix 3: delete orphaned messages (conversation_id = NULL) ─────────────
-- These were created before the lazy-session-init fix. They cause
-- DELETE /conversations/:id to fail because SQLAlchemy tries to
-- SET conversation_id = NULL before deleting (violates NOT NULL).

DELETE FROM messages WHERE conversation_id IS NULL;


-- ── Fix 4: delete ghost conversations (no messages) ───────────────────────
-- These were created before the lazy-init fix (clicking "new chat" without
-- sending a message). list_conversations already filters them out, but
-- they still exist in the DB and block clean deletes.

DELETE FROM conversations
WHERE id NOT IN (
    SELECT DISTINCT conversation_id
    FROM messages
    WHERE conversation_id IS NOT NULL
);


-- ── Verify ────────────────────────────────────────────────────────────────
SELECT
    column_name,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'audit_log'
  AND column_name = 'id';
-- Expected: column_default = 'gen_random_uuid()', is_nullable = 'NO'
