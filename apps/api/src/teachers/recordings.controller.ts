import { Controller, Get, Header, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../rbac/decorators';
import { uuidParam } from '../common/zod-validation.pipe';
import { RecordingsService } from './recordings.service';

/**
 * The playlist a video player asks for.
 *
 * ## Why this is not behind the session
 *
 * `<video>` and hls.js fetch media without the session cookie or the bearer
 * token, so a guarded route would return 401 to the player and nothing would
 * ever play. The entitlement check therefore happens where credentials exist —
 * on `…/recordings/:id/url` — and its result travels here as a signed ticket
 * naming one recording and one user.
 *
 * That is not the interface hiding something. The ticket is minted only after
 * the same server-side check that guards the list, it is signed with the API's
 * own secret, it expires with the segment links, and it is worthless for any
 * other recording. A student who is not entitled cannot obtain one, and cannot
 * make one.
 *
 * ## Why the segments do not come through here
 *
 * The playlist is a few kilobytes and is rewritten per request. The segments are
 * the lesson — hundreds of megabytes — and go straight from the store to the
 * browser on their own signed URLs. Proxying those would put every viewer's
 * video through this process, and this process has a class to run.
 */
@Controller('recordings')
export class RecordingsController {
  constructor(private readonly recordings: RecordingsService) {}

  @Public()
  @Get(':recordingId/playlist.m3u8')
  @Header('content-type', 'application/vnd.apple.mpegurl')
  /*
   * Never cached. The playlist holds signed URLs that expire, so a stored copy
   * becomes a page of dead links — and on a shared machine it would also be a
   * copy of one child's lesson left for the next person to open.
   */
  @Header('cache-control', 'no-store')
  async playlist(
    @Param('recordingId', uuidParam()) recordingId: string,
    @Query('t') ticket: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const body = await this.recordings.playlist(recordingId, ticket ?? '');
    response.status(200);
    return body;
  }
}
