"""fix_audit_log_fk_and_orphaned_messages

Revision ID: 354786d19932
Revises: 3654108b0423
Create Date: 2026-05-14 02:00:26.453591

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '354786d19932'
down_revision: Union[str, Sequence[str], None] = '3654108b0423'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Fix orphaned messages that still exist ────────────────────────────
    op.execute("DELETE FROM messages WHERE conversation_id IS NULL;")
 
    # ── Clean ghost conversations with no messages ─────────────────────────
    op.execute("""
        DELETE FROM conversations
        WHERE id NOT IN (
            SELECT DISTINCT conversation_id
            FROM messages
            WHERE conversation_id IS NOT NULL
        );
    """)
 
    # ── Fix audit_log FK: change to ON DELETE SET NULL ────────────────────
    # The current FK has no ON DELETE action (defaults to RESTRICT/NO ACTION),
    # so deleting a requirement causes the AFTER DELETE trigger to fail when
    # it tries to INSERT into audit_log referencing the now-deleted requirement.
    # Making it SET NULL allows the audit log entry to exist without a live FK.
    op.execute("""
        ALTER TABLE audit_log
            DROP CONSTRAINT IF EXISTS audit_log_requirement_id_fkey;
    """)
    op.execute("""
        ALTER TABLE audit_log
            ADD CONSTRAINT audit_log_requirement_id_fkey
            FOREIGN KEY (requirement_id)
            REFERENCES requirements(id)
            ON DELETE SET NULL;
    """)
 
 
def downgrade() -> None:
    op.execute("""
        ALTER TABLE audit_log
            DROP CONSTRAINT IF EXISTS audit_log_requirement_id_fkey;
    """)
    op.execute("""
        ALTER TABLE audit_log
            ADD CONSTRAINT audit_log_requirement_id_fkey
            FOREIGN KEY (requirement_id)
            REFERENCES requirements(id);
    """)
 