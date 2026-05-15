"""fix_audit_log_fk_on_delete_set_null

Revision ID: c88763c8f6bb
Revises: 354786d19932
Create Date: 2026-05-14 12:34:19.381495

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c88763c8f6bb'
down_revision: Union[str, Sequence[str], None] = '354786d19932'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check and drop whatever the constraint is currently named
    # (it may differ from 'audit_log_requirement_id_fkey' depending on
    # how the table was originally created)
    op.execute("""
        DO $$
        DECLARE
            con_name TEXT;
        BEGIN
            SELECT conname INTO con_name
            FROM pg_constraint
            WHERE conrelid = 'audit_log'::regclass
              AND contype = 'f'
              AND conkey = ARRAY(
                SELECT attnum FROM pg_attribute
                WHERE attrelid = 'audit_log'::regclass
                  AND attname = 'requirement_id'
              );
 
            IF con_name IS NOT NULL THEN
                EXECUTE 'ALTER TABLE audit_log DROP CONSTRAINT ' || quote_ident(con_name);
            END IF;
        END $$;
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