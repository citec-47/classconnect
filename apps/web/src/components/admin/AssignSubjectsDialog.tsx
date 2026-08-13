'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { schoolTypeLabelKey } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api, type ApiError } from '@/lib/api';
import { ErrorAlert } from '@/components/Alert';

interface CatalogueSubject {
  id: string;
  code: string;
  nameEn: string;
  nameFr: string;
}

interface CatalogueLevel {
  id: string;
  code: string;
  nameEn: string;
  nameFr: string;
  subjects: CatalogueSubject[];
}

/** The teacher endpoint returns pairings; the learner endpoint returns one level. */
interface Catalogue {
  teacherName?: string;
  learnerName?: string;
  categories: Record<string, CatalogueLevel[]>;
  assigned?: { levelId: string; subjectId: string }[];
  offering?: string[];
  currentLevelId?: string | null;
}

/**
 * Category → class → subjects, for a teacher or for a learner.
 *
 * One component for both because the decision has the same shape and the APIs
 * were built to return the same catalogue. What differs is only how many
 * classes may be chosen, and that is the `mode` below:
 *
 *   `teacher`  many classes, many subjects in each — Biology in Form One,
 *              Form Four and Form Five is one ordinary week.
 *   `learner`  exactly one class, and the subjects offered inside it. A child
 *              is in one class, and their timetable is derived from it.
 *
 * The catalogue is fetched when the dialog opens rather than with the roster:
 * every active level with all of its subjects is a large payload, and a roster
 * of forty teachers would carry forty copies of it for a dialog that is opened
 * once.
 */
