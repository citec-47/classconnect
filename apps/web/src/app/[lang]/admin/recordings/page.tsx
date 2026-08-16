'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecordingLibraryDto } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api';
import { PageHeader, StateChip } from '@/components/admin/ui';
import { ErrorAlert, SuccessAlert } from '@/components/Alert';
import { RecordingPlayer } from '@/components/RecordingPlayer';

/**
 * Every recording on the platform.
 *
 * ## Why the admin list is unfiltered
 *
 * Safeguarding review is the reason the recordings exist at all (FR-SAF-004/007),
 * and a review that can only see part of the archive is not one. So this is the
 * single place where `recordings.service.ts` applies no entitlement filter — and
 * the permission that opens it, `recording:delete`, is held by the admin alone.
 * Customer service holds `live:watch` and does not appear here.
 *
 * ## Filed by band, subject and teacher
 *
 * The brief's arrangement: "displayed based on the categories (primary,
 * secondary, lower sixth and upper sixth, private classes) based on their
 * subjects and teachers' names". The band comes from the level behind the cohort,
 * so a private lesson — which has a learner and no cohort — files under Private
 * rather than being lost.
 *
 * ## Deleting
 *
 * The only delete control in the product, and it is here rather than on the
 * teacher's screen deliberately: a recording of a class containing children is
 * safeguarding evidence, and the person most motivated to remove it is exactly
 * who must not be able to. A legal hold outranks even this (§5.5).
 */
/**
 * The four shelves of the library, in the order the brief lists them.
 *
 * `other` is deliberately not here. A group session and an invited call have no
 * class and no subject enrolment behind them, so they cannot be reached by
 * choosing a class and a subject — they get their own section below the tree
 * rather than a category that would lie about what they are.
 */
const CATEGORIES = ['primary', 'secondary', 'sixth_form', 'private'] as const;
type Category = (typeof CATEGORIES)[number];

