/**
 * The application shell: config loading, backend selection and the store, handed to the views
 * through context. Everything the UI needs is assembled here so views stay presentational.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadConfig, type CMSConfig, type ConfigIssue } from '@v7-cms/core';
import type { AccountInfo } from '@v7-cms/core/storage';
import type { Locale } from './i18n/index.js';
import { MemoryAdapter } from '@v7-cms/adapters/memory';
import { GitHubAdapter, tokenStore } from '@v7-cms/adapters';
import type { StorageAdapter } from '@v7-cms/core/storage';
import { EntryStore } from './entry-store.js';
import { Connect } from './frame/Connect.js';
import { TranslateProvider, resolveLocale, useTranslator } from './i18n/index.js';

export interface AppContextValue {
  config: CMSConfig;
  /** Absent until a backend is connected; the connect screen is shown in that case. */
  store?: EntryStore;
  storage?: StorageAdapter;
  issues: ConfigIssue[];
  /** The language the editor chrome speaks, from `config.locale`. */
  locale: Locale;
  /** Who the backend acts as, when it can say. Absent for a folder or the memory backend. */
  account?: AccountInfo;
  /** Replaces the backend once the author has connected one. */
  connect?(adapter: StorageAdapter, via?: 'oauth' | 'token'): void;
  /**
   * Drop the session and return to the connect screen. Clears a stored token, then forgets the
   * adapter. A backend that owns no credential — a folder — still disconnects, because the author
   * asked to leave rather than to keep editing.
   */
  disconnect?(): void;
}

const AppContext = createContext<AppContextValue | null>(null);

export interface CmsAppProps {
  /** The parsed config. Passing it in keeps the app usable without a build step. */
  config: unknown;
  /** A ready backend. When omitted, a memory backend seeded from `config.backend.local.files`. */
  storage?: StorageAdapter;
  children?: ReactNode;
}

export function CmsApp({ config: rawConfig, storage, children }: CmsAppProps) {
  const { config, issues } = useMemo(() => loadConfig(rawConfig), [rawConfig]);
  // A backend the author connected, or one that needs no interaction at all.
  const [connected, setConnected] = useState<StorageAdapter | undefined>(() =>
    autoAdapter(config, storage),
  );
  const [account, setAccount] = useState<AccountInfo | undefined>();
  // Set once the author signs out, so `autoAdapter` cannot immediately sign them back in from the
  // token still sitting in storage.
  const [signedOut, setSignedOut] = useState(false);

  const adapter = signedOut ? undefined : (connected ?? autoAdapter(config, storage));

  const locale = resolveLocale(config.locale);
  const translate = useTranslator(locale);

  // Ask the backend who it is, once per adapter. A backend without an account — or one whose
  // lookup fails — simply leaves the panel off rather than blocking the editor.
  useEffect(() => {
    let cancelled = false;
    setAccount(undefined);
    if (!adapter?.account) return;
    void adapter
      .account()
      .then((info) => {
        if (!cancelled) setAccount(info);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  const value = useMemo<AppContextValue>(
    () =>
      adapter
        ? {
            config,
            issues,
            locale,
            storage: adapter,
            store: new EntryStore(adapter, config.collections),
            ...(account ? { account } : {}),
            connect: setConnected,
            disconnect: () => {
              tokenStore.clear();
              setSignedOut(true);
              setConnected(undefined);
              setAccount(undefined);
            },
          }
        : { config, issues, locale, connect: setConnected },
    [config, issues, adapter, locale, account],
  );

  // A backend that needs credentials waits behind the connect screen rather than showing an
  // empty, misleading list.
  if (!adapter && issues.length === 0) {
    return (
      <TranslateProvider value={translate}>
        <AppContext.Provider value={value}>
          <Connect config={config} onReady={setConnected} />
        </AppContext.Provider>
      </TranslateProvider>
    );
  }

  return (
    <TranslateProvider value={translate}>
      <AppContext.Provider value={value}>{children}</AppContext.Provider>
    </TranslateProvider>
  );
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <CmsApp>.');
  return value;
}

export function useStore(): EntryStore {
  const store = useApp().store;
  if (!store) throw new Error('No backend is connected yet.');
  return store;
}

/**
 * A backend that can be built without asking the author anything. Everything else — a folder, a
 * proxy, GitHub — needs a gesture or a credential, so it is constructed by the connect view.
 */
function autoAdapter(config: CMSConfig, storage?: StorageAdapter): StorageAdapter | undefined {
  if (storage) return storage;
  const local = config.backend.local;
  if (config.backend.name === 'local' && local?.kind === 'memory') {
    return new MemoryAdapter(local.files ?? {});
  }
  if (config.backend.name === 'github' && config.backend.repo) {
    // A token left from an earlier visit is enough to go straight to the editor.
    const token = tokenStore.read();
    if (token) {
      const [owner, repo] = config.backend.repo.split('/') as [string, string];
      return new GitHubAdapter({
        owner,
        repo,
        ...(config.backend.branch ? { branch: config.backend.branch } : {}),
        token,
        via: 'token',
      });
    }
  }
  return undefined;
}
