import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../rbac/decorators';
import { LiveKitWebhookService } from './livekit-webhook.service';

/**
 * Where LiveKit tells us who was in the room, and for how long.
 *
 * ## Public, and not unguarded
 *
 * LiveKit has no session with this platform, so no cookie or bearer token can
 * gate this route. What gates it is the signature in the `Authorization` header,
 * verified against the API secret before anything is read from the body. Anyone
 * may POST here; only LiveKit can POST something that verifies.
 *
 * ## Always 200 once the signature holds
 *
 * LiveKit retries anything that is not a 2xx, with backoff. An event we cannot
 * use — or a session row that no longer exists — is acknowledged rather than
 * refused, because refusing it would put this endpoint in a retry loop over
 * something no amount of retrying will change. A bad signature is the one case
 * that gets a refusal, and it should never be retried either.
 */
@Controller('livekit')
export class LiveKitWebhookController {
  constructor(private readonly webhooks: LiveKitWebhookService) {}

  @Public()
  @Post('webhook')
  /*
   * 200 rather than Nest's default 201 for a POST. LiveKit treats any 2xx as
   * delivered, so this is cosmetic — but a webhook log full of 201s invites the
   * question of what was created, and nothing was.
   */
  @HttpCode(200)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('authorization') authorization?: string,
  ): Promise<{ ok: true }> {
    /*
     * `rawBody`, not `body`. The signature covers the bytes LiveKit sent, and a
     * re-serialised object is a different set of bytes — see the service.
     */
    await this.webhooks.handle(request.rawBody, authorization);
    return { ok: true };
  }
}
