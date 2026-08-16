/**
 * The four categories the platform files learners and their work under.
 *
 * ## Why this is a function and not a column
 *
 * Three of the four follow from the learner's level: a learner at Class Three is
 * in Primary, one at Form Two is in Secondary, one at Upper Sixth is in Sixth
 * Form. Only "private" is independent of the level — a private learner sits at
 * one of those same levels and is simply not in an ordinary class.
 *
 * So the level answers three quarters of the question and `enrolmentType` answers
 * the rest. Storing all four on the learner would be storing the same fact twice,
 * and two copies of a fact are free to disagree: a learner marked "primary" while
 * sitting in Form Three, with nothing in the system able to say which is right.
 *
 * ## Why every surface calls this one function
 *
 * A derived category is only consistent if it is derived the same way everywhere.
 * Written out per screen it would drift, and a learner would appear under Primary
 * in one place and Secondary in another — which, for results and recordings, means
 * a child's marks filed where nobody looks for them.
 */

/** The four shelves, in the order they are shown. */
export const ACADEMIC_CATEGORIES = ['primary', 'secondary', 'sixth_form', 'private'] as const;
export type AcademicCategory = (typeof ACADEMIC_CATEGORIES)[number];

/** How a learner is enrolled, mirroring `EnrolmentType` in the schema. */
export type EnrolmentTypeValue = 'school' | 'private';

/**
 * Which category a learner belongs to.
 *
 * `private` wins over the school band deliberately, and unconditionally: a
 * private learner at Class One belongs under Private classes, not under Primary.
 * The brief is explicit that the two never mix — "a Class One private learner
 * never appears in Primary Class One" — so the level is not consulted at all
 * once the enrolment says private.
 *
 * Returns null when the level is unknown, rather than guessing. A learner with no
 * level has not yet been placed, and putting them in Primary because it is first
 * in the list would file a real child's marks under a class they are not in.
 */
export function academicCategoryOf(learner: {
  enrolmentType: EnrolmentTypeValue;
  /** `Level.schoolType`, or null when the learner has no level yet. */
  schoolType: string | null | undefined;
}): AcademicCategory | null {
  if (learner.enrolmentType === 'private') return 'private';

  switch (learner.schoolType) {
    case 'primary':
      return 'primary';
    case 'secondary':
      return 'secondary';
    case 'sixth_form':
      return 'sixth_form';
    default:
      return null;
  }
}

/**
 * Whether this category's learners are shown their position in the class.
 *
 * Primary sees marks and an average and no ranking. The younger the child, the
 * less a position tells them that their marks do not, and the more it becomes the
 * thing they remember. Every other category sees it, because by then a position
 * is what Cameroonian schooling reports and withholding it reads as evasion.
 *
 * A judgement, kept here so it is made once rather than per screen — and so that
 * changing it is one edit rather than a hunt.
 */
export function showsClassPosition(category: AcademicCategory | null): boolean {
  return category !== 'primary';
}
