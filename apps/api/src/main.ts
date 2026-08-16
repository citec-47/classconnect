import type { Server } from 'node:http';
import { attachLiveKitProxy } from './teachers/livekit-proxy';
import { createApp } from './create-app';

/**
 * The long-running server.
 *
 * This is how the API runs — locally (`npm run dev:api`) and in production, on a
 * host that keeps a process alive: Railway, Render, Fly, a VPS.
 *
 * ## Why not a serverless platform
 *
 * This entry point is the only one, deliberately. A comment here used to promise
 * an `api/index.ts` for Vercel; no such file was ever written, and it should not
 * be. Four things in this application need a process that outlives a request:
 *
 * - the billing scheduler (§5.3) and the live sweeper, which closes abandoned
 *   lessons and stops their recordings;
 * - the badge push (COM-002), which holds a WebSocket open;
 * - the LiveKit signalling relay attached below, which holds another;
 * - the LiveKit webhook receiver, which must be reachable at a stable URL.
 *
 * On a function-per-request platform the schedulers simply never run, and
 * nothing reports that they have not. The web app belongs on Vercel; this does
 * not.
 */
async function bootstrap(): Promise<void> {
  const app = await createApp({ websockets: true });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');

  /*
   * The LiveKit signalling relay, on this server's own port.
   *
   * Attached here rather than inside a module because it needs the raw HTTP
   * server to handle the upgrade, and only this entry point has one — Vercel's
   * does not, which is correct: a serverless function cannot hold a socket open
   * and the browser there talks to LiveKit directly.
   */
  attachLiveKitProxy(
    app.getHttpServer() as Server,
    `${process.env.API_PREFIX ?? '/api/v1'}/livekit`,
  );

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

void bootstrap();
