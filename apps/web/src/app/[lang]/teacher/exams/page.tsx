'use client';

import { useCallback, useEffect, useState } from 'react';
import { QUESTION_TYPES, isAutoMarkable, type TeacherQuestionType } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api';
import { PageHeader } from '@/components/admin/ui';
import { ErrorAlert, SuccessAlert } from '@/components/Alert';
import { TeacherGate } from '@/components/teacher/TeacherGate';

interface Named {
  id: string;
  nameEn: string;
  nameFr: string;
}

interface Exam {
  id: string;
  title: string;
  type: string;
  durationMin: number | null;
  subject: Named;
  level: Named | null;
  cohort: { id: string; name: string } | null;
  questionCount: number;
  totalMarks: number;
  structuralCount: number;
  attemptCount: number;
  submittedCount: number;
  published: boolean;
  resultsReleased: boolean;
}

interface TeachingPair {
  subject: Named;
  level: Named;
}

interface AttemptRow {
  attemptId: string;
  learner: { id: string; fullName: string };
  submittedAt: string | null;
  state: string;
  terminated: boolean;
  score: number | null;
  percentage: number | null;
  needsMarking: number;
}

interface MarkingAnswer {
  answerId: string;
  question: {
    id: string;
    type: string;
    prompt: string;
    marks: number;
    options: { id: string; label: string; isCorrect: boolean }[];
  };
  response: unknown;
  awarded: number | null;
  comment: string | null;
}

interface DraftQuestion {
  type: TeacherQuestionType;
  prompt: string;
  marks: string;
  options: { label: string; isCorrect: boolean }[];
}

/**
 * BUILD-PLAN Phase 4 — setting and marking exams.
 *
 * Three things happen on this screen, in the order the brief describes them: the
 * teacher writes a paper, publishes it to a class, and marks what comes back.
 *
 * The one rule worth stating in the UI, because it surprises people: a paper with
 * a structural question is **always** deferred-release. Multiple choice marks
 * itself on submit; a structural answer needs a human. Showing a child a score
 * that is missing half their paper would be worse than making them wait, so the
 * server overrides the choice and the form says so before it is made.
 */
