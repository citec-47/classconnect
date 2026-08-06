'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { formatXaf } from '@classconnect/shared';
import { Logo } from './Logo';
import {
  ShieldCheck,
  LowBandwidth,
  Wallet,
  LiveClass,
  BookStack,
  ParentView,
  MarkedWork,
  Bilingual,
  ArrowRight,
} from './icons';

/**
 * The public landing page.
 *
 * Layout notes, since these are decisions rather than defaults:
 *
 * UI-001 — designed at 360px first. Every breakpoint adds columns to a layout
 * that already works in one; nothing is hidden on small screens, because a
 * parent on a phone is the primary reader, not the fallback.
 *
 * The app shell holds pages to a reading measure, which is right for forms and
 * wrong here. Every section below breaks out to the viewport and re-centres on
 * a wider measure of its own, so the landing can use a desktop screen while the
 * signed-in pages stay comfortable to read.
 *
 * NFR-PER-002 — no images, no web fonts, no animation library. The only assets
 * are inline SVGs measured in hundreds of bytes, so the page costs the §6.1
 * budget almost nothing and nothing shifts while it loads (NFR-PER-008).
 *
 * NFR-USA-002 — the copy is specific rather than promotional. Every claim maps
 * to behaviour the system actually has.
 */
export function Landing({ language }: { language: 'en' | 'fr' }) {
  const { t } = useI18n();

  return (
    <div>
      {/* ================================================================= */}
      {/* Hero                                                              */}
      {/* ================================================================= */}
      <Band className="pb-12 pt-6 sm:pt-10">
        <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-12">
          <div className="lg:col-span-7">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-clay-600">
              <span className="h-px w-6 bg-clay-600" aria-hidden="true" />
              {t('landing.eyebrow')}
            </p>

            <h1 className="mt-4 font-display text-[2rem] leading-[1.08] tracking-tight text-ink-900 sm:text-[2.75rem] lg:text-[3.4rem]">
              {t('landing.headline')}
            </h1>

            <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-600 md:text-lg">
              {t('landing.subhead')}
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href={`/${language}/register`} className="cc-btn-primary whitespace-nowrap sm:w-auto sm:px-6">
                {t('landing.ctaPrimary')}
              </Link>
              <Link
                href={`/${language}/sign-in`}
                className="inline-flex min-h-touch items-center gap-1.5 whitespace-nowrap px-1 font-medium text-brand-700 underline underline-offset-4"
              >
                {t('landing.ctaSecondary')}
                <ArrowRight />
              </Link>
            </div>

            <p className="mt-3 text-sm text-ink-600">{t('landing.ctaNote')}</p>
          </div>

          {/*
           * Rather than a stock illustration, the hero shows the thing the
           * headline claims: an actual verification record, with the six checks
           * from VERIFICATION_CHECKLIST. It is the product, not a picture of a
           * product.
           */}
          <div className="mt-10 lg:col-span-5 lg:mt-0">
            <div className="rounded-xl border border-ink-300 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.18)]">
              <div className="flex items-center justify-between gap-3 border-b border-ink-300 pb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                  {t('landing.recordTitle')}
                </p>
                <span className="cc-badge bg-success-50 text-success-600">
                  {t('teacher.statusApproved')}
                </span>
              </div>

              <p className="mt-3 font-medium text-ink-900">{t('landing.recordTeacher')}</p>
              <p className="text-sm text-ink-600">{t('landing.recordSubjects')}</p>

              <ul className="mt-4 space-y-2.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <li key={n} className="flex items-start gap-2.5">
                    <Tick />
                    <span className="text-sm leading-snug text-ink-900">
                      {t(`landing.recordCheck${n}`)}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-4 border-t border-ink-300 pt-3 text-xs leading-relaxed text-ink-600">
                {t('landing.recordFooter')}
              </p>
            </div>
          </div>
        </div>
      </Band>

      {/* Proof strip: hairline-separated, not cards. */}
      <Band className="border-y border-ink-300 bg-ink-100/60" inner="py-0">
        <ul className="divide-y divide-ink-300 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { Icon: ShieldCheck, k: 'proofVerified' },
            { Icon: LowBandwidth, k: 'proofBandwidth' },
            { Icon: Wallet, k: 'proofPayment' },
          ].map(({ Icon, k }, index) => (
            <li key={k} className={`py-4 sm:py-6 ${index === 0 ? 'sm:pr-5' : 'sm:px-5'}`}>
              <Icon className="h-5 w-5 text-clay-600" />
              <p className="mt-2 text-sm font-semibold text-ink-900">{t(`landing.${k}`)}</p>
              <p className="mt-0.5 text-sm text-ink-600">{t(`landing.${k}Hint`)}</p>
            </li>
          ))}
        </ul>
      </Band>

      {/* ================================================================= */}
      {/* How it works                                                      */}
      {/* ================================================================= */}
      <Band className="py-12 md:py-16">
        <div className="md:grid md:grid-cols-12 md:gap-12">
          <div className="md:col-span-4">
            <SectionHeading title={t('landing.howTitle')} lead={t('landing.howLead')} />
          </div>

          <ol className="mt-8 space-y-8 md:col-span-8 md:mt-0">
            {[1, 2, 3].map((n) => (
              <li key={n} className="flex gap-4 md:gap-5">
                <span
                  className="font-display text-3xl leading-none text-clay-600/70"
                  aria-hidden="true"
                >
                  {String(n).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-ink-900">
                    {t(`landing.how${n}Title`)}
                  </h3>
                  <p className="mt-1.5 max-w-prose leading-relaxed text-ink-600">
                    {t(`landing.how${n}Body`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Band>

      {/* ================================================================= */}
      {/* Levels and subjects                                               */}
      {/* ================================================================= */}
      <Band className="border-t border-ink-300 py-12 md:py-16">
        <SectionHeading
          icon={<BookStack className="h-5 w-5" />}
          title={t('landing.levelsTitle')}
          lead={t('landing.levelsLead')}
          wide
        />

        <dl className="mt-8 grid gap-6 sm:grid-cols-3">
          {[
            { k: 'levelsPrimary', list: 'levelsPrimaryList' },
            { k: 'levelsSecondary', list: 'levelsSecondaryList' },
            { k: 'levelsExam', list: 'levelsExamList' },
          ].map(({ k, list }) => (
            <div key={k} className="border-t-2 border-brand-600 pt-3">
              <dt className="text-sm font-semibold uppercase tracking-wide text-ink-900">
                {t(`landing.${k}`)}
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-ink-600">
                {t(`landing.${list}`)}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 border-t border-ink-300 pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-900">
            {t('landing.subjectsTitle')}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">{t('landing.subjectsList')}</p>
        </div>
      </Band>

      {/* ================================================================= */}
      {/* Safeguarding — a dark band, because it is the thing that matters. */}
      {/* ================================================================= */}
      <Band className="bg-brand-900 py-12 text-white md:py-16">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-brand-100">
          <ShieldCheck className="h-4 w-4" />
          {t('nav.verification')}
        </p>
        <h2 className="mt-3 max-w-[24ch] font-display text-2xl leading-tight md:text-[2rem]">
          {t('landing.safetyTitle')}
        </h2>
        <p className="mt-3 max-w-prose text-brand-100">{t('landing.safetyLead')}</p>

        <ul className="mt-8 grid gap-x-10 gap-y-6 md:grid-cols-2">
          {[
            { Icon: ShieldCheck, k: 'safety1' },
            { Icon: Bilingual, k: 'safety2' },
            { Icon: LiveClass, k: 'safety3' },
            { Icon: ParentView, k: 'safety4' },
          ].map(({ Icon, k }) => (
            <li key={k} className="flex gap-3 border-t border-white/20 pt-4">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-100" />
              <p className="text-sm leading-relaxed text-white/90">{t(`landing.${k}`)}</p>
            </li>
          ))}
        </ul>
      </Band>

      {/* ================================================================= */}
      {/* Low bandwidth                                                     */}
      {/* ================================================================= */}
      <Band className="py-12 md:py-16">
        <div className="md:grid md:grid-cols-12 md:gap-12">
          <div className="md:col-span-5">
            <SectionHeading
              icon={<LowBandwidth className="h-5 w-5" />}
              title={t('landing.connectionTitle')}
              lead={t('landing.connectionLead')}
            />
          </div>

          <ul className="mt-6 space-y-4 md:col-span-7 md:mt-0">
            {['connection1', 'connection2', 'connection3', 'connection4'].map((k) => (
              <li key={k} className="border-l-2 border-clay-100 pl-4">
                <p className="text-sm leading-relaxed text-ink-600">{t(`landing.${k}`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </Band>

      {/* ================================================================= */}
      {/* Pricing — FR-PAY-002, formatted per UI-009.                       */}
      {/* ================================================================= */}
      <Band className="border-t border-ink-300 py-12 md:py-16">
        <SectionHeading
          icon={<Wallet className="h-5 w-5" />}
          title={t('landing.pricingTitle')}
          lead={t('landing.pricingLead')}
          wide
        />

        <ul className="mt-8 grid gap-px overflow-hidden rounded-xl border border-ink-300 bg-ink-300 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { k: 'pricingPrimary', monthly: 10_000n, yearly: 35_000n },
            { k: 'pricingSecondary', monthly: 15_000n, yearly: 40_000n },
            { k: 'pricingExam', monthly: null, yearly: 50_000n },
            { k: 'pricingScience', monthly: null, yearly: 60_000n },
          ].map(({ k, monthly, yearly }) => (
            <li key={k} className="bg-white p-4">
              <p className="text-sm font-semibold text-ink-900">{t(`landing.${k}`)}</p>

              {monthly !== null && (
                <p className="mt-3">
                  {/* UI-009: whole XAF, thousands separated, "FCFA" suffix. */}
                  <span className="font-display text-xl text-ink-900">
                    {formatXaf(monthly, language)}
                  </span>
                  <span className="block text-xs text-ink-600">
                    {t('landing.pricingMonthly')}
                  </span>
                </p>
              )}

              <p className={monthly !== null ? 'mt-2' : 'mt-3'}>
                <span
                  className={
                    monthly !== null
                      ? 'text-sm text-ink-600'
                      : 'font-display text-xl text-ink-900'
                  }
                >
                  {formatXaf(yearly, language)}
                </span>
                <span className="block text-xs text-ink-600">{t('landing.pricingYearly')}</span>
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-4 max-w-prose text-sm text-ink-600">{t('landing.pricingNote')}</p>
      </Band>

      {/* ================================================================= */}
      {/* FAQ — native <details>, so it works with no JavaScript at all.    */}
      {/* ================================================================= */}
      <Band className="border-t border-ink-300 py-12 md:py-16">
        <div className="md:grid md:grid-cols-12 md:gap-12">
          <div className="md:col-span-4">
            <SectionHeading icon={<MarkedWork className="h-5 w-5" />} title={t('landing.faqTitle')} />
          </div>

          <div className="mt-6 divide-y divide-ink-300 border-y border-ink-300 md:col-span-8 md:mt-0">
            {[1, 2, 3, 4].map((n) => (
              <details key={n} className="group py-4">
                <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink-900">
                  {t(`landing.faq${n}Q`)}
                  <span
                    className="shrink-0 text-xl leading-none text-clay-600 transition-transform group-open:rotate-45"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-2 max-w-prose pr-8 text-sm leading-relaxed text-ink-600">
                  {t(`landing.faq${n}A`)}
                </p>
              </details>
            ))}
          </div>
        </div>
      </Band>

      {/* ================================================================= */}
      {/* Closing call to action                                            */}
      {/* ================================================================= */}
      <Band className="bg-clay-50 py-12 md:py-16">
        <div className="md:flex md:items-end md:justify-between md:gap-10">
          <div>
            <Logo size="lg" />
            <h2 className="mt-5 max-w-[18ch] font-display text-2xl leading-tight text-ink-900 md:text-3xl">
              {t('landing.finalTitle')}
            </h2>
            <p className="mt-3 max-w-prose text-ink-600">{t('landing.finalBody')}</p>
          </div>

          <div className="mt-6 flex flex-col gap-3 md:mt-0 md:shrink-0 sm:flex-row sm:items-center">
            <Link href={`/${language}/register`} className="cc-btn-primary whitespace-nowrap sm:w-auto sm:px-6">
              {t('landing.ctaPrimary')}
            </Link>
            <Link
              href={`/${language}/sign-in`}
              className="inline-flex min-h-touch items-center gap-1.5 whitespace-nowrap px-1 font-medium text-brand-700 underline underline-offset-4"
            >
              {t('landing.ctaSecondary')}
              <ArrowRight />
            </Link>
          </div>
        </div>
      </Band>
    </div>
  );
}

/**
 * A full-width band with its content re-centred on the landing measure.
 *
 * `cc-bleed` escapes the app shell's reading column; `max-w-5xl` then gives the
 * landing a wider one, so a desktop screen is used without the text lines
 * becoming too long to read.
 */
function Band({
  children,
  className = '',
  inner = '',
}: {
  children: ReactNode;
  className?: string;
  inner?: string;
}) {
  return (
    <section className={`cc-bleed ${className}`}>
      <div className={`mx-auto max-w-5xl ${inner}`}>{children}</div>
    </section>
  );
}

function SectionHeading({
  title,
  lead,
  icon,
  wide,
}: {
  title: string;
  lead?: string;
  icon?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div>
      {icon && <span className="mb-3 inline-block text-clay-600">{icon}</span>}
      <h2
        className={`font-display text-2xl leading-tight text-ink-900 md:text-[2rem] ${
          wide ? 'max-w-[28ch]' : 'max-w-[20ch]'
        }`}
      >
        {title}
      </h2>
      {lead && <p className="mt-3 max-w-prose leading-relaxed text-ink-600">{lead}</p>}
    </div>
  );
}

/** A recorded check. Decorative — the adjacent text carries the meaning. */
function Tick() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="mt-0.5 h-4 w-4 shrink-0 text-success-600"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="9" className="fill-success-50" />
      <path
        d="m6 10.5 2.5 2.5L14 7.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
