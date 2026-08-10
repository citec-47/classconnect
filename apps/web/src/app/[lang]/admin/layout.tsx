import type { ReactNode } from 'react';
import type { Language } from '@classconnect/shared';
import { AdminShellProvider } from '@/lib/admin-badges';
import { Sidebar } from '@/components/admin/Sidebar';
import { LiveToasts } from '@/components/admin/LiveToasts';

/**
 * The admin shell (§2.3, §3 of the admin brief).
 *
 * "Admins work on desktop, so this surface is designed desktop-first at 1440 px
 * with a usable 1024 px breakpoint — the opposite of the learner PWA. It must
 * still be operable on a tablet, because a founder will check the payment queue
 * from a phone at some point."
 *
 * So: no reading measure, no page header, no footer. A persistent sidebar and
 * everything else given to the content. Below `lg` the sidebar stacks above the
 * content rather than vanishing, which keeps the phone case operable without
 * pretending it is the design target.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const language = lang as Language;

  return (
    <AdminShellProvider language={language}>
      <div className="flex min-h-screen w-full flex-col lg:flex-row">
        <Sidebar language={language} />

        {/*
         * `min-w-0` matters: without it a wide money table forces the flex item
         * to its content width and the whole shell gains a horizontal
         * scrollbar, instead of the table scrolling inside its own container.
         */}
        <main id="main" className="min-w-0 flex-1 bg-ink-100/40 px-4 py-5 lg:px-6">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </main>

        {/*
         * Lesson-start notifications, at shell level so an operator is told
         * wherever they are in the dashboard rather than only on the live board.
         */}
        <LiveToasts language={language} />
      </div>
    </AdminShellProvider>
  );
}