function TeacherExamsPage() {
  const { t, language } = useI18n();

  const [exams, setExams] = useState<Exam[] | null>(null);
  const [pairs, setPairs] = useState<TeachingPair[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ title: '', pair: '', durationMin: '60' });
  const [questions, setQuestions] = useState<DraftQuestion[]>([blankQuestion()]);

  const [attemptsFor, setAttemptsFor] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[] | null>(null);
  const [marking, setMarking] = useState<{
    attemptId: string;
    learner: string;
    answers: MarkingAnswer[];
  } | null>(null);
  const [awards, setAwards] = useState<Record<string, string>>({});

  const name = (item: Named) => (language === 'fr' ? item.nameFr : item.nameEn);

  const load = useCallback(async () => {
    try {
      const [mine, application] = await Promise.all([
        api<{ exams: Exam[] }>('/teacher/exams', { language }),
        api<{ subjects: TeachingPair[] }>('/teachers/me/application', { language }),
      ]);
      setExams(mine.exams);
      setPairs(application.subjects);
      setForm((current) =>
        current.pair || application.subjects.length === 0
          ? current
          : {
              ...current,
              pair: `${application.subjects[0]!.subject.id}:${application.subjects[0]!.level.id}`,
            },
      );
    } catch (caught) {
      setError(caught as ApiError);
      setExams([]);
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasStructural = questions.some((question) => !isAutoMarkable(question.type));

  const createExam = async () => {
    const [subjectId, levelId] = form.pair.split(':');
    if (!subjectId || !levelId) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api('/teacher/exams', {
        method: 'POST',
        body: {
          title: form.title.trim(),
          subjectId,
          levelId,
          type: 'quiz',
          durationMin: Number(form.durationMin) || undefined,
          releasePolicy: hasStructural ? 'deferred' : 'immediate',
          questions: questions.map((question) => ({
            type: question.type,
            prompt: question.prompt.trim(),
            marks: Number(question.marks) || 1,
            ...(isAutoMarkable(question.type)
              ? { options: question.options.filter((option) => option.label.trim().length > 0) }
              : {}),
          })),
        },
        language,
        timeoutMs: 120_000,
      });
      setDone(t('teacherExams.created'));
      setComposing(false);
      setForm((current) => ({ ...current, title: '' }));
      setQuestions([blankQuestion()]);
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const publish = async (examId: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/teacher/exams/${examId}/publish`, { method: 'POST', language, timeoutMs: 120_000 });
      setDone(t('teacherExams.published'));
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const release = async (examId: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/teacher/exams/${examId}/release`, { method: 'POST', language, timeoutMs: 120_000 });
      setDone(t('teacherExams.released'));
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const openAttempts = async (examId: string) => {
    setAttemptsFor(examId);
    setAttempts(null);
    setMarking(null);
    try {
      const result = await api<{ attempts: AttemptRow[] }>(`/teacher/exams/${examId}/attempts`, {
        language,
      });
      setAttempts(result.attempts);
    } catch (caught) {
      setError(caught as ApiError);
    }
  };

  const openMarking = async (attemptId: string) => {
    try {
      const result = await api<{
        learner: { fullName: string };
        answers: MarkingAnswer[];
      }>(`/teacher/attempts/${attemptId}`, { language });
      setMarking({
        attemptId,
        learner: result.learner.fullName,
        answers: result.answers,
      });
      setAwards(
        Object.fromEntries(
          result.answers.map((answer) => [
            answer.answerId,
            answer.awarded === null ? '' : String(answer.awarded),
          ]),
        ),
      );
    } catch (caught) {
      setError(caught as ApiError);
    }
  };

  const saveMarks = async (releaseNow: boolean) => {
    if (!marking) return;
    const marks = marking.answers
      // Only what the teacher actually typed. An empty box is "not marked yet",
      // not zero — sending it as zero would fail a child for a blank field.
      .filter((answer) => awards[answer.answerId]?.trim() !== '' && awards[answer.answerId] !== undefined)
      .map((answer) => ({
        answerId: answer.answerId,
        awarded: Number(awards[answer.answerId]),
      }));
    if (marks.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      await api(`/teacher/attempts/${marking.attemptId}/marks`, {
        method: 'POST',
        body: { marks, release: releaseNow },
        language,
        timeoutMs: 120_000,
      });
      setDone(t('teacherExams.marked'));
      setMarking(null);
      if (attemptsFor) await openAttempts(attemptsFor);
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t('teacherNav.exams')} description={t('teacherExams.description')} />

      <ErrorAlert error={error} />
      {done && <SuccessAlert>{done}</SuccessAlert>}

      <button
        type="button"
        className="cc-btn-primary mb-4"
        onClick={() => setComposing((current) => !current)}
      >
        {composing ? t('common.cancel') : t('teacherExams.setExam')}
      </button>

      {/* Writing a paper. */}
      {composing && (
        <section className="mb-6 rounded-xl border border-ink-200 bg-white p-4">
          <h2 className="mb-3 font-display text-base font-semibold text-ink-900">
            {t('teacherExams.newExam')}
          </h2>

          {pairs.length === 0 ? (
            <p className="text-sm text-ink-600">{t('teacherGroups.noSubjects')}</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="cc-label">{t('teacherExams.examTitle')}</span>
                  <input
                    type="text"
                    className="cc-field w-full"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="cc-label">{t('timetable.classAndSubject')}</span>
                  <select
                    className="cc-field w-full"
                    value={form.pair}
                    onChange={(e) => setForm({ ...form, pair: e.target.value })}
                  >
                    {pairs.map((pair) => (
                      <option
                        key={`${pair.subject.id}:${pair.level.id}`}
                        value={`${pair.subject.id}:${pair.level.id}`}
                      >
                        {name(pair.level)} · {name(pair.subject)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="cc-label">{t('teacherExams.durationMin')}</span>
                  <input
                    type="number"
                    min={1}
                    className="cc-field w-full"
                    value={form.durationMin}
                    onChange={(e) => setForm({ ...form, durationMin: e.target.value })}
                  />
                </label>
              </div>

              {/*
               * Said before the choice is made, not after the server corrects it.
               */}
              {hasStructural && (
                <p className="mt-2 rounded-lg border border-warning-600 bg-warning-50 p-2 text-sm text-ink-900">
                  {t('teacherExams.deferredNotice')}
                </p>
              )}

              <ol className="mt-4 flex flex-col gap-3">
                {questions.map((question, index) => (
                  <li key={index} className="rounded-lg border border-ink-200 p-3">
                    <div className="grid gap-3 sm:grid-cols-[1fr_10rem_6rem]">
                      <label className="block">
                        <span className="cc-label">
                          {t('teacherExams.question', { number: index + 1 })}
                        </span>
                        <textarea
                          rows={2}
                          className="cc-field w-full"
                          value={question.prompt}
                          onChange={(e) =>
                            setQuestions(patch(questions, index, { prompt: e.target.value }))
                          }
                        />
                      </label>
                      <label className="block">
                        <span className="cc-label">{t('teacherExams.questionType')}</span>
                        <select
                          className="cc-field w-full"
                          value={question.type}
                          onChange={(e) =>
                            setQuestions(
                              patch(questions, index, {
                                type: e.target.value as TeacherQuestionType,
                              }),
                            )
                          }
                        >
                          {QUESTION_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {t(`teacherExams.type.${type}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="cc-label">{t('teacherExams.marks')}</span>
                        <input
                          type="number"
                          min={1}
                          className="cc-field w-full"
                          value={question.marks}
                          onChange={(e) =>
                            setQuestions(patch(questions, index, { marks: e.target.value }))
                          }
                        />
                      </label>
                    </div>

                    {isAutoMarkable(question.type) ? (
                      <div className="mt-2">
                        <p className="cc-label">{t('teacherExams.options')}</p>
                        {question.options.map((option, optionIndex) => (
                          <div key={optionIndex} className="mt-1 flex items-center gap-2">
                            <input
                              type="checkbox"
                              aria-label={t('teacherExams.isCorrect')}
                              checked={option.isCorrect}
                              onChange={(e) => {
                                const options = question.options.map((o, i) =>
                                  i === optionIndex
                                    ? { ...o, isCorrect: e.target.checked }
                                    : // A single-answer question has exactly one
                                      // correct option, so ticking one unticks
                                      // the rest rather than the server refusing.
                                      question.type === 'single_choice'
                                      ? { ...o, isCorrect: false }
                                      : o,
                                );
                                setQuestions(patch(questions, index, { options }));
                              }}
                            />
                            <input
                              type="text"
                              className="cc-field flex-1"
                              placeholder={t('teacherExams.optionPlaceholder', {
                                number: optionIndex + 1,
                              })}
                              value={option.label}
                              onChange={(e) => {
                                const options = question.options.map((o, i) =>
                                  i === optionIndex ? { ...o, label: e.target.value } : o,
                                );
                                setQuestions(patch(questions, index, { options }));
                              }}
                            />
                          </div>
                        ))}
                        <button
                          type="button"
                          className="mt-1 text-xs font-medium text-brand-700 underline"
                          onClick={() =>
                            setQuestions(
                              patch(questions, index, {
                                options: [...question.options, { label: '', isCorrect: false }],
                              }),
                            )
                          }
                        >
                          {t('teacherExams.addOption')}
                        </button>
                        <p className="cc-hint">{t('teacherExams.tickCorrect')}</p>
                      </div>
                    ) : (
                      <p className="cc-hint">{t('teacherExams.structuralHint')}</p>
                    )}

                    {questions.length > 1 && (
                      <button
                        type="button"
                        className="mt-2 text-xs font-medium text-danger-600 underline"
                        onClick={() => setQuestions(questions.filter((_, i) => i !== index))}
                      >
                        {t('teacherExams.removeQuestion')}
                      </button>
                    )}
                  </li>
                ))}
              </ol>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="cc-btn-secondary"
                  onClick={() => setQuestions([...questions, blankQuestion()])}
                >
                  {t('teacherExams.addQuestion')}
                </button>
                <button
                  type="button"
                  className="cc-btn-primary"
                  disabled={
                    busy ||
                    form.title.trim().length < 2 ||
                    questions.some((question) => question.prompt.trim().length === 0)
                  }
                  onClick={() => void createExam()}
                >
                  {busy ? t('common.saving') : t('teacherExams.saveDraft')}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* The papers. */}
      {exams === null ? (
        <p className="text-sm text-ink-600">{t('common.loading')}</p>
      ) : exams.length === 0 ? (
        <p className="rounded-xl border border-ink-200 bg-white p-4 text-sm text-ink-600">
          {t('teacherExams.none')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {exams.map((exam) => (
            <section key={exam.id} className="rounded-xl border border-ink-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-base font-semibold text-ink-900">
                    {exam.title}
                  </h3>
                  <p className="text-xs text-ink-600">
                    {exam.level ? `${name(exam.level)} · ` : ''}
                    {name(exam.subject)} ·{' '}
                    {t('teacherExams.questionSummary', {
                      questions: exam.questionCount,
                      marks: exam.totalMarks,
                    })}
                    {exam.structuralCount > 0
                      ? ` · ${t('teacherExams.structuralCount', { count: exam.structuralCount })}`
                      : ''}
                  </p>
                  <p className="mt-1 text-xs text-ink-600">
                    {t('teacherExams.submittedCount', { count: exam.submittedCount })}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={[
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      exam.published
                        ? 'bg-success-50 text-success-600'
                        : 'bg-ink-100 text-ink-600',
                    ].join(' ')}
                  >
                    {t(exam.published ? 'teacherExams.state.published' : 'teacherExams.state.draft')}
                  </span>
                  {!exam.published && (
                    <button
                      type="button"
                      className="cc-btn-primary"
                      disabled={busy}
                      onClick={() => void publish(exam.id)}
                    >
                      {t('teacherExams.publish')}
                    </button>
                  )}
                  {exam.submittedCount > 0 && (
                    <button
                      type="button"
                      className="cc-btn-secondary"
                      onClick={() => void openAttempts(exam.id)}
                    >
                      {t('teacherExams.mark')}
                    </button>
                  )}
                  {exam.submittedCount > 0 && !exam.resultsReleased && (
                    <button
                      type="button"
                      className="cc-btn-secondary"
                      disabled={busy}
                      onClick={() => void release(exam.id)}
                    >
                      {t('teacherExams.release')}
                    </button>
                  )}
                </div>
              </div>

              {/* The scripts. */}
              {attemptsFor === exam.id && (
                <div className="mt-3 rounded-lg border border-ink-300 p-3">
                  {attempts === null ? (
                    <p className="text-sm text-ink-600">{t('common.loading')}</p>
                  ) : attempts.length === 0 ? (
                    <p className="text-sm text-ink-600">{t('teacherExams.noAttempts')}</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {attempts.map((attempt) => (
                        <li
                          key={attempt.attemptId}
                          className="flex flex-wrap items-center gap-3 border-b border-ink-200 pb-2 last:border-0"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm text-ink-900">
                            {attempt.learner.fullName}
                          </span>
                          <span className="text-xs tabular-nums text-ink-600">
                            {attempt.score === null
                              ? '—'
                              : `${attempt.score}/${exam.totalMarks}`}
                          </span>
                          {attempt.needsMarking > 0 ? (
                            <span className="rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-medium text-warning-600">
                              {t('teacherExams.needsMarking', { count: attempt.needsMarking })}
                            </span>
                          ) : (
                            <span className="rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-medium text-success-600">
                              {t('teacherExams.fullyMarked')}
                            </span>
                          )}
                          {/*
                           * §4.3: a terminated attempt is a script to be read,
                           * never an automatic zero. Flagged so the teacher knows
                           * to look, and nothing else follows from it.
                           */}
                          {attempt.terminated && (
                            <span className="rounded-full bg-danger-50 px-2 py-0.5 text-[11px] font-medium text-danger-600">
                              {t('teacherExams.terminated')}
                            </span>
                          )}
                          <button
                            type="button"
                            className="text-xs font-medium text-brand-700 underline"
                            onClick={() => void openMarking(attempt.attemptId)}
                          >
                            {t('teacherExams.openScript')}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Marking one script. */}
      {marking && (
        <section className="mt-6 rounded-xl border border-brand-600 bg-brand-50 p-4">
          <h2 className="mb-3 font-display text-base font-semibold text-brand-700">
            {t('teacherExams.marking', { name: marking.learner })}
          </h2>

          <ol className="flex flex-col gap-3">
            {marking.answers.map((answer) => (
              <li key={answer.answerId} className="rounded-lg border border-ink-200 bg-white p-3">
                <p className="text-sm font-medium text-ink-900">{answer.question.prompt}</p>
                <p className="mt-1 text-xs text-ink-600">
                  {t('teacherExams.worth', { marks: answer.question.marks })}
                </p>

                <div className="mt-2 rounded bg-ink-100 p-2 text-sm text-ink-900">
                  {renderResponse(answer, t)}
                </div>

                <label className="mt-2 block max-w-[10rem]">
                  <span className="cc-label">{t('teacherExams.awarded')}</span>
                  <input
                    type="number"
                    min={0}
                    max={answer.question.marks}
                    className="cc-field w-full"
                    value={awards[answer.answerId] ?? ''}
                    onChange={(e) =>
                      setAwards({ ...awards, [answer.answerId]: e.target.value })
                    }
                  />
                </label>
              </li>
            ))}
          </ol>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="cc-btn-primary"
              disabled={busy}
              onClick={() => void saveMarks(false)}
            >
              {busy ? t('common.saving') : t('teacherExams.saveMarks')}
            </button>
            <button
              type="button"
              className="cc-btn-secondary"
              disabled={busy}
              onClick={() => void saveMarks(true)}
            >
              {t('teacherExams.saveAndRelease')}
            </button>
            <button type="button" className="cc-btn-secondary" onClick={() => setMarking(null)}>
              {t('common.close')}
            </button>
          </div>
        </section>
      )}
    </>
  );
}

function blankQuestion(): DraftQuestion {
  return {
    type: 'single_choice',
    prompt: '',
    marks: '1',
    // Two options to begin with, because a multiple-choice question with one is
    // not a question and the server would refuse it.
    options: [
      { label: '', isCorrect: true },
      { label: '', isCorrect: false },
    ],
  };
}

function patch(
  questions: DraftQuestion[],
  index: number,
  changes: Partial<DraftQuestion>,
): DraftQuestion[] {
  return questions.map((question, i) => (i === index ? { ...question, ...changes } : question));
}

/**
 * What the learner actually answered.
 *
 * `response` is `Json`, so the shape depends on the question: an option id or a
 * list of them for multiple choice, free text for a structural answer. Anything
 * unrecognised renders as "no answer" rather than as `[object Object]`.
 */
function renderResponse(
  answer: MarkingAnswer,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const response = answer.response;

  if (answer.question.options.length > 0) {
    const ids = Array.isArray(response)
      ? response.filter((item): item is string => typeof item === 'string')
      : typeof response === 'string'
        ? [response]
        : [];
    const chosen = answer.question.options.filter((option) => ids.includes(option.id));
    if (chosen.length === 0) return t('teacherExams.noAnswer');
    return chosen
      .map(
        (option) =>
          `${option.label} ${option.isCorrect ? t('teacherExams.correctMark') : t('teacherExams.wrongMark')}`,
      )
      .join(' · ');
  }

  if (typeof response === 'string' && response.trim().length > 0) return response;
  if (response && typeof response === 'object' && 'text' in response) {
    const text = (response as { text?: unknown }).text;
    if (typeof text === 'string' && text.trim().length > 0) return text;
  }
  return t('teacherExams.noAnswer');
}

/**
 * Closed until an Admin approves the application (FR-TVR-005).
 *
 * The gate wraps the screen rather than living inside it, so the component above
 * never renders — and therefore never fires the API calls that would 403 — while
 * the teacher is unapproved. See `TeacherGate`.
 */
export default function Page() {
  return (
    <TeacherGate titleKey="teacherNav.exams">
      <TeacherExamsPage />
    </TeacherGate>
  );
}
