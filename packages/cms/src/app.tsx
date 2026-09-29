/**
 * The application shell: config loading, backend selection and the store, handed to the views
 * through context. Everything the UI needs is assembled here so views stay presentational.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { loadConfig, type CMSConfig, type ConfigIssue } from '@v7-cms/core';
import { MemoryAdapter } from '@v7-cms/adapters/memory';
import { GitHubAdapter, tokenStore } from '@v7-cms/adapters';
import type { StorageAdapter } from '@v7-cms/core/storage';
import { EntryStore } from './entry-store.js';
import { Connect } from './frame/Connect.js';

export interface AppContextValue {
  config: CMSConfig;
  store: EntryStore;
  storage: StorageAdapter;
  issues: ConfigIssue[];
  /** Set when the backend needs a token that has not been supplied yet. */
  connect?(token: string): void;
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
  // A token handed over by the connect screen, or one left from an earlier visit.
  const [token, setToken] = useState<string | undefined>(() =>
    config.backend.name === 'github' ? tokenStore.read() : undefined,
  );

  const adapter = useMemo(() => {
    if (storage) return storage;
    if (config.backend.name === 'github' && config.backend.repo && token) {
      const [owner, repo] = config.backend.repo.split('/') as [string, string];
      return new GitHubAdapter({
        owner,
        repo,
        ...(config.backend.branch ? { branch: config.backend.branch } : {}),
        token,
      });
    }
    return createAdapter(config);
  }, [config, storage, token]);

  const value = useMemo<AppContextValue>(
    () => ({
      config,
      issues,
      storage: adapter,
      store: new EntryStore(adapter, config.collections),
      connect: setToken,
    }),
    [config, issues, adapter],
  );

  // GitHub needs a token before anything can be listed, so the editor waits behind the connect
  // screen rather than showing an empty, misleading list.
  const needsToken = !storage && config.backend.name === 'github' && !token;
  if (needsToken && issues.length === 0) {
    return (
      <AppContext.Provider value={value}>
        <Connect config={config} onConnected={(next) => setToken(next)} />
      </AppContext.Provider>
    );
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <CmsApp>.');
  return value;
}

export function useStore(): EntryStore {
  return useApp().store;
}

/**
 * Pick a backend from the config. Only the memory backend can be constructed without user
 * interaction; the others need a directory handle or a token, so they are created lazily by the
 * views that own that interaction.
 */
function createAdapter(config: CMSConfig): StorageAdapter {
  const local = config.backend.local;
  if (config.backend.name === 'local' && local?.kind === 'memory') {
    return new MemoryAdapter(local.files ?? {});
  }
  // Until a real backend is connected, an empty memory store keeps the UI explorable.
  return new MemoryAdapter({});
}
