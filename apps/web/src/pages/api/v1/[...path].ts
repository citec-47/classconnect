import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { NextApiRequest, NextApiResponse } from 'next';
import { upstreamOrigin } from '../../../lib/api-origin';

/**
 * The `/api/v1` bridge, in whichever of its two modes this deployment needs.
 *
 * **Forwarding**, when `API_ORIGIN` names an API deployed somewhere else. The
 * request is streamed to it and its answer streamed back, so the browser keeps
 * talking to one origin.
 *
 * **In-process**, when nothing does. The already compiled Nest application is
 * booted here and handed the original request/response pair. Nest keeps its
 * `/api/v1` prefix, so the frontend's paths are the same either way.
 *
 * ## Why forwarding exists at all
 *
 * The alternative is to point the browser straight at the API with
 * `NEXT_PUBLIC_API_URL`, and that still works. But `NEXT_PUBLIC_*` is inlined
 * into the client bundle at build time, and the CSP that must also name that
 * origin is written into the route manifest at build time — so on a two-service
 * host the value has to be right *before* the frontend is compiled, and getting
 * it wrong is invisible until a browser tries to sign in. The symptom is a 503
 * from this very file, which reads as "the API is down" when the API is healthy
 * and simply was never addressed.
 *
 * `API_ORIGIN` is read on each request instead. Setting it takes effect on
 * restart, with no rebuild, and it cannot be baked in wrong. Same-origin also
 * means no CORS preflight and no second origin in the CSP — `'self'` already
 * covers it.
 *
 * ## What forwarding cannot carry
 *
 * A WebSocket. An upgrade never reaches a Next API route, so the admin badge
 * stream cannot run through here. The bridge says so upstream with
 * `x-cc-api-bridge`, and `DashboardService.navFor` turns `pushEnabled` off when
 * it sees it — the client then uses COM-003's 60-second poll instead of opening
 * a socket that would fail and retry for the life of the session. Point
 * `NEXT_PUBLIC_API_URL` at the API directly to get the push channel back.
 *
 * `bodyParser: false` is essential in both modes: Nest owns JSON parsing and
 * retains raw bytes for signed LiveKit webhooks, and a forwarded body must
 * arrive byte-identical for the same reason. Letting Next consume the stream
 * first would make valid webhook signatures impossible to verify.
 */
export const config = {
  api: {
    bodyParser: false,
    // A proxied response is whatever the API sent — a signed HLS playlist, a
    // report export. Next's 4 MB advisory ceiling is about API routes that
    // build their own payloads, and does not apply to relaying someone else's.
    responseLimit: false,
  },
};

type ExpressHandler = (request: NextApiRequest, response: NextApiResponse) => void;

/**
 * Headers that describe one hop and must not be copied onto the next (RFC 9110
 * §7.6.1), plus the two that the receiving stack recomputes for itself.
 */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  // Rewritten to the upstream host, never forwarded as the browser sent it.
  'host',
  // The body is re-framed by whichever stack sends it on.
  'content-length',
]);

