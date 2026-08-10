import { redirect } from 'next/navigation';

/**
 * §3: "Payments" is a group header with six sub-items rather than a screen of
 * its own. Clicking it lands on the first one instead of a dead route.
 */
export default async function PaymentsIndex({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(`/${lang}/admin/payments/students-paid`);
}
