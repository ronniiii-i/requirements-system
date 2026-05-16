"""fix_audit_log_delete_trigger_null_requirement_id

Revision ID: fix_audit_delete_001
Revises: c88763c8f6bb
Create Date: 2026-05-16

"""
from alembic import op

revision = 'fix_audit_delete_001'
down_revision = 'c88763c8f6bb'
branch_labels = None
depends_on = None


def upgrade() -> None:
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
                    OLD.project_id, NULL, 'deleted', row_to_json(OLD)
                );
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)


def downgrade() -> None:
    # Restore previous (broken) behaviour
    op.execute("""
        CREATE OR REPLACE FUNCTION log_requirement_changes()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'DELETE' THEN
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