'use client';

import { useParams, useRouter } from 'next/navigation';
import { LiveRoom } from '@/components/teacher/LiveRoom';
import { useI18n } from '@/lib/i18n';
import { PageTitle } from '@/components/student/ui';
import { useStudent } from '@/lib/student-context';

/**
 * The learner's live-class room.
 *
 * `LiveRoom` obtains its guest token from `/learner/live/:sessionId/token`, so
 * the same server-side entitlement check used by the timetable is enforced
 * again immediately before the media connection opens.
 */
export default function StudentLiveClass() {
  const { t } = useI18n();
  const { config } = useStudent();
  const router = useRouter();
  const params = useParams<{ sessionId?: string }>();
  const sessionId = params?.sessionId;

  if (!config || !sessionId) return null;

  return (
    <>
      <PageTitle large={config.typeScale === 'large'}>{t('student.classes.liveNow')}</PageTitle>
      <LiveRoom sessionId={sessionId} role="guest" onEnded={() => router.back()} />
    </>
  );
}