async function forward(
  origin: string,
  request: NextApiRequest,
  response: NextApiResponse,
): Promise<void> {
  // `request.url` is the full original path, prefix included, so the target is
  // the same path against a different origin.
  const incoming = new URL(request.url ?? '/', 'http://bridge.invalid');
  const target = new URL(incoming.pathname + incoming.search, origin);

  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || HOP_BY_HOP.has(name)) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  /*
   * Identity encoding on this hop. `fetch` transparently decompresses what it
   * receives, so a `content-encoding` copied onto the response below would
   * describe bytes that are no longer encoded — and the browser would fail to
   * decode a body that was already plain.
   */
  headers.delete('accept-encoding');

  // The API sets `trust proxy`, so it reads the client's address from
  // `x-forwarded-for` — which the platform already set on the way in and which
  // is copied above. These two say what this hop added.
  headers.set('x-forwarded-host', String(request.headers.host ?? ''));
  headers.set('x-cc-api-bridge', 'proxy');

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? (Readable.toWeb(request) as unknown as ReadableStream) : undefined,
    // Streaming a request body requires declaring that the request half may
    // finish first. Not yet in the DOM typings Next compiles against.
    ...({ duplex: 'half' } as Record<string, unknown>),
    // A redirect is the API's answer and belongs to the browser, not to us.
    redirect: 'manual',
    /*
     * Just under the client's own 30s ceiling in `api.ts`, so that when time
     * runs out it is this hop that gives up first and answers with a message
     * key the page can render. At exactly 30s the two race, and when the
     * browser wins it aborts with no response at all.
     */
    signal: AbortSignal.timeout(28_000),
  });

  /*
   * A gateway answer from the platform, not from the API.
   *
   * A host returns 502/504 — as HTML — for a service that is not currently
   * accepting requests: spun down after an idle period, restarting, or out of
   * instances. Relaying that verbatim gives the browser a body it cannot parse,
   * so `api()` falls through to `errors.generic`: "something went wrong on our
   * side", which is both vague and wrong about whose side.
   *
   * The application's own 503s are JSON and carry a message key, so they are
   * passed through untouched. Anything else at these statuses is the platform
   * talking, and the honest translation is "not available right now, waiting
   * will help" — which is what `errors.service_unavailable` says.
   */
  const contentType = upstream.headers.get('content-type') ?? '';
  if (
    (upstream.status === 502 || upstream.status === 503 || upstream.status === 504) &&
    !contentType.includes('json')
  ) {
    console.error(
      `ClassConnect API bridge: ${origin} answered ${upstream.status} ` +
        `(${contentType || 'no content-type'}). That is the platform, not the API — ` +
        'the API service is asleep, restarting, or refusing connections.',
    );
    response.status(503).json({ messageKey: 'errors.service_unavailable' });
    return;
  }

  response.status(upstream.status);

  upstream.headers.forEach((value, name) => {
    if (HOP_BY_HOP.has(name)) return;
    // Both describe a body this hop is re-framing: `fetch` has already
    // decompressed, and the length changed with it.
    if (name === 'content-encoding' || name === 'content-length') return;
    // Handled below — `forEach` folds repeats into one comma-joined string,
    // which is valid for every header except this one.
    if (name === 'set-cookie') return;
    response.setHeader(name, value);
  });

  const cookies = upstream.headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) response.setHeader('set-cookie', cookies);

  if (!upstream.body) {
    response.end();
    return;
  }
  await pipeline(Readable.fromWeb(upstream.body as never), response);
}

let appPromise: Promise<ExpressHandler> | undefined;

async function app(): Promise<ExpressHandler> {
  /*
   * Imported here rather than at the top of the file.
   *
   * A forwarding deployment has no use for the compiled Nest application and
   * should not pay to load it — a static import pulls in the whole framework,
   * and Prisma with it, on a service whose job is to render pages.
   */
  const { createApp } = await import('../../../../../api/dist/create-app');
  const nest = await createApp();
  await nest.init();
  return nest.getHttpAdapter().getInstance() as ExpressHandler;
}

/** Logged once, not per request: a misconfiguration repeated is still one fact. */
let explainedInProcessFailure = false;

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse,
): Promise<void> {
  const origin = upstreamOrigin();
  const sameService = origin !== undefined && new URL(origin).host === request.headers.host;

  if (origin !== undefined && !sameService) {
    try {
      await forward(origin, request, response);
    } catch (error: unknown) {
      // The target is deployment topology, not a secret, and naming it is the
      // difference between "the API is down" and "the API is not where this
      // service was told to look".
      console.error(`ClassConnect API bridge could not reach ${origin}`, error);
      if (!response.writableEnded) {
        response.status(503).json({ messageKey: 'errors.service_unavailable' });
      }
    }
    return;
  }

  if (sameService) {
    // Forwarding to ourselves is a request loop, and the loop is the whole
    // service. Boot in-process instead and say why the setting was ignored.
    console.error(
      `API_ORIGIN points at this service (${origin}), which would forward every ` +
        'request to itself. Ignoring it and serving the API in-process. Set it to ' +
        "the API service's own URL, or unset it.",
    );
  }

  appPromise ??= app().catch((error: unknown) => {
    // A configuration problem must be retryable after an environment-variable
    // correction, rather than poisoning every warm invocation forever.
    appPromise = undefined;
    throw error;
  });

  try {
    const express = await appPromise;
    express(request, response);
  } catch (error: unknown) {
    // Keep deployment configuration details in the function logs, never in a
    // browser response where secrets and database topology can be exposed.
    console.error('ClassConnect API bootstrap failed', error);
    if (!explainedInProcessFailure) {
      explainedInProcessFailure = true;
      console.error(
        'This service is running the API in-process because API_ORIGIN and ' +
          'NEXT_PUBLIC_API_URL are both unset or relative. That needs the full API ' +
          'environment here — DATABASE_URL first of all. If the API is deployed as its ' +
          "own service, set API_ORIGIN to that service's URL and restart this one; no " +
          'rebuild is required.',
      );
    }
    if (!response.writableEnded) {
      response.status(503).json({ messageKey: 'errors.service_unavailable' });
    }
  }
}
