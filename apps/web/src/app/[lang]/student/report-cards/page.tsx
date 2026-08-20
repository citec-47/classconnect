'use client';

import { useI18n } from '@/lib/i18n';
import { useCachedApi } from '@/lib/use-cached-api';
import { EmptyState, ErrorState, PageTitle, SkeletonList } from '@/components/student/ui';

interface ReportCard {
  id: string; term: string; academicYear: string; average: number | null;
  position: number | null; classSize: number | null; remarkKey: string | null;
  lines: { subject: string; mark: number; coefficient: number; comment: string | null }[];
}

export default function StudentReportCards() {
  const { t, language } = useI18n();
  const { data, loading, error, refresh } = useCachedApi<{ cards: ReportCard[] }>('/learner/report-cards', { language });
  return <><PageTitle large={false}>{t('student.reportCards.title')}</PageTitle>{loading && <SkeletonList />}{error && <ErrorState onRetry={() => void refresh()} />}{data?.cards.length === 0 && <EmptyState title={t('student.reportCards.none')} body={t('student.reportCards.noneBody')} />}<div className="space-y-4">{data?.cards.map((card) => <article key={card.id} className="rounded-xl border border-ink-300 bg-white p-4"><h2 className="font-semibold text-ink-900">{t(`student.reportCards.${card.term}`)} · {card.academicYear}</h2><p className="mt-1 text-sm text-ink-600">{t('student.reportCards.average', { value: card.average ?? '—' })}{card.position ? ` · ${t('student.reportCards.position', { position: card.position, size: card.classSize ?? 0 })}` : ''}</p><ul className="mt-3 divide-y divide-ink-200">{card.lines.map((line) => <li key={line.subject} className="flex justify-between py-2 text-sm"><span>{line.subject}{line.comment ? <span className="block text-xs text-ink-600">{line.comment}</span> : null}</span><span>{line.mark}/20 · ×{line.coefficient}</span></li>)}</ul></article>)}</div></>;
}