export function AssignSubjectsDialog({
  mode,
  subjectId,
  onClose,
  onSaved,
}: {
  mode: 'teacher' | 'learner';
  /** The teacher's user id, or the learner's id. */
  subjectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, language } = useI18n();

  const base =
    mode === 'teacher'
      ? `/admin/people/teachers/${subjectId}`
      : `/admin/people/students/${subjectId}`;

  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [openLevelId, setOpenLevelId] = useState<string | null>(null);

  /*
   * `levelId:subjectId` in one set.
   *
   * A teacher's assignment is a pair, not a subject — the same Biology in three
   * classes is three separate grants, and a set of subject ids alone could not
   * tell them apart.
   */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [learnerLevelId, setLearnerLevelId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api<Catalogue>(`${base}/assignable`, { language });
      setCatalogue(data);

      if (mode === 'teacher') {
        setPicked(new Set((data.assigned ?? []).map((a) => `${a.levelId}:${a.subjectId}`)));
      } else {
        const level = data.currentLevelId ?? null;
        setLearnerLevelId(level);
        setPicked(new Set((data.offering ?? []).map((id) => `${level}:${id}`)));
        if (level) setOpenLevelId(level);
      }

      // Open the category the person is already in, so the dialog starts where
      // the answer probably is rather than fully collapsed.
      const current =
        mode === 'learner'
          ? data.currentLevelId
          : (data.assigned ?? [])[0]?.levelId;
      if (current) {
        const found = Object.entries(data.categories).find(([, levels]) =>
          levels.some((level) => level.id === current),
        );
        if (found) setOpenCategory(found[0]);
      }
    } catch (caught) {
      setError(caught as ApiError);
    }
  }, [base, language, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  const toggle = (levelId: string, subject: string) => {
    const key = `${levelId}:${subject}`;
    setPicked((current) => {
      const next = new Set(current);

      /*
       * A learner belongs to one class.
       *
       * Ticking a subject in a different class replaces the selection outright
       * rather than adding to it — the alternative is a learner apparently in
       * two classes, which the API would reject and which nothing on screen
       * would explain.
       */
      if (mode === 'learner' && learnerLevelId && learnerLevelId !== levelId) {
        next.clear();
        setLearnerLevelId(levelId);
      } else if (mode === 'learner') {
        setLearnerLevelId(levelId);
      }

      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const chosen = useMemo(
    () =>
      [...picked].map((key) => {
        const [levelId, subject] = key.split(':');
        return { levelId, subjectId: subject };
      }),
    [picked],
  );

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'teacher') {
        await api(`${base}/subjects`, {
          method: 'POST',
          body: { assignments: chosen },
          language,
          timeoutMs: 120_000,
        });
      } else {
        await api(`${base}/class`, {
          method: 'POST',
          body: {
            levelId: learnerLevelId,
            subjectIds: chosen.map((pair) => pair.subjectId),
          },
          language,
          timeoutMs: 120_000,
        });
      }
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught as ApiError);
      setBusy(false);
    }
  };

  const who = catalogue?.teacherName ?? catalogue?.learnerName ?? '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(mode === 'teacher' ? 'assign.teacherTitle' : 'assign.learnerTitle')}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-4"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="border-b border-ink-200 px-4 py-3">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            {t(mode === 'teacher' ? 'assign.teacherTitle' : 'assign.learnerTitle')}
          </h2>
          <p className="text-sm text-ink-600">{who}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <ErrorAlert error={error} />

          {!catalogue ? (
            <div className="h-40 animate-pulse rounded-lg bg-ink-100" />
          ) : (
            <>
              <p className="mb-3 text-sm text-ink-600">
                {t(mode === 'teacher' ? 'assign.teacherHint' : 'assign.learnerHint')}
              </p>

              {Object.entries(catalogue.categories).map(([category, levels]) => (
                <div key={category} className="mb-2 rounded-lg border border-ink-200">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenCategory((current) => (current === category ? null : category))
                    }
                    className="flex min-h-touch w-full items-center justify-between px-3 text-left text-sm font-medium text-ink-900"
                    aria-expanded={openCategory === category}
                  >
                    {t(schoolTypeLabelKey(category as never))}
                    <span className="text-ink-600">{openCategory === category ? '−' : '+'}</span>
                  </button>

                  {openCategory === category && (
                    <div className="border-t border-ink-200 px-3 py-2">
                      {levels.map((level) => {
                        const countHere = [...picked].filter((key) =>
                          key.startsWith(`${level.id}:`),
                        ).length;

                        return (
                          <div key={level.id} className="mb-1">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenLevelId((current) =>
                                  current === level.id ? null : level.id,
                                )
                              }
                              className="flex min-h-touch w-full items-center justify-between text-left text-sm text-ink-900"
                              aria-expanded={openLevelId === level.id}
                            >
                              <span>{name(level)}</span>
                              {countHere > 0 && (
                                <span className="cc-badge bg-brand-50 text-brand-700">
                                  {countHere}
                                </span>
                              )}
                            </button>

                            {openLevelId === level.id && (
                              <ul className="mb-2 ml-2 mt-1 flex flex-col gap-1 border-l border-ink-200 pl-3">
                                {level.subjects.length === 0 && (
                                  <li className="text-xs text-ink-600">
                                    {t('assign.noSubjects')}
                                  </li>
                                )}
                                {level.subjects.map((subject) => {
                                  const key = `${level.id}:${subject.id}`;
                                  return (
                                    <li key={subject.id}>
                                      <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm">
                                        <input
                                          type="checkbox"
                                          checked={picked.has(key)}
                                          onChange={() => toggle(level.id, subject.id)}
                                          className="h-4 w-4"
                                        />
                                        <span>{name(subject)}</span>
                                      </label>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-ink-200 px-4 py-3">
          <p className="text-sm text-ink-600">
            {t('assign.selectedCount', { count: picked.size })}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="cc-btn-secondary">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              /*
               * A learner must end with a class and at least one subject; a
               * teacher may legitimately be left with none, which is how an
               * assignment is withdrawn.
               */
              disabled={busy || (mode === 'learner' && (!learnerLevelId || picked.size === 0))}
              className="cc-btn-primary"
            >
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
