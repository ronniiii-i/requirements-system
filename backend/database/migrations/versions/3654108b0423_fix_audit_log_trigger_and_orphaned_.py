"""fix_audit_log_trigger_and_orphaned_messages

Revision ID: 3654108b0423
Revises: 0001_initial_schema
Create Date: 2026-05-14 01:01:05.241382

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3654108b0423'
down_revision: Union[str, Sequence[str], None] = '0001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # ── Fix 1: add DEFAULT gen_random_uuid() to audit_log.id ─────────────
    # The column existed with NOT NULL but no default, so every trigger
    # INSERT got id=NULL and blew up, rolling back the requirement insert.
    op.execute("""
        ALTER TABLE audit_log
            ALTER COLUMN id SET DEFAULT gen_random_uuid();
    """)
 
    # ── Fix 2: rewrite trigger to always pass an explicit id ──────────────
    # Belt-and-suspenders: even if the default is ever removed, the trigger
    # itself always generates the UUID. Also preserves all the existing
    # status/priority/content change logging branches.
    op.execute("""
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
    """)
 
    # Recreate the trigger (function replacement above is enough, but
    # explicit DROP+CREATE ensures a clean slate if anything changed)
    op.execute("DROP TRIGGER IF EXISTS trg_audit_requirements ON requirements;")
    op.execute("""
        CREATE TRIGGER trg_audit_requirements
            AFTER INSERT OR UPDATE OR DELETE ON requirements
            FOR EACH ROW EXECUTE FUNCTION log_requirement_changes();
    """)
 
    # ── Fix 3: delete orphaned messages (conversation_id = NULL) ─────────
    # Created before the lazy-session-init fix. Cause DELETE /conversations
    # to fail because SQLAlchemy tries SET conversation_id=NULL before
    # deleting, which violates the NOT NULL constraint.
    op.execute("DELETE FROM messages WHERE conversation_id IS NULL;")
 
    # ── Fix 4: delete ghost conversations (zero messages) ─────────────────
    # Created by clicking "New chat" without sending a message (old behaviour).
    # Already filtered from list_conversations, but clean them from DB too.
    op.execute("""
        DELETE FROM conversations
        WHERE id NOT IN (
            SELECT DISTINCT conversation_id
            FROM messages
            WHERE conversation_id IS NOT NULL
        );
    """)
 
 
def downgrade() -> None:
    # Restore the original broken trigger (without gen_random_uuid())
    # so rollback leaves the DB in its prior state.
    # We can't restore deleted rows, but the trigger is reversible.
    op.execute("""
        CREATE OR REPLACE FUNCTION log_requirement_changes()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'INSERT' THEN
                INSERT INTO audit_log (project_id, requirement_id, changed_by, change_type, snapshot)
                VALUES (NEW.project_id, NEW.id, NEW.created_by, 'created', row_to_json(NEW));
            ELSIF TG_OP = 'UPDATE' THEN
                IF OLD.status IS DISTINCT FROM NEW.status THEN
                    INSERT INTO audit_log (project_id, requirement_id, change_type, field_changed, old_value, new_value, snapshot)
                    VALUES (NEW.project_id, NEW.id, 'status_changed', 'status', OLD.status::TEXT, NEW.status::TEXT, row_to_json(NEW));
                END IF;
                IF OLD.priority IS DISTINCT FROM NEW.priority THEN
                    INSERT INTO audit_log (project_id, requirement_id, change_type, field_changed, old_value, new_value, snapshot)
                    VALUES (NEW.project_id, NEW.id, 'priority_changed', 'priority', OLD.priority::TEXT, NEW.priority::TEXT, row_to_json(NEW));
                END IF;
                IF OLD.statement IS DISTINCT FROM NEW.statement OR OLD.title IS DISTINCT FROM NEW.title THEN
                    INSERT INTO audit_log (project_id, requirement_id, change_type, field_changed, snapshot)
                    VALUES (NEW.project_id, NEW.id, 'updated', 'statement/title', row_to_json(NEW));
                END IF;
            ELSIF TG_OP = 'DELETE' THEN
                INSERT INTO audit_log (project_id, requirement_id, change_type, snapshot)
                VALUES (OLD.project_id, OLD.id, 'deleted', row_to_json(OLD));
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
 
    op.execute("""
        ALTER TABLE audit_log
            ALTER COLUMN id DROP DEFAULT;
    """)
 