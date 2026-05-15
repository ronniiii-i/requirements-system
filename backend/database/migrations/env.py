import os
import sys
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from dotenv import load_dotenv

load_dotenv()

# ── Add backend root to path so "from app.xxx" imports work ──────────────────
# env.py lives at backend/database/migrations/env.py
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

config = context.config

# Inject DB_URL directly from environment — bypasses Settings entirely
# so extra .env fields like RASA_SERVER_URL don't cause validation errors
db_url = os.environ.get("DB_URL")
if not db_url:
    raise RuntimeError("DB_URL environment variable is not set")
config.set_main_option("sqlalchemy.url", db_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── Import Base + every model so Alembic can see all tables ──────────────────
from app.database import Base  # noqa: E402

import app.models.conversation    # noqa: F401
import app.models.user_project    # noqa: F401
import app.models.nlp             # noqa: F401
import app.models.requirement     # noqa: F401
import app.models.traceability    # noqa: F401
import app.models.enums           # noqa: F401

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()