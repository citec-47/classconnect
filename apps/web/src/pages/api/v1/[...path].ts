import type { NextApiRequest, NextApiResponse } from 'next';
import { createApp } from '../../../../../api/dist/create-app';

/**
 * The same-domain API bridge.
 *
 * The web deployment is the public ClassConnect origin. Rather than asking a
 * browser to reach a development-only `:4000` port, this catch-all Next API
 * route boots the already compiled Nest application and hands it the original
 * Node request/response pair. Nest keeps its `/api/v1` prefix, so the rest of
 * the frontend continues using exactly the existing API paths.
 *
 * `bodyParser: false` is essential: Nest owns JSON parsing and retains raw
 * bytes for signed LiveKit webhooks. Letting Next consume the stream first
 * would make valid webhook signatures impossible to verify.
 */
export const config = {
  api: { bodyParser: false },
};

type ExpressHandler = (request: NextApiRequest, response: NextApiResponse) => void;

let appPromise: Promise<ExpressHandler> | undefined;

async function app(): Promise<ExpressHandler> {
  const nest = await createApp();
  await nest.init();
  return nest.getHttpAdapter().getInstance() as ExpressHandler;
}

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse,
): Promise<void> {
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
    if (!response.writableEnded) {
      response.status(503).json({ messageKey: 'errors.service_unavailable' });
    }
  }
}
