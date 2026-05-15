-- Migration: add title column to conversations table
-- Run this against your database after deploying the updated model.
-- If using Alembic, generate a new revision instead:
--   alembic revision --autogenerate -m "add_conversation_title"

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS title VARCHAR(200) NULL;

COMMENT ON COLUMN conversations.title IS 'Auto-generated human-readable title from the first user message. NULL until the user sends their first message.';