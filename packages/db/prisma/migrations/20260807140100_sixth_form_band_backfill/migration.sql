-- Moves Lower and Upper Sixth into their own band, and reclassifies the
-- teachers who demonstrably belong there.
--
-- The `high_school` category already identified these two levels; until now it
-- was only a reporting grouping, and `school_type` lumped them in with
-- secondary. Nothing about the levels themselves changes — only which band an
-- Admin classifies people into.
--
-- The GCE examination tracks (`exam`) and Adult GCE (`adult`) stay under
-- `secondary`. GCE Ordinary Level is secondary work, and Adult GCE spans both
-- levels, so neither belongs to sixth form as a whole. If the commercial view
-- differs, this is one UPDATE.

UPDATE "levels"
   SET "school_type" = 'sixth_form'
 WHERE "category" = 'high_school';

-- Teachers whose subjects sit *only* at sixth-form levels were classified
-- `secondary` because there was nothing else to be. They are reclassified here.
--
-- Only the unambiguous case is moved. A teacher who covers Form 3 and Upper
-- Sixth stays `secondary`, because guessing which band they were hired for
-- would silently change who can be assigned to them (FR-SCH-002). Those are
-- surfaced in the admin dashboard for a person to classify.
UPDATE "teachers" t
   SET "school_type" = 'sixth_form'
 WHERE t."school_type" = 'secondary'
   AND EXISTS (
     SELECT 1 FROM "teacher_subjects" ts
       JOIN "levels" l ON l."id" = ts."level_id"
      WHERE ts."teacher_id" = t."user_id"
   )
   AND NOT EXISTS (
     SELECT 1 FROM "teacher_subjects" ts
       JOIN "levels" l ON l."id" = ts."level_id"
      WHERE ts."teacher_id" = t."user_id"
        AND l."school_type" <> 'sixth_form'
   );

-- Learners follow their level, which has just moved, so their band is derived
-- rather than stored and needs no backfill.
