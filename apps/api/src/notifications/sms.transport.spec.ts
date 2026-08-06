import { ConfigService } from '@nestjs/config';
import { SmsTransport } from './sms.transport';

/**
 * SI-007 delivery behaviour, and the NFR-DEP-001 resilience around it:
 * explicit timeout, bounded retry with backoff and jitter, circuit breaker.
 */

function transportWith(env: Record<string, string | undefined>): SmsTransport {
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  return new SmsTransport(config);
}

const CONFIGURED = {
  SMS_PROVIDER_URL: 'https://sms.example/send',
  SMS_PROVIDER_TOKEN: 'test-token',
  SMS_SENDER_ID: 'ClassConnect',
  // Keep the suite fast: backoff is capped by attempt count, not by sleeping.
  SMS_MAX_ATTEMPTS: '2',
  SMS_TIMEOUT_MS: '1000',
};

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('configuration', () => {
  it('is unconfigured without both a URL and a token', () => {
    expect(transportWith({}).configured).toBe(false);
    expect(transportWith({ SMS_PROVIDER_URL: 'https://x' }).configured).toBe(false);
    expect(transportWith({ SMS_PROVIDER_TOKEN: 'x' }).configured).toBe(false);
    expect(transportWith(CONFIGURED).configured).toBe(true);
  });

  it('reports not_configured rather than attempting a send', async () => {
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;

    const result = await transportWith({}).send('+237677123456', 'hello');

    expect(result).toEqual({ status: 'failed', reason: 'not_configured', retryable: false });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('sending', () => {
  it('posts the message with a bearer token and returns the provider reference', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messageId: 'abc-123' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await transportWith(CONFIGURED).send('+237677123456', 'Your code is 123456');

    expect(result).toMatchObject({ status: 'sent', providerRef: 'abc-123', encoding: 'GSM-7' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sms.example/send');
    expect(init.headers.authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual({
      to: '+237677123456',
      from: 'ClassConnect',
      text: 'Your code is 123456',
    });
    // NFR-DEP-001: an explicit timeout on every external call.
    expect(init.signal).toBeDefined();
  });

  it('transliterates French typography before sending', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await transportWith(CONFIGURED).send('+237677123456', 'l’équipe répond…');

    expect(result).toMatchObject({ status: 'sent', encoding: 'GSM-7' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toBe("l'équipe répond...");
  });

  it('tolerates a provider that returns no message id', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }) as unknown as typeof fetch;

    const result = await transportWith(CONFIGURED).send('+237677123456', 'hi');
    expect(result).toMatchObject({ status: 'sent', providerRef: null });
  });
});

describe('retry policy — NFR-DEP-001', () => {
  it('does not retry a client rejection', async () => {
    // A malformed number is rejected identically every time; retrying only
    // costs latency and, on some aggregators, money.
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 400 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await transportWith(CONFIGURED).send('+237677123456', 'hi');

    expect(result).toMatchObject({ status: 'failed', reason: 'http_400' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a server error up to the configured limit', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await transportWith(CONFIGURED).send('+237677123456', 'hi');

    expect(result).toMatchObject({ status: 'failed', reason: 'http_503' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries rate limiting and request timeout, which are transient', async () => {
    for (const status of [408, 429]) {
      const fetchMock = jest.fn().mockResolvedValue({ ok: false, status });
      global.fetch = fetchMock as unknown as typeof fetch;
      await transportWith(CONFIGURED).send('+237677123456', 'hi');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  });

  it('succeeds on a retry after a transient failure', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'second-try' }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await transportWith(CONFIGURED).send('+237677123456', 'hi');

    expect(result).toMatchObject({ status: 'sent', providerRef: 'second-try' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a timeout distinctly from a network error', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new DOMException('timed out', 'TimeoutError')) as unknown as typeof fetch;

    const result = await transportWith(CONFIGURED).send('+237677123456', 'hi');
    expect(result).toMatchObject({ status: 'failed', reason: 'timeout' });
  });

  it('never throws, whatever the provider does', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('socket blew up')) as unknown as typeof fetch;

    await expect(transportWith(CONFIGURED).send('+237677123456', 'hi')).resolves.toMatchObject({
      status: 'failed',
      reason: 'network_error',
    });
  });
});

describe('circuit breaker — NFR-DEP-001', () => {
  it('opens after repeated failures and then fails fast', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 400 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const transport = transportWith(CONFIGURED);

    // Five non-retryable failures reach the threshold.
    for (let i = 0; i < 5; i++) await transport.send('+237677123456', 'hi');
    expect(transport.health.breaker).toBe('open');

    const callsBefore = fetchMock.mock.calls.length;
    const result = await transport.send('+237677123456', 'hi');

    expect(result).toEqual({ status: 'failed', reason: 'circuit_open', retryable: true });
    // Fails fast: the provider is not contacted at all.
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('closes again once the provider recovers', async () => {
    const transport = transportWith(CONFIGURED);

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 }) as unknown as typeof fetch;
    for (let i = 0; i < 5; i++) await transport.send('+237677123456', 'hi');
    expect(transport.health.breaker).toBe('open');

    // Jump past the cooldown so a probe is admitted.
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }) as unknown as typeof fetch;

    const result = await transport.send('+237677123456', 'hi');

    expect(result).toMatchObject({ status: 'sent' });
    expect(transport.health.breaker).toBe('closed');
    expect(transport.health.consecutiveFailures).toBe(0);
  });

  it('stays closed while the provider is healthy', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }) as unknown as typeof fetch;

    const transport = transportWith(CONFIGURED);
    for (let i = 0; i < 10; i++) await transport.send('+237677123456', 'hi');

    expect(transport.health.breaker).toBe('closed');
  });
});
