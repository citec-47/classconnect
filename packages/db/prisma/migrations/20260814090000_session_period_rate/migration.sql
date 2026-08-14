-- What a period paid, frozen onto the lesson that earned it.
--
-- FR: "when a session is paid, save the rate that applied at that moment on the
-- session record. If the admin later changes the rate, past earnings must not
-- change with it."
--
-- Reading the rate from `PlatformConfig` at payment time would do the opposite:
-- every edit to that number would silently reprice the entire history, and a
-- teacher's payslip for March would move because somebody changed a setting in
-- June.
ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "period_rate_xaf" INTEGER;

-- Which lessons earn at all.
--
-- FR: a live class that comes from the timetable earns; the default Go Live
-- call earns nothing, and must never create an earning record.
--
-- Derivable from `timetable_slot_id` today, and stored anyway, because the two
-- answer different questions. A slot can later be withdrawn or put on hold —
-- the lesson taught inside it still earned what it earned, and an earnings pass
-- that re-derived eligibility from the current timetable would quietly unpay it.
ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "earns_from_timetable" BOOLEAN NOT NULL DEFAULT false;

-- Existing timetabled lessons keep their eligibility.
--
-- Anything already claimed against a slot was, by definition, timetabled
-- teaching. Leaving them all false would drop history out of the earnings pass.
UPDATE "sessions"
   SET "earns_from_timetable" = true
 WHERE "timetable_slot_id" IS NOT NULL;

COMMENT ON COLUMN "sessions"."period_rate_xaf" IS
  'XAF per 45-minute period at the time this lesson ran. Never re-read from config.';
