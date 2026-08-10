'use client';

import type { ProgressDto } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useStudent } from '@/lib/student-context';
import { useCachedApi } from '@/lib/use-cached-api';
import { StatTile } from '@/components/student/cards';
import {
  Card,
  ErrorState,
  Meter,
  PageTitle,
  Pill,
  ScreenState,
  SectionHeading,
} from '@/components/student/ui';

/**
 * §5.5 — Progress.
 *
 * The readiness section renders only where the level enables it, and its
 * disclaimer is part of the section rather than a footnote: FR-GCE-004 requires
 * it presented as an estimate of preparation and never as a prediction of an
 * official examination outcome, and a disclaimer a screen away from the number
 * it qualifies is not attached to it in any sense that matters.
 */
export default function StudentProgress() {
  const { t, language } = useI18n();
  const { config } = useStudent();
  const { data, loading, error, refresh } = useCachedApi<ProgressDto>('/learner/progress', {
    language,
  });

  if (!config) return null;

  const nothingYet =
    data !== null &&
    data.attendance.scheduled === 0 &&
    data.homework.issued === 0 &&
    data.scores.length === 0;

  return (
    <>
      <PageTitle large={config.typeScale === 'large'}>{t('student.progress.title')}</PageTitle>

      <ScreenState
        loading={loading}
        error={error}
        isEmpty={nothingYet}
        emptyTitle={t('student.progress.none')}
        emptyBody={t('student.progress.noneBody')}
        onRetry={() => void refresh()}
      >
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                label={t('student.progress.attendance')}
                value={t('student.unit.percent', { value: data.attendance.percentage })}
                sub={t('student.unit.outOf', {
                  value: data.attendance.attended,
                  total: data.attendance.scheduled,
                })}
              />
              <StatTile
                label={t('student.progress.homework')}
                value={t('student.unit.percent', { value: data.homework.onTimePercentage })}
                sub={t('student.progress.onTime')}
              />
            </div>

            {/*
             * FR-GCE-004. The figure, then immediately what moves it, then the
             * sentence that says what it is not. In that order, because a
             * learner reads down and the qualification has to arrive before
             * they have formed a conclusion.
             */}
            {data.readiness && data.readiness.length > 0 && (
              <Card title={t('student.readiness.title')}>
                {data.readiness.map((entry, index) => (
                  <div key={index} className="space-y-3">
                    <p className="text-3xl font-semibold tabular-nums text-ink-900">
                      {t('student.unit.percent', { value: entry.percentage })}
                    </p>
                    <div>
                      <p className="mb-2 text-sm font-medium text-ink-900">
                        {t('student.readiness.explain')}
                      </p>
                      <div className="space-y-2.5">
                        {entry.drivers.map((driver) => (
                          <Meter
                            key={driver.key}
                            label={t(`student.readinessDriver.${driver.key}`)}
                            percentage={driver.value}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                {/* NEEDS_HUMAN_COPY (Q2) — see the resource files. */}
                <p className="mt-4 rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-600">
                  {t('student.readiness.estimateOnly')}
                </p>
              </Card>
            )}

            {data.weaknesses.length > 0 && (
              <Card title={t('student.progress.weaknesses')}>
                <div className="space-y-3">
                  {data.weaknesses.map((topic) => (
                    <Meter
                      key={`${topic.subject}-${topic.topic}`}
                      label={`${topic.topic} · ${topic.subject}`}
                      percentage={topic.percentage}
                    />
                  ))}
                </div>
              </Card>
            )}

            {data.strengths.length > 0 && (
              <Card title={t('student.progress.strengths')}>
                <div className="space-y-3">
                  {data.strengths.map((topic) => (
                    <Meter
                      key={`${topic.subject}-${topic.topic}`}
                      label={`${topic.topic} · ${topic.subject}`}
                      percentage={topic.percentage}
                    />
                  ))}
                </div>
              </Card>
            )}

            {data.scores.length > 0 && (
              <section className="space-y-2">
                <SectionHeading count={data.scores.length}>
                  {t('student.progress.scores')}
                </SectionHeading>
                <div className="divide-y divide-ink-300 rounded-xl border border-ink-300 bg-white">
                  {data.scores.map((score, index) => (
                    <div key={index} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-900">
                          {score.subject}
                        </p>
                        <p className="text-xs text-ink-600">
                          {new Date(score.at).toLocaleDateString(language)}
                        </p>
                      </div>
                      <Pill tone={score.percentage >= 50 ? 'success' : 'danger'}>
                        {t('student.unit.percent', { value: Math.round(score.percentage) })}
                      </Pill>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* FR-RPT-001. FR-SAF-001: a name, never a way to reach them. */}
            {data.teacherComments.length > 0 && (
              <section className="space-y-2">
                <SectionHeading>{t('student.progress.teacherComments')}</SectionHeading>
                {data.teacherComments.map((comment, index) => (
                  <article key={index} className="rounded-xl border border-ink-300 bg-white p-3.5">
                    <p className="text-sm text-ink-900">{comment.comment}</p>
                    <p className="mt-1.5 text-xs text-ink-600">
                      {comment.teacher.displayName} · {comment.subject.name}
                    </p>
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </ScreenState>

      {error && data && (
        <div className="mt-4">
          <ErrorState onRetry={() => void refresh()} />
        </div>
      )}
    </>
  );
}
