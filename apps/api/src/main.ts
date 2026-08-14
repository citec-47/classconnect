import type { Server } from 'node:http';
import { attachLiveKitProxy } from './teachers/livekit-proxy';
import { createApp } from './create-app';

/**
 * The long-running server.
 *
 * This is how the API runs locally (`npm run dev:api`) and on any host that
 * keeps a process alive — Render, Railway, Fly, a VPS. It is the only mode that
 * can hold a WebSocket open or run an interval timer, so the badge push
 * (COM-002) and the in-process billing scheduler (§5.3) are both live here.
 *
 * On Vercel the entry point is `api/index.ts` instead: same application, no
 * listener, and those two responsibilities move to the poll and to Vercel Cron.
 * Everything else is identical, because both call `createApp`.
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
