import { All, Controller, Logger, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../rbac/decorators';

/**
 * The HTTP half of the LiveKit relay.
 *
 * `livekit-client` does not only open a WebSocket. Before it does, it `fetch`es
 * `/rtc/validate` on the same host to check the token and learn the server's
 * capabilities — and it derives that URL from the WebSocket address it was
 * given. Point the client at `ws://localhost:4000/livekit` and it will call
 * `http://localhost:4000/livekit/rtc/validate`.
 *
 * Relaying the socket without relaying that call leaves the client fetching a
 * path this API does not serve, which fails exactly as a blocked third-party
 * request does: `could not establish signal connection: Failed to fetch`. The
 * two halves have to travel together or neither works.
 *
 * ## Public by necessity, and safe
 *
 * No session of ours guards this: the caller is `livekit-client`, which knows
 * about LiveKit's token and nothing about our cookies. What protects it is that
 * it proxies one fixed upstream and forwards a token LiveKit itself validates —
 * an unsigned or expired one is refused there, exactly as if the browser had
 * called LiveKit directly. Nothing here can reach any other host, and no key of
 * ours is exposed: the LiveKit secret never leaves the API.
 */
@Controller('livekit')
export class LiveKitProxyController {
  private readonly logger = new Logger(LiveKitProxyController.name);

  /**
   * Forwards every HTTP path under `/livekit` to the media server.
   *
   * `All` and a wildcard rather than a route per endpoint: the client's HTTP
   * surface is LiveKit's to change, and enumerating it here would mean this
   * relay breaking on an SDK upgrade for no reason anybody could guess.
   */
  @Public()
  @All('*path')
  async relay(@Req() request: Request, @Res() response: Response): Promise<void> {
    const upstream = process.env.LIVEKIT_URL;
    if (!upstream) {
      response.status(503).json({ messageKey: 'errors.live.not_configured' });
      return;
    }

    /*
     * `/livekit/rtc/validate?x=1` → `https://…livekit.cloud/rtc/validate?x=1`.
     *
     * The query string is carried across untouched — it holds the access token
     * and the client's protocol version, and rebuilding it would mean tracking
     * every parameter a future SDK adds.
     */
    const suffix = request.originalUrl.replace(/^.*\/livekit/, '');
    const target = upstream.replace(/^ws/, 'http').replace(/\/$/, '') + suffix;

    try {
      const upstreamResponse = await fetch(target, {
        method: request.method,
        headers: { accept: request.headers.accept ?? '*/*' },
        signal: AbortSignal.timeout(15_000),
      });

      const body = await upstreamResponse.text();
      response
        .status(upstreamResponse.status)
        .type(upstreamResponse.headers.get('content-type') ?? 'text/plain')
        .send(body);
    } catch (error) {
      /*
       * The API could not reach LiveKit — which is a different failure from the
       * browser being unable to, and says so, because the remedies are nothing
       * alike.
       */
      this.logger.error(`Relay to ${target.slice(0, 80)} failed: ${(error as Error).message}`);
      response.status(502).json({ messageKey: 'errors.live.upstream_unreachable' });
    }
  }
}
