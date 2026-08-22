-- Live chat with visitors: FR-SUP-001's in-app chat, for people with no account.
--
-- Deliberately separate from message_threads and tickets. Everything in those is
-- anchored to a user row -- a thread has participants, a ticket has a requester
-- -- and that anchoring is what makes a learner's messages private. Admitting
-- anonymous rows there would weaken the property that protects children's
-- conversations, so visitors get their own two tables that nobody is
-- authenticated for.

CREATE TYPE "ChatSessionStatus" AS ENUM ('waiting', 'active', 'closed');
CREATE TYPE "ChatSender" AS ENUM ('visitor', 'staff');

CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    -- The visitor's credential, which is why "id" is safe to show staff. Anyone
    -- holding this can read and post to the conversation, so it is a secret and
    -- not an identifier.
    "visitor_token" VARCHAR(64) NOT NULL,
    "visitor_name" VARCHAR(120),
    "visitor_email" VARCHAR(320),
    -- Rate limiting and abuse review only; NFR-SEC-009 keeps it out of logs.
    "visitor_ip" VARCHAR(64),
    "status" "ChatSessionStatus" NOT NULL DEFAULT 'waiting',
    "assigned_to" UUID,
    -- Read watermarks, one per side. The unread count is "messages from the
    -- other side newer than this" -- one indexed comparison, where a per-message
    -- flag means writing every row in the conversation each time it is opened.
    "staff_read_at" TIMESTAMPTZ(6),
    "visitor_read_at" TIMESTAMPTZ(6),
    -- Denormalised so the queue sorts and previews without loading messages.
    "last_message_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_sessions_visitor_token_key" ON "chat_sessions"("visitor_token");
CREATE INDEX "chat_sessions_status_last_message_at_idx"
  ON "chat_sessions"("status", "last_message_at");

ALTER TABLE "chat_sessions"
  ADD CONSTRAINT "chat_sessions_assigned_to_fkey"
    FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "sender" "ChatSender" NOT NULL,
    -- Null for a visitor, who has no account.
    "sender_id" UUID,
    "body" TEXT NOT NULL,
    -- A storage key and not a URL: FR-FIL-003 signs the download per request and
    -- re-checks the scan at that moment, so nothing here is forwardable.
    "file_name" VARCHAR(300),
    "storage_key" VARCHAR(500),
    "mime_type" VARCHAR(100),
    "size_bytes" INTEGER,
    "scan_status" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_messages_session_id_created_at_idx"
  ON "chat_messages"("session_id", "created_at");

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
