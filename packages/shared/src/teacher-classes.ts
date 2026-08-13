/**
 * The teacher's Classes view, as data.
 *
 * The brief asks for four bands — Primary (Class One to Class Six), Secondary
 * (Form One to Form Five), Sixth Form (Lower and Upper Sixth) and Private
 * Classes — each opening to the classes the teacher actually holds inside it,
 * with a headcount on each.
 *
 * Three of those four are levels, and the schema already models them: `levels`
 * carries `PRIMARY_1..6`, `FORM_1..5`, `LOWER_SIXTH` and `UPPER_SIXTH`, grouped
 * by `SchoolType`. The fourth is not a level at all. A private class is a mode
 * of teaching, not a year group: a private learner sits in some level and is
 * taught one-to-one. The schema already draws that line too — a `Cohort` is a
 * group class, an `Assignment` is one teacher to one learner — so Private is
 * derived from the relationship rather than stored as a fifth school type.
 *
 * Putting the rule here rather than in a query is what stops the API and the UI
 * disagreeing about which band a class belongs to, in the same way `classes.ts`
 * does for the learner's four session views.
 */

/**
 * `SchoolType` is defined once, in `dto.ts`, and imported here rather than
 * restated. Two independent spellings of the same three-value union is exactly
 * the drift this module exists to prevent.
 */
import type { SchoolType } from './dto';

/** The four tiles on the teacher's Classes screen. */
export type ClassBand = 'primary' | 'secondary' | 'sixth_form' | 'private';

export const CLASS_BANDS: readonly ClassBand[] = [
  'primary',
  'secondary',
  'sixth_form',
  'private',
];

/**
 * The message key for a band's label.
 *
 * NFR-LOC-002: the words themselves live in the catalogues. A band is an
 * identifier here and a sentence only at the edge.
 */
export function bandLabelKey(band: ClassBand): string {
  return `teacher.classes.band.${band}`;
}

/**
 * Which band a group class belongs to.
 *
 * Group classes are banded by the level they are taught at. A class can never
 * be Private by this route: `privateBand` below is the only way into that
 * bucket, because privacy is a property of the teaching relationship.
 */
export function bandForSchoolType(schoolType: SchoolType): Exclude<ClassBand, 'private'> {
  return schoolType;
}

/** The band every one-to-one assignment lands in, whatever level the learner sits at. */
export const privateBand: ClassBand = 'private';

/**
 * One class as the teacher's Classes screen shows it.
 *
 * `learnerCount` is the number the brief asks for on each class. For a cohort
 * it is the current membership; for the private band each entry is a single
 * named learner, so it is always one and the name carries the information.
 */
export interface TeacherClassSummary {
  /** Cohort id, or the assignment id when `kind` is `private`. */
  id: string;
  kind: 'cohort' | 'private';
  /** The cohort's name, or the learner's display name for a private class. */
  name: string;
  band: ClassBand;
  /** Absent for a private learner whose level is not set. */
  levelCode: string | null;
  levelNameEn: string | null;
  levelNameFr: string | null;
  subjectId: string;
  subjectNameEn: string;
  subjectNameFr: string;
  learnerCount: number;
}

/** A band tile, with the count that goes on it before it is opened. */
export interface TeacherBandSummary {
  band: ClassBand;
  classCount: number;
  learnerCount: number;
}

/** The Classes screen's payload: the four tiles, and every class behind them. */
export interface TeacherClassesResponse {
  bands: TeacherBandSummary[];
  classes: TeacherClassSummary[];
}

/**
 * Roll classes up into the four tiles.
 *
 * Shared rather than computed server-side alone, so the screen can re-derive
 * the counts after a local change without a round trip and still agree with
 * what the API would have said.
 */
export function summariseBands(classes: readonly TeacherClassSummary[]): TeacherBandSummary[] {
  return CLASS_BANDS.map((band) => {
    const inBand = classes.filter((c) => c.band === band);
    return {
      band,
      classCount: inBand.length,
      learnerCount: inBand.reduce((total, c) => total + c.learnerCount, 0),
    };
  });
}

/** The level's name in the reader's language, or null when there is no level. */
export function levelName(cls: TeacherClassSummary, language: string): string | null {
  return language === 'fr' ? cls.levelNameFr : cls.levelNameEn;
}

/** The subject's name in the reader's language. */
export function subjectName(cls: TeacherClassSummary, language: string): string {
  return language === 'fr' ? cls.subjectNameFr : cls.subjectNameEn;
}
