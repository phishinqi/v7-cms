/**
 * Authentication for the GitHub backend.
 *
 * Two flows, and the CMS supports both because they suit different people:
 *
 * - A personal access token: paste it once, no server involved. Right for a local editor or a
 *   single author who does not want to run an OAuth relay.
 * - OAuth: the CMS opens a popup to a relay that holds the client secret, and receives the token
 *   back over `postMessage`. Right for a deployed editor where authors should not handle tokens.
 *
 * The CMS never holds a client secret: that belongs on the relay, which is what makes the OAuth
 * flow safe to ship in a static bundle.
 */

export interface AuthSession {
  token: string;
  /** Where the token came from, so the UI can explain what will happen if it is dropped. */
  origin: 'token' | 'oauth';
  /** Login name, when the backend could be asked. */
  login?: string;
}

export interface OAuthOptions {
  /** Origin of the relay that performs the token exchange, e.g. `https://example.com`. */
  authBase: string;
  /** Endpoint path on that relay. Defaults to `auth`. */
  authEndpoint?: string;
  /** Where the editor lives, checked against the relay's reply. Defaults to `location.origin`. */
  siteOrigin?: string;
}

/** Decap's message shape, which relays in the wild already speak. */
const SUCCESS_PREFIX = 'authorization:github:success:';

/**
 * Runs the popup handshake. Resolves with the token, or rejects with something worth showing the
 * author — a closed window and a refused permission are different problems.
 */
export function beginOAuth(options: OAuthOptions): Promise<AuthSession> {
  const siteOrigin = options.siteOrigin ?? window.location.origin;
  const url = new URL(`${options.authBase.replace(/\/$/, '')}/${options.authEndpoint ?? 'auth'}`);
  url.searchParams.set('provider', 'github');
  url.searchParams.set('site_id', siteOrigin);

  return new Promise((resolve, reject) => {
    const popup = window.open(url.href, 'v7-cms-oauth', 'width=720,height=820');
    if (!popup) {
      reject(new Error('The sign-in window was blocked. Allow popups and try again.'));
      return;
    }

    const timer: { id?: ReturnType<typeof setInterval> } = {};
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (timer.id !== undefined) clearInterval(timer.id);
    };

    const onMessage = (event: MessageEvent) => {
      // Only the relay may answer, and only into this window.
      if (event.origin !== new URL(options.authBase).origin) return;
      if (typeof event.data !== 'string') return;
      if (event.data === 'authorizing:github') {
        popup.focus();
        return;
      }
      if (!event.data.startsWith(SUCCESS_PREFIX)) return;
      cleanup();
      popup.close();
      try {
        const payload = JSON.parse(event.data.slice(SUCCESS_PREFIX.length)) as { token?: string };
        if (!payload.token) throw new Error('no token');
        resolve({ token: payload.token, origin: 'oauth' });
      } catch {
        reject(new Error('The sign-in reply could not be read.'));
      }
    };

    window.addEventListener('message', onMessage);
    // Detect the author closing the window rather than hanging forever.
    timer.id = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error('Sign-in was cancelled.'));
      }
    }, 500);
  });
}

/** Verify a token and return its owner, so a wrong token fails immediately and visibly. */
export async function verifyToken(
  token: string,
  options: { apiRoot?: string; fetch?: typeof globalThis.fetch } = {},
): Promise<AuthSession> {
  const base = options.fetch ?? globalThis.fetch;
  // A detached `fetch` loses its receiver, which the browser rejects as an illegal invocation.
  const request = base === globalThis.fetch ? base.bind(globalThis) : base;
  const apiRoot = options.apiRoot ?? 'https://api.github.com';
  const response = await request(`${apiRoot}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? 'That token was rejected by GitHub.'
        : `GitHub returned ${response.status} while checking the token.`,
    );
  }
  const user = (await response.json()) as { login?: string };
  return { token, origin: 'token', ...(user.login ? { login: user.login } : {}) };
}

/**
 * Where a token is kept. `session` is the default because it dies with the tab: a token in
 * `localStorage` outlives the session on a shared machine, and there is no way to encrypt it in a
 * browser that would not be theatre.
 */
export type TokenStorage = 'session' | 'local';
const KEY = 'v7-cms-token';

export const tokenStore = {
  read(storage: TokenStorage = 'session'): string | undefined {
    try {
      return (storage === 'local' ? localStorage : sessionStorage).getItem(KEY) ?? undefined;
    } catch {
      return undefined;
    }
  },
  write(token: string, storage: TokenStorage = 'session'): void {
    try {
      (storage === 'local' ? localStorage : sessionStorage).setItem(KEY, token);
    } catch {
      /* Private mode: the session still works until the page is closed. */
    }
  },
  clear(): void {
    try {
      sessionStorage.removeItem(KEY);
      localStorage.removeItem(KEY);
    } catch {
      /* Nothing to clear. */
    }
  },
};
