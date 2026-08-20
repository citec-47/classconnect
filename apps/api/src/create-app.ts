import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logger';
import { isDeployed } from './common/deployment';

/**
 * Builds the configured Nest application, without starting a listener.
 *
 * Two hosts need the same application configured identically:
 *
 *   `main.ts`     — a long-running server. Owns the port, and the only place
 *                   that can hold a WebSocket connection or an interval timer.
 *   `api/index.ts`— a Vercel serverless function. Created once per cold start,
 *                   cached across invocations, and handed one request at a time.
 *
 * Every header, guard, filter and pipe belongs here so the two cannot drift.
 * The differences between them are declared explicitly at the bottom of this
 * file, not discovered later as "it works locally".
 *
 * COM-001: HTTPS with TLS 1.2+, HSTS enabled. TLS terminates at the platform
 *          edge; HSTS is set here so it survives that hop.
 * COM-002: REST over JSON, versioned by URL path prefix (/api/v1/...).
 * NFR-SEC-006: strict CSP, X-Content-Type-Options, Referrer-Policy,
 *              X-Frame-Options/frame-ancestors, SameSite cookies.
 */
export async function createApp(): Promise<NestExpressApplication> {
  assertProductionSafety();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new JsonLogger(),
    bodyParser: true,
    /*
     * The unparsed body, kept alongside the parsed one.
     *
     * LiveKit signs the exact bytes it sent. Re-serialising the parsed object to
     * check that signature would compare a signature over LiveKit's JSON against
     * our own reformatting of it — key order, spacing and number formatting all
     * differ — so it would fail for every genuine webhook and pass for none.
     * Attendance, and therefore every teacher's pay, arrives through that
     * endpoint.
     */
    rawBody: true,
  });

  // Hosting puts a CDN in front of the API. Without this, every request appears
  // to come from the edge, which would break both the per-IP rate limiting in
  // NFR-AVL-007 and the IP recorded in the audit trail (FR-RBA-004).
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
    origin: corsOrigin(),
    credentials: true,
    // Correlation IDs must survive the browser round trip (NFR-MNT-005).
    exposedHeaders: ['x-correlation-id'],
  });

  app.setGlobalPrefix(process.env.API_PREFIX ?? '/api/v1');

  /**
   * COM-002/COM-003: live admin badge counts push over a WebSocket.
   *
   * The adapter is registered on every host, unconditionally. Nest resolves a
   * WebSocket driver as soon as one gateway is declared anywhere in the module
   * graph, and `loadAdapter` answers a missing one with `process.exit(1)` —
   * not an error a caller could catch. Skipping registration on the hosts that
   * cannot serve an upgrade therefore never disabled the gateways: it killed
   * the process during `init()`. Inside the Next bridge that took the dev
   * server down with it, and the browser saw only ECONNREFUSED on every call.
   *
   * Registering it costs nothing where it cannot be used. `WsAdapter` builds
   * each server with `noServer: true` and waits for an upgrade event that a
   * request-per-invocation host never emits. What keeps the client from
   * attempting a doomed connection is `pushEnabled` in DashboardService —
   * the right place for it, since that is the server reporting its own
   * capability rather than a constructor argument asserting it.
   *
   * COM-003’s "reconcile with a poll every 60 s in case the socket dropped" is
   * what makes that degradation safe rather than a lost feature: the poll is the
   * authoritative path in both deployments.
   */
  app.useWebSocketAdapter(new WsAdapter(app));

  app.enableShutdownHooks();

  return app;
}

/**
 * Which origins the browser may call this API from.
 *
 * Deployed: exactly what WEB_ORIGIN lists, and nothing else.
 *
 * On a developer machine, also any loopback or private-network address. Testing
 * on a real phone means opening the site on the LAN address of the laptop, and
 * that is a different origin from localhost — so with a fixed list the page
 * loads, every request is blocked, and the app reports itself unreachable. The
 * alternative is re-listing an origin that changes with the network, which
 * nobody does more than once.
 *
 * This cannot leak into production: `isDeployed()` keys off variables the
 * hosting platform injects, which cannot travel in a copied environment file.
 */
function corsOrigin() {
  const configured = (process.env.WEB_ORIGIN ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (isDeployed()) return configured;

  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // No Origin header at all: curl, a health probe, a same-origin request.
    if (!origin) return callback(null, true);
    if (configured.includes(origin)) return callback(null, true);
    callback(null, isLoopbackOrPrivate(origin));
  };
}

function isLoopbackOrPrivate(origin: string): boolean {
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }

  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;

  // RFC 1918 ranges, plus link-local. Anything routable is refused.
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function databaseIsRemote(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return !['localhost', '127.0.0.1', '::1'].includes(host);
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
export function assertProductionSafety(): void {
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
      process.env.DEV_DISABLE_STAFF_MFA === 'true' ? 'DEV_DISABLE_STAFF_MFA=true' : null,
    ].filter(Boolean);

    if (risky.length > 0 && databaseIsRemote()) {
      // eslint-disable-next-line no-console
      console.warn(
        '\n  WARNING: development affordances are enabled against a REMOTE database:\n' +
          `    ${risky.join('\n    ')}\n` +
          '  One-time codes are returned in API responses, uploads are not scanned,\n' +
          '  and administrators sign in with a password alone.\n' +
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
  // FR-AUT-009 / NFR-SEC-012: an administrator can approve teachers and read
  // minors' data. Behind a password alone, one leaked password is the platform.
  if (process.env.DEV_DISABLE_STAFF_MFA === 'true') {
    violations.push('DEV_DISABLE_STAFF_MFA must not be true (FR-AUT-009)');
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
  /**
   * Vercel Cron is what runs the daily billing pass on serverless (§5.3). The
   * endpoint it calls is authenticated by a shared secret, and without one the
   * job either never runs — no notices, no freezes — or runs for anyone who
   * finds the URL. Neither is acceptable, so boot refuses.
   */
  if (!process.env.CRON_SECRET) {
    violations.push('CRON_SECRET is required to authenticate the scheduled billing pass');
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
