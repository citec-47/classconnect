import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { LANGUAGES, type Language } from '@classconnect/shared';
import { StudentProvider } from '@/lib/student-context';
import { StudentShell } from '@/components/student/StudentShell';

/**
 * The learner surface (§2 of the student brief).
 *
 * A sibling of `(site)` and `admin` under `[lang]`, so it inherits the document,
 * the language and the session providers from the root layout and adds only its
 * own chrome. The brief writes these routes as `/[locale]/student/...`; this
 * repository has used `[lang]` since the first commit and consistency with the
 * other two surfaces is worth more than matching the brief's spelling.
 *
 * The profile provider sits above the shell rather than inside it because the
 * level decides the tab set, and the tab set is chrome.
 */
export default async function StudentLayout({
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
    <StudentProvider language={language}>
      <StudentShell language={language}>{children}</StudentShell>
    </StudentProvider>
  );
}
