import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { LANGUAGES, type Language } from '@classconnect/shared';
import { TeacherSidebar } from '@/components/teacher/Sidebar';

/**
 * The teacher surface.
 *
 * A fourth sibling under `[lang]`, alongside `(site)`, `admin` and `student`,
 * so it inherits the document, the language and the session providers from the
 * root layout and adds only its own chrome.
 *
 * Laid out like the admin shell rather than the learner one, because the work
 * is the same shape: a teacher marking a set of scripts or reading a roster is
 * at a desk with a wide window, not thumbing a 360px phone. The sidebar stacks
 * above the content below `lg` so the phone case stays operable without
 * pretending it is the design target.
 */
export default async function TeacherLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!LANGUAGES.includes(lang as Language)) notFound();
  const language = lang as Language;

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <TeacherSidebar language={language} />

      {/* `min-w-0` keeps a wide roster table scrolling inside its own container
          rather than widening the whole shell. */}
      <main id="main" className="cc-surface min-w-0 flex-1 px-4 py-5 lg:px-6">
        <div className="mx-auto max-w-[1440px]">{children}</div>
      </main>
    </div>
  );
}
