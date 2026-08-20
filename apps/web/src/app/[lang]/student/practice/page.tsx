'use client';

import { notFound, useRouter } from 'next/navigation';
import { useState } from 'react';
import { tabEnabled, type PracticeItemDto } from '@classconnect/shared';
import { useI18n } from '@/lib/i18n';
import { useStudent } from '@/lib/student-context';
import { useCachedApi } from '@/lib/use-cached-api';
import { api } from '@/lib/api';
import { PracticeRow } from '@/components/student/cards';
import { PageTitle, ScreenState, SectionHeading } from '@/components/student/ui';

interface PracticeResponse {
  quizzes: PracticeItemDto[];
  mocks: PracticeItemDto[];
  pastPapers: PracticeItemDto[];
}

interface StudyGroup {
  id: string;
  name: string;
  threadId: string;
  ownerUserId: string;
  canManage: boolean;
  locked: boolean;
  maxMembers: number;
  members: { userId: string; fullName: string; isAdmin: boolean; mayPost: boolean; allowImages: boolean; allowVideos: boolean; allowVoice: boolean; allowDocuments: boolean }[];
}

/**
 * §5.4 — Practice. Hidden at Primary level.
 *
 * Hidden means gone, not greyed out: a Primary learner who reaches this URL from
 * a shared link or a stale bookmark gets a 404, the same answer the tab set
 * gives. The endpoint behind it 404s too (FR-RBA-002) — hiding the tab and
 * serving the screen anyway would make the four-tab rule a decoration.
 */
export default function StudentPractice() {
  const { t, language } = useI18n();
  const { config } = useStudent();
  const { data, loading, error, refresh } = useCachedApi<PracticeResponse>('/learner/practice', {
    language,
  });

  if (!config) return null;
  if (!tabEnabled(config, 'practice')) notFound();

  const sections = [
    { key: 'quizzes', items: data?.quizzes ?? [] },
    { key: 'mocks', items: data?.mocks ?? [] },
    // §3: the GCE library is Form 5, sixth form and adult only.
    ...(config.showPastPapers
      ? [{ key: 'pastPapers', items: data?.pastPapers ?? [] }]
      : []),
  ];

  const total = sections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <>
      <PageTitle large={config.typeScale === 'large'}>{t('student.practice.title')}</PageTitle>

      <ScreenState
        loading={loading}
        error={error}
        isEmpty={total === 0}
        emptyTitle={t('student.practice.none')}
        emptyBody={t('student.practice.noneBody')}
        onRetry={() => void refresh()}
      >
        {sections
          .filter((section) => section.items.length > 0)
          .map((section) => (
            <section key={section.key} className="space-y-2">
              <SectionHeading count={section.items.length}>
                {t(`student.practice.${section.key}`)}
              </SectionHeading>
              {section.items.map((item) => (
                <PracticeRow key={item.id} item={item} />
              ))}
            </section>
          ))}
      </ScreenState>

      <StudyGroups language={language} />

      {/*
       * §9: a timed assessment is never available offline, and says so before
       * the learner starts one rather than breaking halfway through. The runner
       * enforces it; this sets the expectation.
       */}
      <p className="mt-6 rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-600">
        {t('student.practice.needsConnectionBody')}
      </p>
    </>
  );
}

