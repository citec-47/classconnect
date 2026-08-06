/**
 * Whether this process is running on deployed infrastructure.
 *
 * Every development affordance in this codebase — exposed one-time codes,
 * bypassed file scanning, unenforced staff MFA — is gated on this one answer,
 * so it lives in one place rather than being re-derived at each call site.
 *
 * NODE_ENV alone is not a trustworthy signal. It is operator-supplied, and the
 * common mistake is pasting a laptop's environment file into a hosting
 * dashboard: that carries NODE_ENV=development along with every affordance,
 * switching the guards off at exactly the moment they matter most.
 *
 * The variables below are injected by the platform at runtime. They cannot
 * travel in a copied file, which is precisely what makes them worth trusting.
 */
export const PLATFORM_MARKERS = [
  'VERCEL',
  'RAILWAY_ENVIRONMENT',
  'RENDER',
  'FLY_APP_NAME',
  'DYNO', // Heroku
  'K_SERVICE', // Cloud Run
  'AWS_EXECUTION_ENV',
  'WEBSITE_INSTANCE_ID', // Azure App Service
  'KUBERNETES_SERVICE_HOST',
] as const;

export function isDeployed(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    PLATFORM_MARKERS.some((marker) => Boolean(process.env[marker]))
  );
}

/**
 * Reads a development-only switch.
 *
 * Returns false on deployed infrastructure no matter what the variable says.
 * Boot also refuses outright when one of these is set there (see main.ts) — the
 * check is repeated here so a flag cannot be honoured by a code path that
 * somehow starts without that assertion having run.
 */
export function devFlag(name: string): boolean {
  return process.env[name] === 'true' && !isDeployed();
}
