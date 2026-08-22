'use client';

import { useState } from 'react';
import type { HomeworkDto, MaterialDto } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { GroupInvitations } from '@/components/student/GroupInvitations';
import { GroupTasks } from '@/components/student/GroupTasks';
import { useStudent } from '@/lib/student-context';
import { useCachedApi } from '@/lib/use-cached-api';
import { HomeworkRow, MaterialRow } from '@/components/student/cards';
import {
  EmptyState,
  ErrorState,
  PageTitle,
  SkeletonList,
} from '@/components/student/ui';

interface WorkResponse {
  toDo: HomeworkDto[];
  submitted: HomeworkDto[];
  graded: HomeworkDto[];
  materials: MaterialDto[];
}

type TabKey = 'toDo' | 'submitted' | 'graded' | 'materials';

/**
 * §5.3 — Work: two lists and a library.
 *
 * Tabs rather than four stacked sections. At a 360px reference width (UI-001)
 * four headed lists is a very long scroll, and the learner almost always wants
 * exactly one of them — usually the first.
 */
export default function StudentWork() {
  const { t, language } = useI18n();
  const { config } = useStudent();
  const [tab, setTab] = useState<TabKey>('toDo');
  const { data, loading, error, refresh } = useCachedApi<WorkResponse>('/learner/work', {
    language,
  });

  if (!config) return null;

  const tabs: TabKey[] = ['toDo', 'submitted', 'graded', 'materials'];
  const counts: Record<TabKey, number> = {
    toDo: data?.toDo.length ?? 0,
    submitted: data?.submitted.length ?? 0,
    graded: data?.graded.length ?? 0,
    materials: data?.materials.length ?? 0,
  };

  return (
    <>
      <PageTitle large={config.typeScale === 'large'}>{t('student.work.title')}</PageTitle>

      {/*
        * Above the tabs, because an invitation is a thing to answer before
        * getting on with anything else — and below one of the tabs it would sit
        * unseen behind whichever panel the learner last had open. Renders
        * nothing when there is nothing pending, so it costs no space on the
        * ordinary day.
        */}
      <GroupInvitations onJoined={() => refresh()} />

      {/*
       * A tablist, because these switch a panel in place rather than navigate.
       * Horizontally scrollable so four French labels at 360px scroll rather
       * than wrap into a three-line control (NFR-LOC-002).
       */}
      <div role="tablist" aria-label={t('student.work.title')} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map((key) => {
          const selected = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(key)}
              className={[
                'inline-flex min-h-touch shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
                'focus-visible:ring-offset-1 focus-visible:ring-offset-white',
                selected
                  ? 'bg-brand-600 text-white'
                  : 'border border-ink-300 bg-white text-ink-900 hover:bg-ink-100',
              ].join(' ')}
            >
              {t(`student.work.${key}`)}
              {counts[key] > 0 && (
                <span className="tabular-nums opacity-80">{counts[key]}</span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="space-y-3">
        {loading && <SkeletonList />}
        {error && !data && <ErrorState onRetry={() => void refresh()} />}

        {data && tab === 'materials' && (
          data.materials.length === 0 ? (
            <EmptyState
              title={t('student.work.noneMaterials')}
              body={t('student.work.noneMaterialsBody')}
            />
          ) : (
            data.materials.map((item) => <MaterialRow key={item.id} item={item} />)
          )
        )}

        {data && tab !== 'materials' && (
          data[tab].length === 0 ? (
            <EmptyState
              title={t(`student.work.none${cap(tab)}`)}
              body={t(`student.work.none${cap(tab)}Body`)}
            />
          ) : (
            data[tab].map((item) => (
              <HomeworkRow key={item.id} item={item} onSubmitted={() => refresh()} />
            ))
          )
        )}
      </div>

      {/*
        * Below the tabs, not inside one.
        *
        * Group tasks are not homework — no mark, no hand-in — so they are not a
        * fifth tab beside To do / Submitted / Graded, which would suggest the
        * same lifecycle. They sit under the panel as their own section, and
        * render nothing at all when there are none.
        */}
      <GroupTasks />
    </>
  );
}

/** `toDo` → `ToDo`, so the tab key and the message key stay one word apart. */
function cap(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}
