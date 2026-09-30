/**
 * Connecting to a backend.
 *
 * Where the editor gets a working storage adapter. Three paths, in order of how little they ask of
 * the author: a local folder (no server, no token), a local proxy (works in every browser), or
 * GitHub (shared, needs a token). The config picks which are offered.
 */
import { useEffect, useState } from 'react';
import {
  beginOAuth,
  FileSystemAdapter,
  handleStore,
  hasPermission,
  pickDirectory,
  ProxyAdapter,
  requestPermission,
  supportsFileSystemAccess,
  tokenStore,
  verifyToken,
  type StorageAdapter,
  type TokenStorage,
} from '@v7-cms/adapters';
import type { CMSConfig } from '@v7-cms/core';
import { useTranslate, type Translate } from '../i18n/index.js';

/** A backend is ready. `via` is only meaningful for a backend that holds a credential. */
type ReadyHandler = (adapter: StorageAdapter, via?: 'oauth' | 'token') => void;

export interface ConnectProps {
  config: CMSConfig;
  /**
   * Called with a working backend. `via` records how the session was obtained, which the account
   * panel needs to explain what signing out will drop.
   */
  onReady: ReadyHandler;
}

type Tab = 'folder' | 'proxy' | 'github' | 'token';

export function Connect({ config, onReady }: ConnectProps) {
  const t = useTranslate();
  const wantsLocal = config.backend.name === 'local';
  const localKind = config.backend.local?.kind;
  const proxyURL = config.backend.local?.url ?? 'http://127.0.0.1:5177';

  const tabs: Tab[] = wantsLocal
    ? localKind === 'proxy'
      ? ['proxy']
      : ['folder', 'proxy']
    : config.backend.authBase
      ? ['github', 'token']
      : ['token'];

  const [tab, setTab] = useState<Tab>(tabs[0]!);

  return (
    <div className="connect">
      <h1>
        {config.backend.name === 'github'
          ? t('connect.openRepo', { repo: config.backend.repo ?? '' })
          : t('connect.openLocal')}
      </h1>
      {tabs.length > 1 && (
        <div className="view-switch" role="tablist" aria-label={t('connect.howTo')}>
          {tabs.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              onClick={() => setTab(name)}
            >
              {label(name, t)}
            </button>
          ))}
        </div>
      )}
      {tab === 'folder' && <FolderConnect onReady={onReady} />}
      {tab === 'proxy' && <ProxyConnect url={proxyURL} onReady={onReady} />}
      {tab === 'github' && <GitHubOAuth config={config} onReady={onReady} />}
      {tab === 'token' && <TokenConnect config={config} onReady={onReady} />}
    </div>
  );
}

function label(tab: Tab, t: Translate): string {
  switch (tab) {
    case 'folder':
      return t('connect.tabFolder');
    case 'proxy':
      return t('connect.tabProxy');
    case 'github':
      return t('connect.tabGithub');
    case 'token':
      return t('connect.tabToken');
  }
}

