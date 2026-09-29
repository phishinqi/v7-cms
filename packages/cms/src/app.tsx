/**
 * The application shell: config loading, backend selection and the store, handed to the views
 * through context. Everything the UI needs is assembled here so views stay presentational.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { loadConfig, type CMSConfig, type ConfigIssue } from '@v7-cms/core';
import { MemoryAdapter } from '@v7-cms/adapters/memory';
import type { StorageAdapter } from '@v7-cms/core/storage';
import { EntryStore } from './entry-store.js';

export interface AppContextValue {
  config: CMSConfig;
  store: EntryStore;
  storage: StorageAdapter;
  issues: ConfigIssue[];
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
  const value = useMemo<AppContextValue>(() => {
    const { config, issues } = loadConfig(rawConfig);
    const adapter = storage ?? createAdapter(config);
    return { config, issues, storage: adapter, store: new EntryStore(adapter, config.collections) };
  }, [rawConfig, storage]);

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
