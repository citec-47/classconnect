import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * The Vercel serverless entry point.
 *
 * Vercel routes every request under this project here (see `vercel.json`). It
 * builds the same Nest application `main.ts` does and hands it the request,
 * without ever calling `listen`.
 *
 * ## Why this file loads `dist/` instead of importing `src/`
 *
 * Vercel compiles the function entry with esbuild, and esbuild does not
 * implement `emitDecoratorMetadata`. NestJS resolves constructor dependencies
 * from exactly that metadata, so an esbuild-compiled Nest application starts and
 * then fails with "Nest can't resolve dependencies of ..." for every provider.
 *
 * So the application is compiled ahead of time by `tsc` (via `nest build`, in
 * the `vercel-build` script) and this file only *loads* the result. Nothing here
 * carries a decorator, which is what makes it safe for esbuild to touch.
 *
 * The type-only imports above are erased at compile time and cost nothing at
 * runtime; they are what keeps this file checkable by
 * `tsconfig.serverless.json` rather than a bag of `any`.
 *
 * ## Why the instance is cached
 *
 * Booting Nest means constructing every module, connecting Prisma and reading
 * the configuration table — far too much to repeat per request. A function
 * keeps its module scope alive between invocations on the same warm instance,
 * so the promise below is created once per cold start and awaited by every
 * request after it.
 *
 * The promise, not the resolved app, is what is cached. Two requests arriving
 * during a cold start would otherwise each begin their own bootstrap, and the
 * loser would leak a fully constructed application and its database connection.
 *
 * ## What differs from the long-running server
 *
 *   No listener       — Vercel owns the socket; we supply only the handler.
 *   No WebSocket      — a function cannot hold a connection open between
 *                       invocations, so badge counts use COM-003's 60-second
 *                       poll. `pushEnabled` tells the client not to try.
 *   No interval timer — the billing pass runs from Vercel Cron against
 *                       `jobs.controller.ts` (§5.3).
 */

interface CompiledApp {
  createApp(options: { websockets: boolean }): Promise<NestExpressApplication>;
}

let cached: Promise<Express> | undefined;

async function build(): Promise<Express> {
  // Resolved at runtime, from the tsc-compiled output. Deliberately not a static
  // import: that would pull the decorated source through esbuild.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createApp } = require('../dist/create-app.js') as CompiledApp;

  const app = await createApp({ websockets: false });

  // `init()` runs the module lifecycle — PrismaService.onModuleInit, the
  // configuration cache load — without binding a port.
  await app.init();

  return app.getHttpAdapter().getInstance() as Express;
}

function handler(request: IncomingMessage, response: ServerResponse): void {
  cached ??= build().catch((error: unknown) => {
    // A failed bootstrap must not stay cached: the next invocation would await a
    // rejected promise forever and every request would answer with the same
    // stale error long after the cause — a missing secret, a database still
    // waking — had been fixed. Clearing it lets the next request try again.
    cached = undefined;
    throw error;
  });

  void cached.then(
    (express) => express(request, response),
    (error: unknown) => {
      // NFR-SEC-007: the reason never reaches the client. It is logged with
      // enough detail to diagnose, and answered generically.
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'error',
          context: 'ServerlessBootstrap',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );

      response.statusCode = 500;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ statusCode: 500, messageKey: 'errors.generic' }));
    },
  );
}

export default handler;
