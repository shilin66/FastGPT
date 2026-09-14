import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteCsSession, ensureCodeServerSession } from '@/service/core/sandbox/proxyUtils';

describe('code-server upstream login optimization', () => {
  const sandboxId = 'code-server-login-test';
  const target = 'http://gateway:8090/sandboxes/provider/proxy/44772/proxy/8080';
  const fetchMock = vi.fn<typeof fetch>();
  const getPassword = vi.fn<(signal: AbortSignal) => Promise<string | null>>();
  const cookieLessResponse = () => new Response(null, { status: 302, headers: { location: './' } });
  const passwordResponse = (key = 'editor-key') =>
    new Response(null, {
      status: 302,
      headers: { location: './', 'set-cookie': `code-server-session=${key}; Path=/; HttpOnly` }
    });

  beforeEach(() => {
    deleteCsSession(sandboxId);
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    getPassword.mockResolvedValue('test-only-password');
  });
  afterEach(() => {
    deleteCsSession(sandboxId);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('probes without credentials and caches a strictly scoped cookie-less redirect', async () => {
    fetchMock.mockImplementation(async () => cookieLessResponse());
    await expect(ensureCodeServerSession(sandboxId, target, getPassword)).resolves.toBeNull();
    await expect(ensureCodeServerSession(sandboxId, target, getPassword)).resolves.toBeNull();
    expect(getPassword).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${target}/login`, {
      method: 'GET',
      redirect: 'manual',
      signal: expect.any(AbortSignal)
    });
  });

  it('keeps the existing password login and cookie cache behavior', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('login form'))
      .mockResolvedValueOnce(passwordResponse());
    await expect(ensureCodeServerSession(sandboxId, target, getPassword)).resolves.toBe(
      'editor-key'
    );
    await expect(ensureCodeServerSession(sandboxId, target, getPassword)).resolves.toBe(
      'editor-key'
    );
    expect(getPassword).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(`${target}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        origin: 'http://gateway:8090'
      },
      body: 'password=test-only-password',
      redirect: 'manual',
      signal: expect.any(AbortSignal)
    });
  });

  it.each([
    '',
    'https://untrusted.example/',
    '/',
    './login',
    './?redirected=true',
    './#fragment',
    '../8081/',
    './%2e/',
    `${target.replace('provider/', 'other-provider/')}/`
  ])('does not remember an ambiguous or out-of-scope redirect: %j', async (location) => {
    fetchMock.mockImplementation(
      async () => new Response(null, { status: 302, headers: { location } })
    );
    await ensureCodeServerSession(sandboxId, target, getPassword);
    await ensureCodeServerSession(sandboxId, target, getPassword);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getPassword).not.toHaveBeenCalled();
  });

  it('does not treat a redirect setting any cookie as a cookie-less result', async () => {
    fetchMock.mockImplementation(async () => passwordResponse());
    await ensureCodeServerSession(sandboxId, target, getPassword);
    await ensureCodeServerSession(sandboxId, target, getPassword);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getPassword).not.toHaveBeenCalled();
  });

  it('does not cache failed probes', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(cookieLessResponse());
    await ensureCodeServerSession(sandboxId, target, getPassword);
    await ensureCodeServerSession(sandboxId, target, getPassword);
    await ensureCodeServerSession(sandboxId, target, getPassword);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getPassword).not.toHaveBeenCalled();
  });

  it('does not cache a password POST without the expected session cookie', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('login form'))
      .mockResolvedValueOnce(cookieLessResponse())
      .mockResolvedValueOnce(new Response('login form'))
      .mockResolvedValueOnce(passwordResponse());
    await expect(ensureCodeServerSession(sandboxId, target, getPassword)).resolves.toBeNull();
    await expect(ensureCodeServerSession(sandboxId, target, getPassword)).resolves.toBe(
      'editor-key'
    );
    expect(getPassword).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('rechecks cookie-less mode after a fixed short TTL even with intervening cache hits', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => cookieLessResponse());
    await ensureCodeServerSession(sandboxId, target, getPassword);
    await vi.advanceTimersByTimeAsync(59_000);
    await ensureCodeServerSession(sandboxId, target, getPassword);
    await vi.advanceTimersByTimeAsync(1_000);
    await ensureCodeServerSession(sandboxId, target, getPassword);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getPassword).not.toHaveBeenCalled();
  });

  it('does not reuse a login result for a changed provider endpoint', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('login form'))
      .mockResolvedValueOnce(passwordResponse())
      .mockResolvedValueOnce(new Response('login form'))
      .mockResolvedValueOnce(passwordResponse('replacement-key'));
    await expect(ensureCodeServerSession(sandboxId, target, getPassword)).resolves.toBe(
      'editor-key'
    );
    await expect(
      ensureCodeServerSession(sandboxId, `${target}-replacement`, getPassword)
    ).resolves.toBe('replacement-key');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(getPassword).toHaveBeenCalledTimes(2);
  });

  it('shares only the same target initialization across concurrent requests', async () => {
    let resolveProbe!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveProbe = resolve;
      })
    );
    const requests = Array.from({ length: 10 }, () =>
      ensureCodeServerSession(sandboxId, target, getPassword)
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveProbe(cookieLessResponse());
    expect(await Promise.all(requests)).toEqual(Array(10).fill(null));
    expect(getPassword).not.toHaveBeenCalled();
  });

  it('performs only one password read and login POST for concurrent password-mode requests', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('login form'))
      .mockResolvedValueOnce(passwordResponse());
    const results = await Promise.all(
      Array.from({ length: 10 }, () => ensureCodeServerSession(sandboxId, target, getPassword))
    );
    expect(results).toEqual(Array(10).fill('editor-key'));
    expect(getPassword).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(['probe', 'password', 'login'] as const)(
    'bounds a stalled %s and releases its pending initialization for retry',
    async (stage) => {
      vi.useFakeTimers();
      const stalled = new Promise<never>(() => {});
      if (stage === 'probe') fetchMock.mockReturnValueOnce(stalled);
      else {
        fetchMock.mockResolvedValueOnce(new Response('login form'));
        if (stage === 'password') getPassword.mockReturnValueOnce(stalled);
        else fetchMock.mockReturnValueOnce(stalled);
      }
      const pending = ensureCodeServerSession(sandboxId, target, getPassword);
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(pending).resolves.toBeNull();
      const signal =
        stage === 'password'
          ? getPassword.mock.lastCall?.[0]
          : fetchMock.mock.lastCall?.[1]?.signal;
      expect(signal?.aborted).toBe(true);
      fetchMock.mockResolvedValueOnce(cookieLessResponse());
      await expect(ensureCodeServerSession(sandboxId, target, getPassword)).resolves.toBeNull();
      expect(fetchMock.mock.lastCall?.[1]?.method).toBe('GET');
    }
  );

  it.each(['eviction', 'target change'] as const)(
    'does not let an older pending probe repopulate the cache after %s',
    async (change) => {
      let resolveProbe!: (response: Response) => void;
      fetchMock.mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveProbe = resolve;
        })
      );
      const oldRequest = ensureCodeServerSession(sandboxId, target, getPassword);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      if (change === 'eviction') deleteCsSession(sandboxId);
      const nextTarget = change === 'target change' ? `${target}-replacement` : target;
      fetchMock
        .mockResolvedValueOnce(new Response('login form'))
        .mockResolvedValueOnce(passwordResponse('new-key'));
      await expect(ensureCodeServerSession(sandboxId, nextTarget, getPassword)).resolves.toBe(
        'new-key'
      );
      resolveProbe(cookieLessResponse());
      await oldRequest;
      await expect(ensureCodeServerSession(sandboxId, nextTarget, getPassword)).resolves.toBe(
        'new-key'
      );
      expect(fetchMock).toHaveBeenCalledTimes(3);
    }
  );
});
