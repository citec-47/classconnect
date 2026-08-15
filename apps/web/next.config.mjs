import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Next.js configuration.
 *
 * NFR-SEC-006: strict Content Security Policy, X-Content-Type-Options,
 *              Referrer-Policy and frame-ancestors.
 * NFR-PER-007: images served in a modern format with responsive sizing.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /**
   * The monorepo root, stated rather than guessed.
   *
   * Next traces which files a server route actually needs and copies only those
   * into the deployed function. It infers the root from the nearest lockfile,
   * and in a workspace with more than one in scope it can choose wrongly —
   * here it selected a stray lockfile in the user's home directory.
   *
   * A wrong root is invisible at build time and fatal at runtime: the build
   * succeeds, then the function is missing `packages/shared` and every request
   * fails with FUNCTION_INVOCATION_FAILED. Pinning it makes the trace cover the
   * whole workspace.
   */
  outputFileTracingRoot: path.join(here, '..', '..'),

  images: {
    // NFR-PER-007: WebP/AVIF with responsive sizing.
    formats: ['image/avif', 'image/webp'],
    // NFR-PER-002 budgets assume a 360px reference width as the smallest step.
    deviceSizes: [360, 414, 640, 768, 1024, 1280],
  },

  experimental: {
    // NFR-PER-002: keep the initial JS payload under 200 KB gzipped.
    optimizePackageImports: ['@classconnect/shared'],
  },

  async headers() {
    const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

    /**
     * COM-002: the admin badge stream is a WebSocket to the same API origin.
     *
     * CSP does not infer `ws:` from an `http:` source — an unlisted socket is
     * refused by the browser before it reaches the network. So the API origin is
     * listed under both schemes.
     *
     * This matters only where the API runs as a long-running process. On a
     * serverless deployment there is no socket to open and the client is told so
     * (`pushEnabled`), but the directive is harmless there and its absence would
     * be a silent failure the moment the API moved to a host that has one.
     */
    const socketOrigin = apiOrigin.replace(/^http/, 'ws');

    /**
     * NFR-SEC-006 keeps a strict CSP in production. Development needs one more
     * source, and only development.
     *
     * Next's dev server compiles modules with an eval-based source map so that
     * hot module replacement can swap them. Under `script-src 'self'
     * 'unsafe-inline'` the browser refuses that outright:
     *
     *   EvalError: Evaluating a string as JavaScript violates the following
     *   Content Security Policy directive ...
     *
     * The consequence is not a warning in the console — it is that the client
     * bundle never runs. React does not hydrate, so no `onClick` and no
     * `onChange` is ever attached, on any page. Every control renders correctly
     * and does nothing: the language switch ignores clicks, and a submit button
     * disabled on empty state can never become enabled because typing updates no
     * state. It reads exactly like a broken application, which is what makes it
     * worth this much explanation.
     *
     * Production bundles are compiled, not evaluated, so the directive is added
     * only when this is not a production build — the strict policy the
     * requirement asks for is the one that ships.
     */
    const scriptSrc = [
      "'self'",
      // Next.js injects inline bootstrap scripts; 'unsafe-inline' is scoped to
      // script-src only and paired with strict everything else.
      "'unsafe-inline'",
      ...(process.env.NODE_ENV === 'production' ? [] : ["'unsafe-eval'"]),
    ].join(' ');

    /*
     * Message attachments are delivered from the storage CDN, so it has to be
     * named here. NFR-SEC-006 asks for a strict policy, not an empty one — and
     * a policy that blocks the product's own images is strict in the way a
     * locked door with the key inside is secure.
     *
     * A constant, not read from the environment.
     *
     * The first attempt gated this on `CLOUDINARY_CLOUD_NAME` — but Next reads
     * env files from `apps/web`, not from the monorepo root where that variable
     * lives. It resolved to an empty string, the policy was unchanged, and the
     * images stayed blocked with the config looking correct.
     *
     * Nothing is lost by hard-coding the host: assets are stored
     * `authenticated`, so nothing at `res.cloudinary.com` is publicly fetchable
     * — the CDN demands a signature no client can produce, whichever tenant the
     * path belongs to.
     *
     * `media-src` is separate: video and voice notes come from the same host and
     * `img-src` does not cover them.
     */
    const storageOrigin = 'https://res.cloudinary.com';

    /**
     * Where lesson recordings are served from, which is two places, not one.
     *
     * The playlist comes from this API — rewritten per request so each segment
     * carries its own signature — and the segments themselves come straight from
     * object storage. Both have to be named, and for different directives:
     *
     * - `connect-src`, because hls.js fetches both by XHR.
     * - `media-src`, because Safari hands the playlist to the media element
     *   itself and never uses XHR at all.
     *
     * Overridable rather than constant, because unlike Cloudinary this host
     * changes when the bucket does — and the brief already anticipates moving to
     * a larger one. Set `NEXT_PUBLIC_RECORDINGS_ORIGIN` in `apps/web/.env` when
     * that happens; the default is the bucket in use today. It cannot be read
     * from `LIVEKIT_S3_ENDPOINT`, because that lives in the monorepo root where
     * Next does not look — the same trap documented for Cloudinary above.
     */
    const recordingsOrigin =
      process.env.NEXT_PUBLIC_RECORDINGS_ORIGIN ??
      'https://jwiifqyrivspyslbbiyq.storage.supabase.co';

    /*
     * The API's *origin*, with any path removed.
     *
     * `NEXT_PUBLIC_API_URL` carries the `/api/v1` prefix for the fetch helper,
     * and a CSP source with a path matches by path prefix — narrower than
     * intended and silently wrong the day a route moves.
     */
    const apiMediaOrigin = (() => {
      try {
        return new URL(apiOrigin).origin;
      } catch {
        return apiOrigin;
      }
    })();

    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${storageOrigin}`.trim(),
      /*
       * `blob:` stays, and is not optional: hls.js plays through Media Source
       * Extensions, which means the video element's source is a blob URL rather
       * than any of the hosts named here. Removing it would block every
       * recording on every browser except Safari.
       *
       * Cloudinary stays too. Recordings have moved, but voice notes and message
       * attachments are still served from there, and `img-src` does not cover
       * audio or video.
       */
      `media-src 'self' blob: ${storageOrigin} ${apiMediaOrigin} ${recordingsOrigin}`.trim(),
      "font-src 'self' data:",
      `connect-src 'self' ${apiOrigin} ${socketOrigin} ${recordingsOrigin}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // COM-001: HSTS.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
