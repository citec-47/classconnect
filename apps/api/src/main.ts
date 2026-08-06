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
 * Refuses to start with a development affordance enabled in production.
 * DEV_EXPOSE_OTP returns one-time codes in API responses; reaching production
 * with it on would hand every account to anyone who knows a phone number.
 */
function assertProductionSafety(): void {
  if (process.env.NODE_ENV !== 'production') return;

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

  if (violations.length > 0) {
    throw new Error(`Refusing to start in production:\n  - ${violations.join('\n  - ')}`);
  }
}

void bootstrap();
