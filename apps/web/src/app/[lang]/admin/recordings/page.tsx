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
type Band = 'all' | 'primary' | 'secondary' | 'sixth_form' | 'private';

const BANDS: Band[] = ['all', 'primary', 'secondary', 'sixth_form', 'private'];

export default function AdminRecordingsPage() {
  const { t, language } = useI18n();

  const [recordings, setRecordings] = useState<RecordingLibraryDto[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [removed, setRemoved] = useState<string | null>(null);
  const [band, setBand] = useState<Band>('all');
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

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (recordings ?? []).filter((recording) => {
      const matchesBand = band === 'all' || bandOf(recording) === band;
      if (!matchesBand) return false;
      if (!needle) return true;

      // Subject or teacher, which is how an operator arrives at a recording.
      const haystack = [
        recording.subject?.nameEn,
        recording.subject?.nameFr,
        recording.teacherName,
        recording.cohort?.name,
        recording.learner?.fullName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [recordings, band, search]);

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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {BANDS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={band === value}
            onClick={() => setBand(value)}
            className={[
              'min-h-touch rounded-full border px-3 text-sm',
              band === value
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-ink-300 text-ink-600',
            ].join(' ')}
          >
            {t(`adminRecordings.band.${value}`)}
          </button>
        ))}

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('adminRecordings.search')}
          className="min-h-touch w-64 rounded-lg border border-ink-300 px-3 text-sm"
        />
      </div>

      {recordings === null ? (
        <p className="text-sm text-ink-600">{t('common.loading')}</p>
      ) : shown.length === 0 ? (
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

/**
 * Which band a recording files under.
 *
 * A private lesson has a learner and no cohort, so it has no level to read a
 * school type from — it is Private by construction rather than by lookup. Anything
 * whose level did not come back is left out of the band filters rather than being
 * guessed into one, because a recording filed under the wrong band is a recording
 * an operator will not find.
 */
function bandOf(recording: RecordingLibraryDto): Band | null {
  if (recording.scope === 'one-to-one') return 'private';
  const schoolType = recording.level?.schoolType;
  if (!schoolType) return null;
  if (schoolType === 'primary') return 'primary';
  if (schoolType === 'secondary') return 'secondary';
  return 'sixth_form';
}
