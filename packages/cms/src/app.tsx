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
  /** Absent until a backend is connected; the connect screen is shown in that case. */
  store?: EntryStore;
  storage?: StorageAdapter;
  issues: ConfigIssue[];
  /** Replaces the backend once the author has connected one. */
  connect?(adapter: StorageAdapter): void;
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

  const adapter = connected ?? autoAdapter(config, storage);

  const value = useMemo<AppContextValue>(
    () =>
      adapter
        ? {
            config,
            issues,
            storage: adapter,
            store: new EntryStore(adapter, config.collections),
            connect: setConnected,
          }
        : { config, issues, connect: setConnected },
    [config, issues, adapter],
  );

  // A backend that needs credentials waits behind the connect screen rather than showing an
  // empty, misleading list.
  if (!adapter && issues.length === 0) {
    return (
      <AppContext.Provider value={value}>
        <Connect config={config} onReady={setConnected} />
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
      });
    }
  }
  return undefined;
}
