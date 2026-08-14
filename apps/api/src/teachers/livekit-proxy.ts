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
   * `prependListener`, not `on`.
   *
   * Nest's Socket.IO adapter attaches its own `upgrade` handler and destroys
   * any socket whose path it does not recognise — so a listener added after it
   * never runs, and the browser sees the connection hang up with no error
   * logged anywhere. Going first means this path is claimed before Socket.IO
   * gets the chance to reject it.
   */
  server.prependListener('upgrade', (request, socket: Duplex, head) => {
    const url = request.url ?? '';
    if (!url.startsWith(path)) return;

    logger.debug(`Relaying signalling for ${url.slice(0, 60)}…`);

    wss.handleUpgrade(request, socket, head, (client) => {
      /*
       * The query string is carried across untouched.
       *
       * LiveKit puts the access token, the protocol version and the client's
       * capabilities there. Rebuilding it would mean tracking every parameter
       * the SDK adds in future versions; passing it through means this proxy
       * keeps working when the SDK changes.
       */
      const query = url.slice(path.length).replace(/^\/?/, '');
      const target = `${upstream.replace(/\/$/, '')}/rtc${query ? `?${query.replace(/^\?/, '')}` : ''}`;

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
