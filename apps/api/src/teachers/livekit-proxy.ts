import type { Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { Logger } from '@nestjs/common';
import { WebSocket, WebSocketServer } from 'ws';

/**
 * Relays LiveKit's signalling WebSocket through this API's own origin.
 *
 * ## Why this exists
 *
 * A browser refusing to reach `wss://…livekit.cloud` reports
 * `could not establish signal connection: Failed to fetch`, and nothing in the
 * page can overrule it: extensions, tracking protection, corporate proxies and
 * firewalls all block third-party origins by design, and an application able to
 * override that would be a hole rather than a feature.
 *
 * What *can* change is the origin. The browser already trusts this API — it is
 * where every other request goes — so if the signalling socket comes from here
 * too, there is no third party left to block. That is an ordinary reverse
 * proxy, not a bypass: the same connection, made from a host the user's browser
 * is already talking to.
 *
 * ## What this does not solve
 *
 * Signalling only. Audio and video travel over WebRTC, which needs UDP or
 * LiveKit's TURN relay on 443 — a network blocking those blocks the media too,
 * and the room will connect and then carry no picture. TURN over 443 looks like
 * ordinary HTTPS and passes most filters, which is why this is worth doing, but
 * it is not a guarantee and should not be described as one.
 *
 * ## Credentials
 *
 * None pass through here. The browser still presents the token this API minted;
 * this only carries the bytes. The API key and secret stay server-side, exactly
 * as before.
 */
export function attachLiveKitProxy(server: Server, path = '/livekit'): void {
  const logger = new Logger('LiveKitProxy');

  const upstream = process.env.LIVEKIT_URL;
  if (!upstream) {
    logger.log('LIVEKIT_URL is not set: the signalling proxy is off');
    return;
  }

  /*
   * `noServer`, because this shares a port with the HTTP API.
   *
   * Nest already owns the listener, so the upgrade is handled by hand below
   * rather than by letting `ws` bind a second server to the same port.
   */
  const wss = new WebSocketServer({ noServer: true });

  /*
   * Every other `upgrade` listener is taken off the server and re-dispatched by
   * hand, because going first is not enough.
   *
   * Nest's Socket.IO adapter attaches its own `upgrade` handler which destroys
   * any socket whose path it does not recognise. `prependListener` made this
   * run first — and then Socket.IO ran too, and destroyed the socket anyway.
   * The symptom was precise and misleading: the handshake succeeded, LiveKit
   * accepted the token and held the room open for its full fifteen-second join
   * timeout, while the browser reported the socket closing the instant it
   * opened. Both ends behaved correctly; the socket was being torn down between
   * them.
   *
   * Claiming a path means no one else may answer for it, so matching upgrades
   * stop here and the rest are passed on untouched — Socket.IO still gets every
   * connection that is actually its own.
   */
  const inherited = server.listeners('upgrade') as ((
    request: import('node:http').IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => void)[];
  server.removeAllListeners('upgrade');

  server.on('upgrade', (request, socket: Duplex, head) => {
    const url = request.url ?? '';
    if (!url.startsWith(path)) {
      for (const listener of inherited) listener(request, socket, head);
      return;
    }

    logger.debug(`Relaying signalling for ${url.slice(0, 60)}…`);

    wss.handleUpgrade(request, socket, head, (client) => {
      /*
       * Everything after the mount point is carried across exactly as it came.
       *
       * The client asks for `/rtc/v1?access_token=…` — a path *and* a query —
       * and an earlier version here stripped the leading slash and then pasted
       * the remainder in as the query string, producing
       * `…/rtc?rtc/v1?access_token=…`. The token was no longer a parameter at
       * all, LiveKit answered 401, and the SDK reported it as a socket that
       * closed during connection: three layers away from the actual mistake.
       *
       * Splicing a URL by hand is what caused that, so this no longer does. The
       * suffix is passed through untouched, which also means a future SDK that
       * calls a different path keeps working.
       */
      const suffix = url.slice(path.length);
      const target = `${upstream.replace(/\/$/, '')}${suffix}`;

      const server$ = new WebSocket(target);
      /** Frames the browser sent before the upstream was ready, with their kind. */
      const pending: { frame: Buffer; isBinary: boolean }[] = [];

      /*
       * The browser may speak before the upstream socket is open. Buffering
       * those frames rather than dropping them is what stops the handshake
       * failing intermittently under a slow link — which is every link this
       * platform targets.
       */
      /*
       * `isBinary` travels with every frame, in both directions.
       *
       * A WebSocket frame is text or binary, and the two are not
       * interchangeable: `ws` defaults to binary when told nothing, so relaying
       * without this flag turned LiveKit's text frames into binary ones and the
       * client's into the wrong kind coming back. The protocol rejects that and
       * the connection closes — reported by the SDK as "Websocket got closed
       * during a (re)connection attempt", which reads like a network fault and
       * is not one.
       *
       * A proxy that alters the frames it carries is not a proxy.
       */
      client.on('message', (data, isBinary) => {
        const frame = data as Buffer;
        if (server$.readyState === WebSocket.OPEN) server$.send(frame, { binary: isBinary });
        else pending.push({ frame, isBinary });
      });

      server$.on('open', () => {
        logger.debug(`Upstream open: ${target.slice(0, 70)}…`);
        for (const held of pending) server$.send(held.frame, { binary: held.isBinary });
        pending.length = 0;
      });

      // The close code is the whole diagnosis when LiveKit refuses a token:
      // 4001/4002 mean it rejected the join rather than the network failing.
      server$.on('close', (code, reason) => {
        logger.debug(`Upstream closed ${code} ${reason?.toString().slice(0, 80) ?? ''}`);
      });

      server$.on('message', (data, isBinary) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data as Buffer, { binary: isBinary });
        }
      });

      // Either side closing closes the other: a half-open relay leaks a socket
      // per abandoned lesson, and lessons are abandoned all the time.
      const close = () => {
        if (client.readyState === WebSocket.OPEN) client.close();
        if (server$.readyState === WebSocket.OPEN) server$.close();
      };
      client.on('close', close);
      server$.on('close', close);
      client.on('error', close);
      server$.on('error', (error) => {
        logger.error(`Upstream signalling socket failed: ${error.message}`);
        close();
      });
    });
  });

  logger.log(`Relaying LiveKit signalling at ${path} → ${upstream}`);
}
