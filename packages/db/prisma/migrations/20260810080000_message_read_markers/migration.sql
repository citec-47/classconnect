-- Read markers for message threads.
--
-- Unread is derived: every visible message in a thread created after the
-- participant's `last_read_at`. A stored counter would drift the first time a
-- write failed halfway, and would need reconciling; a timestamp cannot.
--
-- Nullable with no default, so an existing participant starts with everything
-- unread rather than everything silently marked read on deploy.
ALTER TABLE "thread_participants"
  ADD COLUMN "last_read_at" TIMESTAMPTZ(6);

-- Message attachments are signed and uploaded before the message that carries
-- them exists, so `message_id` is nullable for the window between the two.
-- Attaching at send time keeps an empty bubble out of a child's conversation
-- while a large file uploads over a slow connection.
ALTER TABLE "message_attachments"
  ALTER COLUMN "message_id" DROP NOT NULL;