/** The nicest local mode: no server and no token, where the browser supports it. */
function FolderConnect({ onReady }: { onReady: ReadyHandler }) {
  const t = useTranslate();
  const [error, setError] = useState<string | null>(null);
  const [remembered, setRemembered] = useState<FileSystemDirectoryHandle | null>(null);

  useEffect(() => {
    // Offer the folder from last time if the browser still grants access to it.
    void (async () => {
      const handle = await handleStore.load();
      if (handle && (await hasPermission(handle))) setRemembered(handle);
    })();
  }, []);

  const open = async (handle: FileSystemDirectoryHandle, persist: boolean) => {
    setError(null);
    if (persist) await handleStore.save(handle);
    onReady(new FileSystemAdapter(handle));
  };

  if (!supportsFileSystemAccess()) {
    return <p className="notice">{t('connect.noFileSystem')}</p>;
  }

  return (
    <div>
      <p className="notice">{t('connect.folderHint')}</p>
      {remembered && (
        <p>
          <button
            type="button"
            className="button primary"
            onClick={async () => {
              // Permission may have lapsed since last time; the API needs a gesture to renew it.
              if (!(await requestPermission(remembered))) {
                setError(t('connect.folderDenied'));
                return;
              }
              await open(remembered, false);
            }}
          >
            {t('connect.reopenFolder')}
          </button>{' '}
          <button
            type="button"
            className="button"
            onClick={() => {
              void handleStore.clear();
              setRemembered(null);
            }}
          >
            {t('connect.forgetFolder')}
          </button>
        </p>
      )}
      <p>
        <button
          type="button"
          className="button primary"
          onClick={async () => {
            try {
              const handle = await pickDirectory();
              await open(handle, true);
            } catch (problem) {
              // Cancelling the picker is not an error worth shouting about.
              if ((problem as Error).name !== 'AbortError') setError((problem as Error).message);
            }
          }}
        >
          {t('connect.chooseFolder')}
        </button>
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** The mode that works in every browser, at the cost of running one small local process. */
function ProxyConnect({ url, onReady }: { url: string; onReady: ReadyHandler }) {
  const t = useTranslate();
  const [address, setAddress] = useState(url);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serving, setServing] = useState<string | null>(null);

  // Ask the proxy what it serves, so the author can confirm it is the right folder.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${address.replace(/\/$/, '')}/api/health`);
        if (!response.ok) return;
        const info = (await response.json()) as { repo?: string };
        if (!cancelled) setServing(info.repo ?? null);
      } catch {
        if (!cancelled) setServing(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const adapter = new ProxyAdapter({ url: address.trim(), token: token.trim() });
      await adapter.init();
      onReady(adapter);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void connect(event)}>
      <p className="notice">{t('connect.proxyCommand')}</p>
      <label className="field-label" htmlFor="proxy-url">
        {t('connect.proxyUrl')}
      </label>
      <input
        id="proxy-url"
        className="input"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
      />
      {serving && <p className="field-hint">{t('connect.serving', { repo: serving })}</p>}

      <label className="field-label" htmlFor="proxy-token">
        {t('connect.proxyToken')}
      </label>
      <input
        id="proxy-token"
        className="input"
        type="password"
        autoComplete="off"
        value={token}
        onChange={(event) => setToken(event.target.value)}
      />

      <p>
        <button type="submit" className="button primary" disabled={busy || !token.trim()}>
          {busy ? t('connect.connecting') : t('connect.connect')}
        </button>
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function GitHubOAuth({ config, onReady }: { config: CMSConfig; onReady: ReadyHandler }) {
  const t = useTranslate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <p className="notice">{t('connect.githubNotice')}</p>
      <p>
        <button
          type="button"
          className="button primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const { authBase, authEndpoint } = config.backend;
              const session = await beginOAuth({
                authBase: authBase!,
                ...(authEndpoint ? { authEndpoint } : {}),
              });
              tokenStore.write(session.token);
              onReady(await githubAdapter(config, session.token, 'oauth'), 'oauth');
            } catch (problem) {
              setError((problem as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t('connect.waiting') : t('connect.signIn')}
        </button>
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function TokenConnect({ config, onReady }: { config: CMSConfig; onReady: ReadyHandler }) {
  const t = useTranslate();
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Checked immediately, so a wrong token fails here rather than on the first save.
      const session = await verifyToken(token.trim());
      tokenStore.write(session.token, (remember ? 'local' : 'session') as TokenStorage);
      onReady(await githubAdapter(config, session.token, 'token'), 'token');
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <label className="field-label" htmlFor="token">
        {t('connect.patLabel')}
      </label>
      <input
        id="token"
        className="input"
        type="password"
        autoComplete="off"
        value={token}
        placeholder="github_pat_… or ghp_…"
        onChange={(event) => setToken(event.target.value)}
      />
      <p className="field-hint">{t('connect.patHint')}</p>
      <label className="toggle">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
        />
        <span>{t('connect.remember')}</span>
      </label>
      <p>
        <button type="submit" className="button primary" disabled={busy || token.trim() === ''}>
          {busy ? t('connect.checking') : t('connect.connect')}
        </button>
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/** Build the GitHub adapter from the config, so both auth paths share the wiring. */
async function githubAdapter(
  config: CMSConfig,
  token: string,
  via: 'oauth' | 'token',
): Promise<StorageAdapter> {
  const { GitHubAdapter } = await import('@v7-cms/adapters');
  const [owner, repo] = (config.backend.repo ?? '').split('/') as [string, string];
  return new GitHubAdapter({
    owner,
    repo,
    ...(config.backend.branch ? { branch: config.backend.branch } : {}),
    token,
    via,
  });
}
