import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logger';

/**
 * API bootstrap.
 *
 * COM-001: HTTPS with TLS 1.2+, HSTS enabled. TLS terminates at the platform
 *          edge (§2.4 hosting); HSTS is set here so it survives that hop.
 * COM-002: REST over JSON, versioned by URL path prefix (/api/v1/...).
 * NFR-SEC-006: strict CSP, X-Content-Type-Options, Referrer-Policy,
 *              X-Frame-Options/frame-ancestors, SameSite cookies.
 */
async function bootstrap(): Promise<void> {
  assertProductionSafety();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new JsonLogger(),
    bodyParser: true,
  });

  // §2.4 hosting puts a CDN in front of the API. Without this, every request
  // appears to come from the edge, which would break both the per-IP rate
  // limiting in NFR-AVL-007 and the IP recorded in the audit trail.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // NFR-SEC-006. The API serves JSON only, so nothing may be framed or
      // sourced from it; the web app carries its own policy.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      // COM-001: HSTS.
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
    // Correlation IDs must survive the browser round trip (NFR-MNT-005).
    exposedHeaders: ['x-correlation-id'],
  });

  app.setGlobalPrefix(process.env.API_PREFIX ?? '/api/v1');
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'log',
      context: 'Bootstrap',
      message: `ClassConnect API listening on :${port}${process.env.API_PREFIX ?? '/api/v1'}`,
    }),
  );
}

/**
 * Variables the hosting platform sets itself.
 *
 * NODE_ENV is not a trustworthy signal here. It is operator-supplied, and the
 * common mistake is pasting a laptop's environment file into a hosting
 * dashboard — which carries NODE_ENV=development along with every development
 * affordance, switching the checks below off at exactly the moment they matter.
 *
 * These variables are injected by the platform at runtime. They cannot travel
 * in a copied file, which is precisely what makes them worth trusting.
 */
const PLATFORM_MARKERS = [
  'VERCEL',
  'RAILWAY_ENVIRONMENT',
  'RENDER',
  'FLY_APP_NAME',
  'DYNO', // Heroku
  'K_SERVICE', // Cloud Run
  'AWS_EXECUTION_ENV',
  'WEBSITE_INSTANCE_ID', // Azure App Service
  'KUBERNETES_SERVICE_HOST',
];

function isDeployed(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    PLATFORM_MARKERS.some((marker) => Boolean(process.env[marker]))
  );
}

function databaseIsRemote(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return !['localhost', '127.0.0.1', '::1', 'host.docker.internal', 'postgres'].includes(host);
  } catch {
    return false;
  }
}

/**
 * Refuses to start with a development affordance enabled on deployed
 * infrastructure.
 *
 * DEV_EXPOSE_OTP returns one-time codes in API responses; reaching a deployed
 * environment with it on would hand every account to anyone who knows a phone
 * number. FILE_SCAN_MODE=bypass_dev serves unscanned uploads to children.
 * Neither is survivable, so both stop the process rather than warn.
 */
function assertProductionSafety(): void {
  const deployed = isDeployed();

  if (!deployed) {
    /*
     * Developing against a managed database is normal and stays permitted. It
     * is worth a warning all the same: these flags are safe pointed at a local
     * database and dangerous pointed at a real one, and the warning is the only
     * thing standing between "my laptop" and "the same file, deployed".
     */
    const risky = [
      process.env.DEV_EXPOSE_OTP === 'true' ? 'DEV_EXPOSE_OTP=true' : null,
      process.env.FILE_SCAN_MODE === 'bypass_dev' ? 'FILE_SCAN_MODE=bypass_dev' : null,
    ].filter(Boolean);

    if (risky.length > 0 && databaseIsRemote()) {
      // eslint-disable-next-line no-console
      console.warn(
        '\n  WARNING: development affordances are enabled against a REMOTE database:\n' +
          `    ${risky.join('\n    ')}\n` +
          '  One-time codes are returned in API responses and uploads are not scanned.\n' +
          '  Never carry this configuration to a deployed environment.\n',
      );
    }
    return;
  }

  const violations: string[] = [];
  if (process.env.DEV_EXPOSE_OTP === 'true') violations.push('DEV_EXPOSE_OTP must not be true');
  // FR-FIL-001: a file must be scanned before it can be downloaded. Reaching
  // production with the bypass on would serve unscanned files to children.
  if (process.env.FILE_SCAN_MODE === 'bypass_dev') {
    violations.push('FILE_SCAN_MODE must not be bypass_dev (FR-FIL-001)');
  }
  if (!process.env.CLOUDINARY_API_SECRET) {
    violations.push('CLOUDINARY_API_SECRET is required (SI-006)');
  }
  if (!process.env.JWT_ACCESS_SECRET) violations.push('JWT_ACCESS_SECRET is required');
  if (!process.env.JWT_REFRESH_SECRET) violations.push('JWT_REFRESH_SECRET is required');
  if (!process.env.FIELD_ENCRYPTION_KEY) violations.push('FIELD_ENCRYPTION_KEY is required');
  if (process.env.JWT_ACCESS_SECRET?.startsWith('replace-me')) {
    violations.push('JWT_ACCESS_SECRET is still the template placeholder');
  }
  if (process.env.JWT_REFRESH_SECRET?.startsWith('replace-me')) {
    violations.push('JWT_REFRESH_SECRET is still the template placeholder');
  }
  if (process.env.FIELD_ENCRYPTION_KEY?.startsWith('replace-me')) {
    violations.push('FIELD_ENCRYPTION_KEY is still the template placeholder');
  }
  // COM-001 / NFR-SEC-006: CORS admits WEB_ORIGIN. Left at the local default it
  // both blocks the real site and, if it were ever widened to compensate, would
  // widen it to everything.
  if (!process.env.WEB_ORIGIN || process.env.WEB_ORIGIN.includes('localhost')) {
    violations.push('WEB_ORIGIN must point at the deployed web origin, not localhost');
  }

  if (violations.length > 0) {
    throw new Error(
      'Refusing to start: this is deployed infrastructure and the configuration is unsafe.\n' +
        `  - ${violations.join('\n  - ')}\n` +
        'These values look like a development environment file copied verbatim. ' +
        'Set them for this environment rather than reusing a laptop\'s.',
    );
  }
}

void bootstrap();