function StudyGroups({ language }: { language: 'en' | 'fr' }) {
  const { t } = useI18n();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const { data, refresh } = useCachedApi<{ groups: StudyGroup[] }>('/learner/practice/study-groups', { language });
  const { data: candidates } = useCachedApi<{ classmates: { userId: string; fullName: string }[] }>('/learner/practice/study-groups/candidates', { language });

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await api('/learner/practice/study-groups', { method: 'POST', body: { name, memberUserIds: selected }, language });
      setName('');
      setSelected([]);
      void refresh();
    } finally { setCreating(false); }
  }

  async function leave(id: string) {
    await api(`/learner/practice/study-groups/${id}/leave`, { method: 'POST', language });
    void refresh();
  }

  async function remove(id: string) {
    await api(`/learner/practice/study-groups/${id}`, { method: 'DELETE', language });
    void refresh();
  }

  async function setLocked(id: string, locked: boolean) {
    await api(`/learner/practice/study-groups/${id}/lock`, { method: 'POST', body: { locked }, language });
    void refresh();
  }

  async function addMembers(id: string) {
    if (!selected.length) return;
    await api(`/learner/practice/study-groups/${id}/members`, { method: 'POST', body: { memberUserIds: selected }, language });
    setSelected([]);
    void refresh();
  }

  async function removeMember(groupId: string, userId: string) {
    await api(`/learner/practice/study-groups/${groupId}/members/${userId}`, { method: 'DELETE', language });
    void refresh();
  }

  async function setPosting(groupId: string, userId: string, mayPost: boolean) {
    await api(`/learner/practice/study-groups/${groupId}/members/${userId}/permission`, { method: 'POST', body: { mayPost }, language });
    void refresh();
  }

  async function setMediaPermission(groupId: string, userId: string, field: 'allowImages' | 'allowVideos' | 'allowVoice' | 'allowDocuments', allowed: boolean) {
    await api(`/learner/practice/study-groups/${groupId}/members/${userId}/permission`, { method: 'POST', body: { [field]: allowed }, language });
    void refresh();
  }

  return (
    <section className="mt-8 space-y-3 border-t border-ink-300 pt-6">
      <div>
        <SectionHeading>{t('student.practice.studyGroups')}</SectionHeading>
        <p className="text-sm text-ink-600">{t('student.practice.studyGroupsBody')}</p>
      </div>
      <div className="rounded-xl border border-ink-300 bg-white p-3 space-y-3">
        <label className="block text-sm font-medium text-ink-900">
          {t('student.practice.groupName')}
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className="mt-1 min-h-touch w-full rounded-lg border border-ink-300 px-3" />
        </label>
        <fieldset className="space-y-1"><legend className="text-sm font-medium text-ink-900">{t('student.practice.chooseClassmates')}</legend>
          {(candidates?.classmates ?? []).map((mate) => <label key={mate.userId} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(mate.userId)} onChange={() => setSelected((ids) => ids.includes(mate.userId) ? ids.filter((id) => id !== mate.userId) : ids.length < 9 ? [...ids, mate.userId] : ids)} />{mate.fullName}</label>)}
        </fieldset>
        <button type="button" disabled={creating || !name.trim()} onClick={() => void create()} className="min-h-touch rounded-lg bg-brand-600 px-4 text-sm font-medium text-white disabled:opacity-50">{creating ? t('student.practice.creatingGroup') : t('student.practice.createGroup')}</button>
      </div>
      {data?.groups.length ? data.groups.map((group) => <article key={group.id} className="rounded-xl border border-ink-300 bg-white p-3"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-ink-900">{group.name}</h3><p className="text-sm text-ink-600">{t('student.practice.groupMembers', { count: group.members.length })}{group.locked ? ` · ${t('student.practice.lockedGroup')}` : ''}</p></div><div className="flex gap-2"><button type="button" onClick={() => router.push(`/${language}/student/messages?thread=${group.threadId}`)} className="min-h-touch rounded-lg border border-ink-300 px-3 text-sm">{t('student.practice.openGroup')}</button><button type="button" onClick={() => void (group.canManage ? remove(group.id) : leave(group.id))} className="min-h-touch rounded-lg px-3 text-sm text-danger-600">{t(group.canManage ? 'student.practice.deleteGroup' : 'student.practice.leaveGroup')}</button></div></div>{group.canManage && <div className="mt-3 space-y-2 border-t border-ink-200 pt-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void setLocked(group.id, !group.locked)} className="min-h-touch rounded-lg border border-ink-300 px-3 text-sm">{t(group.locked ? 'student.practice.unlockGroup' : 'student.practice.lockGroup')}</button><button type="button" disabled={!selected.length || group.members.length >= group.maxMembers} onClick={() => void addMembers(group.id)} className="min-h-touch rounded-lg border border-ink-300 px-3 text-sm disabled:opacity-50">{t('student.practice.addMembers')}</button></div><ul className="space-y-2">{group.members.map((member) => <li key={member.userId} className="text-sm"><div className="flex items-center justify-between gap-2"><span>{member.fullName}{member.isAdmin ? ' · admin' : ''}</span>{!member.isAdmin && <span className="flex gap-1"><button type="button" onClick={() => void setPosting(group.id, member.userId, !member.mayPost)} className="rounded px-2 py-1 text-brand-700">{t(member.mayPost ? 'student.practice.stopPosting' : 'student.practice.allowPosting')}</button><button type="button" onClick={() => void removeMember(group.id, member.userId)} className="rounded px-2 py-1 text-danger-600">{t('student.practice.removeMember')}</button></span>}</div>{!member.isAdmin && <div className="mt-1 flex flex-wrap gap-1">{([{ field: 'allowImages', key: 'images' }, { field: 'allowVideos', key: 'videos' }, { field: 'allowVoice', key: 'voice' }, { field: 'allowDocuments', key: 'documents' }] as const).map(({ field, key }) => <button key={field} type="button" aria-pressed={member[field]} onClick={() => void setMediaPermission(group.id, member.userId, field, !member[field])} className={member[field] ? 'rounded bg-brand-100 px-2 py-1 text-brand-800' : 'rounded bg-ink-100 px-2 py-1 text-ink-600'}>{t(`student.practice.${key}`)}</button>)}</div>}</li>)}</ul></div>}</article>) : <p className="text-sm text-ink-600">{t('student.practice.noStudyGroups')}</p>}
    </section>
  );
}