export default function AdminRecordingsPage() {
  const { t, language } = useI18n();

  const [recordings, setRecordings] = useState<RecordingLibraryDto[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [removed, setRemoved] = useState<string | null>(null);
  /*
   * Where the admin is in the tree. Three pieces of state rather than one
   * cursor, because each step is independently reversible: tapping the class in
   * the breadcrumb should drop the subject and keep the category.
   */
  const [category, setCategory] = useState<Category | null>(null);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  /** The section for group and invited recordings, which sits outside the tree. */
  const [showingOther, setShowingOther] = useState(false);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api<{ recordings: RecordingLibraryDto[] }>('/admin/recordings', { language });
      setRecordings(result.recordings);
    } catch (caught) {
      setError(caught as ApiError);
      setRecordings([]);
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  /**
   * Search runs across the whole library, not the current branch.
   *
   * An operator searching "Chemistry" or a teacher's name is looking for a
   * lesson, not for a lesson inside the class they happen to have opened — and
   * a search that silently excluded four fifths of the archive would be worse
   * than no search at all. A hit therefore shows its class and category on the
   * card, so the result is still locatable afterwards.
   */
  const searching = search.trim().length > 0;

  /** The classes that exist in this category, newest-first by nothing: name order. */
  const classesIn = useMemo(() => {
    const map = new Map<string, { id: string; nameEn: string; nameFr: string; count: number }>();
    for (const recording of recordings ?? []) {
      if (recording.category !== category || !recording.level) continue;
      const seen = map.get(recording.level.id);
      if (seen) seen.count += 1;
      else map.set(recording.level.id, { ...recording.level, count: 1 });
    }
    return [...map.values()].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
  }, [recordings, category]);

  /**
   * The subjects recorded in the open class.
   *
   * Derived from the recordings rather than from the curriculum: a subject with
   * nothing recorded opens onto an empty list, and offering it would promise
   * something the library does not have.
   */
  const subjectsIn = useMemo(() => {
    const map = new Map<string, { id: string; nameEn: string; nameFr: string; count: number }>();
    for (const recording of recordings ?? []) {
      if (recording.category !== category || recording.level?.id !== levelId) continue;
      if (!recording.subject) continue;
      const seen = map.get(recording.subject.id);
      if (seen) seen.count += 1;
      else map.set(recording.subject.id, { ...recording.subject, count: 1 });
    }
    return [...map.values()].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
  }, [recordings, category, levelId]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (recordings ?? []).filter((recording) => {
      if (!needle) {
        /* Not searching: show only what the current branch selects. */
        if (showingOther) return recording.category === 'other';
        if (!category || !levelId || !subjectId) return false;
        if (recording.category !== category) return false;
        if (recording.level?.id !== levelId) return false;
        if (recording.subject?.id !== subjectId) return false;
        return true;
      }

      /*
       * Subject, teacher or date — the three things an operator remembers about
       * a lesson they are trying to find. The date is included as the rendered
       * day so that "15 August" matches what the card shows rather than the ISO
       * string underneath it.
       */
      const haystack = [
        recording.subject?.nameEn,
        recording.subject?.nameFr,
        recording.teacherName,
        recording.cohort?.name,
        recording.learner?.fullName,
        recording.level?.nameEn,
        recording.level?.nameFr,
        new Date(recording.startedAt).toLocaleDateString(language === 'fr' ? 'fr-CM' : 'en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        recording.startedAt.slice(0, 10),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [recordings, category, levelId, subjectId, showingOther, search, language]);

  const remove = async (recording: RecordingLibraryDto) => {
    /*
     * Confirmed, because it is irreversible and the object goes with the row.
     * The prompt names the lesson rather than saying "this recording" — a
     * mis-click on the wrong card is the failure mode worth spending a sentence
     * on.
     */
    const label = recording.subject ? name(recording.subject) : t('common.none');
    if (!window.confirm(t('adminRecordings.confirmDelete', { subject: label }))) return;

    setBusyId(recording.id);
    setError(null);
    setRemoved(null);
    try {
      await api(`/admin/recordings/${recording.id}`, {
        method: 'DELETE',
        language,
        timeoutMs: 120_000,
      });
      setRemoved(t('adminRecordings.deleted', { subject: label }));
      await load();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title={t('adminNav.recordings')}
        description={t('adminRecordings.description')}
      />

      <ErrorAlert error={error} />
      {removed && <SuccessAlert>{removed}</SuccessAlert>}

      {/*
        * The trail back out.
        *
        * Each step is a button rather than the whole path being one "back",
        * because an operator comparing two subjects in the same class moves
        * sideways far more often than they start again.
        */}
      {(category || showingOther) && !searching && (
        <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm" aria-label={t('adminRecordings.breadcrumb')}>
          <button
            type="button"
            className="min-h-touch rounded-lg px-2 text-brand-700 underline"
            onClick={() => {
              setCategory(null);
              setLevelId(null);
              setSubjectId(null);
              setShowingOther(false);
            }}
          >
            {t('adminNav.recordings')}
          </button>
          {category && (
            <>
              <span aria-hidden className="text-ink-400">/</span>
              <button
                type="button"
                className="min-h-touch rounded-lg px-2 text-brand-700 underline"
                onClick={() => {
                  setLevelId(null);
                  setSubjectId(null);
                }}
              >
                {t(`adminRecordings.band.${category}`)}
              </button>
            </>
          )}
          {levelId && (
            <>
              <span aria-hidden className="text-ink-400">/</span>
              <button
                type="button"
                className="min-h-touch rounded-lg px-2 text-brand-700 underline"
                onClick={() => setSubjectId(null)}
              >
                {classesIn.find((c) => c.id === levelId)?.nameEn ?? ''}
              </button>
            </>
          )}
          {subjectId && (
            <>
              <span aria-hidden className="text-ink-400">/</span>
              <span className="px-2 text-ink-700">
                {subjectsIn.find((s) => s.id === subjectId)?.nameEn ?? ''}
              </span>
            </>
          )}
          {showingOther && (
            <>
              <span aria-hidden className="text-ink-400">/</span>
              <span className="px-2 text-ink-700">{t('adminRecordings.otherSection')}</span>
            </>
          )}
        </nav>
      )}

      {/* Step one: the four categories, plus the section that is not a category. */}
      {!category && !showingOther && !searching && (
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((value) => {
            const count = (recordings ?? []).filter((r) => r.category === value).length;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className="min-h-touch rounded-lg border border-ink-300 p-3 text-left hover:border-brand-600"
              >
                <span className="block text-sm font-medium text-ink-900">
                  {t(`adminRecordings.band.${value}`)}
                </span>
                <span className="text-xs text-ink-600">
                  {t('adminRecordings.lessonCount', { count: String(count) })}
                </span>
              </button>
            );
          })}
          {/*
            * Group and invited recordings, kept out of the tree.
            *
            * Shown as a peer of the categories rather than hidden below them:
            * they are a real part of the archive, and an admin looking for a
            * call they know happened should not have to guess which class it
            * was filed under. It was filed under none.
            */}
          <button
            type="button"
            onClick={() => setShowingOther(true)}
            className="min-h-touch rounded-lg border border-dashed border-ink-300 p-3 text-left hover:border-brand-600 sm:col-span-2 lg:col-span-4"
          >
            <span className="block text-sm font-medium text-ink-900">
              {t('adminRecordings.otherSection')}
            </span>
            <span className="text-xs text-ink-600">
              {t('adminRecordings.otherHint', {
                count: String((recordings ?? []).filter((r) => r.category === 'other').length),
              })}
            </span>
          </button>
        </div>
      )}

      {/* Step two: the classes inside the chosen category. */}
      {category && !levelId && !searching && (
        <div className="mb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {classesIn.map((level) => (
            <button
              key={level.id}
              type="button"
              onClick={() => setLevelId(level.id)}
              className="min-h-touch rounded-lg border border-ink-300 p-3 text-left hover:border-brand-600"
            >
              <span className="block text-sm font-medium text-ink-900">{name(level)}</span>
              <span className="text-xs text-ink-600">
                {t('adminRecordings.lessonCount', { count: String(level.count) })}
              </span>
            </button>
          ))}
          {classesIn.length === 0 && (
            <p className="text-sm text-ink-600 sm:col-span-3 lg:col-span-6">
              {t('adminRecordings.emptyCategory')}
            </p>
          )}
        </div>
      )}

      {/* Step three: the subjects recorded in that class. */}
      {category && levelId && !subjectId && !searching && (
        <div className="mb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {subjectsIn.map((subject) => (
            <button
              key={subject.id}
              type="button"
              onClick={() => setSubjectId(subject.id)}
              className="min-h-touch rounded-lg border border-ink-300 p-3 text-left hover:border-brand-600"
            >
              <span className="block text-sm font-medium text-ink-900">{name(subject)}</span>
              <span className="text-xs text-ink-600">
                {t('adminRecordings.lessonCount', { count: String(subject.count) })}
              </span>
            </button>
          ))}
          {subjectsIn.length === 0 && (
            <p className="text-sm text-ink-600 sm:col-span-3 lg:col-span-4">
              {t('adminRecordings.emptyClass')}
            </p>
          )}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('adminRecordings.search')}
          className="min-h-touch w-64 rounded-lg border border-ink-300 px-3 text-sm"
        />
      </div>

      {/*
        * The list appears once a branch is open, or while searching.
        *
        * Without this the top of the tree renders "No recordings match this
        * filter" underneath the category tiles — which is true of the empty
        * selection and reads as an empty archive. Nothing has been asked for
        * yet, so nothing is the right thing to show.
        */}
      {recordings === null ? (
        <p className="text-sm text-ink-600">{t('common.loading')}</p>
      ) : !searching && !showingOther && !subjectId ? null : shown.length === 0 ? (
        <p className="rounded-xl border border-ink-200 bg-white p-4 text-sm text-ink-600">
          {t('adminRecordings.none')}
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-ink-600">
            {t('adminRecordings.showing', { shown: shown.length, total: recordings.length })}
          </p>

          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((recording) => (
              <li key={recording.id} className="rounded-xl border border-ink-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {recording.subject ? name(recording.subject) : t('common.none')}
                    </p>
                    <p className="truncate text-xs text-ink-600">
                      {recording.teacherName ?? t('common.none')}
                    </p>
                    <p className="truncate text-xs text-ink-600">
                      {recording.cohort?.name ?? recording.learner?.fullName ?? '—'}
                      {recording.level ? ` · ${name(recording.level)}` : ''}
                    </p>
                  </div>
                  <StateChip tone={recording.state === 'ready' ? 'good' : 'warn'}>
                    {t(`recordings.scope.${recording.scope}`)}
                  </StateChip>
                </div>

                <p className="mt-1 text-xs tabular-nums text-ink-600">
                  {new Date(recording.startedAt).toLocaleString(language)} ·{' '}
                  {Math.max(1, Math.round(recording.durationSec / 60))} min
                </p>

                <RecordingPlayer
                  endpoint="admin"
                  recordingId={recording.id}
                  state={recording.state}
                  audioAvailable={recording.audioAvailable}
                  audioSizeBytes={recording.audioSizeBytes}
                  sizeBytes={recording.sizeBytes}
                />

                {/*
                 * §5.5: a safeguarding or dispute hold outranks an admin's delete,
                 * so the control is replaced by the reason rather than being shown
                 * and then refused by the API.
                 */}
                {recording.legalHold ? (
                  <p className="mt-2 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-600">
                    {t('adminRecordings.legalHold')}
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === recording.id}
                    onClick={() => void remove(recording)}
                    className="mt-2 text-xs font-medium text-danger-600 underline disabled:opacity-60"
                  >
                    {busyId === recording.id
                      ? t('common.loading')
                      : t('adminRecordings.delete')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/*
 * The band is no longer worked out here.
 *
 * It used to be derived in the browser from the scope and the level, which meant
 * this screen and the API could disagree about where a lesson belonged — and the
 * one that decides what an operator can find is the one that must be right. The
 * server now sends `category` with every row, computed from the same facts that
 * decide the scope, so there is a single answer rather than two that agree until
 * they do not.
 */
