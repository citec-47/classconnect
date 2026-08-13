-- A short spoken introduction, recorded by the applicant.
--
-- Certificates say what somebody studied and nothing about whether they can
-- hold a class's attention. It is also the cheapest check against a stolen
-- identity: the face and voice either match the ID document or they do not.
ALTER TYPE "TeacherDocumentType" ADD VALUE IF NOT EXISTS 'intro_video';
