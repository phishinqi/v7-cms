import { describe, expect, it, vi, afterEach } from 'vitest';
import { beginOAuth, verifyToken, tokenStore } from '../src/github/auth.js';

afterEach(() => vi.unstubAllGlobals());

describe('token verification', () => {
  it('returns the login for a good token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ login: 'octocat' }));
    const session = await verifyToken('good', { fetch: fetchMock });
    expect(session).toEqual({ token: 'good', origin: 'token', login: 'octocat' });
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer good' });
  });

  it('explains a rejected token rather than reporting a bare status', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ message: 'Bad credentials' }, { status: 401 }));
    await expect(verifyToken('bad', { fetch: fetchMock })).rejects.toThrow(/rejected by GitHub/);
  });

  it('reports other failures with the status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({}, { status: 500 }));
    await expect(verifyToken('x', { fetch: fetchMock })).rejects.toThrow(/500/);
  });
});

describe('oauth popup flow', () => {
  /** A window stand-in that records listeners so the test can post a message back. */
  function fakeWindow() {
    const listeners: Array<(event: MessageEvent) => void> = [];
    const popup = { closed: false, focus: vi.fn(), close: vi.fn() };
    const open = vi.fn(() => popup);
    vi.stubGlobal('window', {
      location: { origin: 'https://site.example' },
      open,
      addEventListener: (_type: string, listener: (event: MessageEvent) => void) =>
        listeners.push(listener),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('setInterval', () => 1 as unknown as NodeJS.Timeout);
    vi.stubGlobal('clearInterval', vi.fn());
    return {
      open,
      popup,
      reply: (origin: string, data: string) =>
        listeners.forEach((listener) => listener({ origin, data } as MessageEvent)),
    };
  }

  it('honours a relay mounted under a prefix', async () => {
    // A relay served by the host site's own functions lives at `/api/auth`, not `/auth`. The
    // editor reads this from the config; without it the sign-in popup is a 404.
    const win = fakeWindow();
    void beginOAuth({ authBase: 'https://relay.example', authEndpoint: 'api/auth' });
    const url = new URL(win.open.mock.calls[0]![0] as unknown as string);
    expect(url.pathname).toBe('/api/auth');
    expect(url.searchParams.get('provider')).toBe('github');
  });

  it('tolerates a trailing slash on the relay base', async () => {
    const win = fakeWindow();
    void beginOAuth({ authBase: 'https://relay.example/', authEndpoint: 'api/auth' });
    const url = new URL(win.open.mock.calls[0]![0] as unknown as string);
    // A doubled slash would still resolve, but it is not the URL the relay expects to match.
    expect(url.pathname).toBe('/api/auth');
  });

  it('opens the relay with the site id and resolves with the token', async () => {
    const win = fakeWindow();
    const promise = beginOAuth({ authBase: 'https://relay.example' });
    expect(win.open).toHaveBeenCalledOnce();
    const url = new URL(win.open.mock.calls[0]![0] as unknown as string);
    expect(url.origin).toBe('https://relay.example');
    expect(url.pathname).toBe('/auth');
    expect(url.searchParams.get('provider')).toBe('github');
    expect(url.searchParams.get('site_id')).toBe('https://site.example');

    win.reply(
      'https://relay.example',
      `authorization:github:success:${JSON.stringify({ token: 'abc', provider: 'github' })}`,
    );
    await expect(promise).resolves.toEqual({ token: 'abc', origin: 'oauth' });
    expect(win.popup.close).toHaveBeenCalled();
  });

  it('ignores a reply from another origin', async () => {
    const win = fakeWindow();
    const promise = beginOAuth({ authBase: 'https://relay.example' });
    // A hostile page must not be able to hand the editor a token.
    win.reply(
      'https://attacker.example',
      `authorization:github:success:${JSON.stringify({ token: 'stolen' })}`,
    );
    win.reply(
      'https://relay.example',
      `authorization:github:success:${JSON.stringify({ token: 'real' })}`,
    );
    await expect(promise).resolves.toMatchObject({ token: 'real' });
  });

  it('ignores a malformed reply rather than resolving with nothing', async () => {
    const win = fakeWindow();
    const promise = beginOAuth({ authBase: 'https://relay.example' });
    win.reply('https://relay.example', 'authorization:github:success:not json');
    await expect(promise).rejects.toThrow(/could not be read/);
  });

  it('does not resolve on an unrelated message', async () => {
    const win = fakeWindow();
    const promise = beginOAuth({ authBase: 'https://relay.example' });
    win.reply('https://relay.example', 'something else');
    win.reply(
      'https://relay.example',
      `authorization:github:success:${JSON.stringify({ token: 'ok' })}`,
    );
    await expect(promise).resolves.toMatchObject({ token: 'ok' });
  });

  it('reports a blocked popup', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'https://site.example' },
      open: () => null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    await expect(beginOAuth({ authBase: 'https://relay.example' })).rejects.toThrow(/blocked/);
  });

  it('rejects when the popup is closed before authorising', async () => {
    const win = fakeWindow();
    vi.stubGlobal('setInterval', (handler: () => void) => {
      // Run the closed-window check immediately.
      win.popup.closed = true;
      handler();
      return 1 as unknown as NodeJS.Timeout;
    });
    await expect(beginOAuth({ authBase: 'https://relay.example' })).rejects.toThrow(/cancelled/);
  });
});

describe('token storage', () => {
  it('keeps a token in the session by default and forgets it on clear', () => {
    const session = new Map<string, string>();
    const local = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => void session.set(key, value),
      removeItem: (key: string) => void session.delete(key),
    });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => void local.set(key, value),
      removeItem: (key: string) => void local.delete(key),
    });

    expect(tokenStore.read()).toBeUndefined();
    tokenStore.write('abc');
    expect(tokenStore.read()).toBe('abc');
    // Not in localStorage unless persistence was asked for.
    expect(local.size).toBe(0);

    tokenStore.write('persisted', 'local');
    expect(local.get('v7-cms-token')).toBe('persisted');

    tokenStore.clear();
    expect(tokenStore.read()).toBeUndefined();
    expect(local.size).toBe(0);
  });

  it('survives storage being unavailable, as in private mode', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    expect(tokenStore.read()).toBeUndefined();
    expect(() => tokenStore.write('x')).not.toThrow();
    expect(() => tokenStore.clear()).not.toThrow();
  });
});
