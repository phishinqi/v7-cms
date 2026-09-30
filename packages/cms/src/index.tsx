/**
 * Public entry point. A host page mounts the editor with a config and, optionally, a backend:
 *
 *   import { mount } from '@v7-cms/cms';
 *   mount(document.getElementById('cms'), { config });
 */
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { StorageAdapter } from '@v7-cms/core/storage';
import './styles.css';
import { setupPlugins } from './plugins.js';
import { CmsApp } from './app.js';
import { Shell } from './frame/Shell.js';

export { CmsApp, useApp, useStore } from './app.js';
export { EntryStore } from './entry-store.js';
export { Shell } from './frame/Shell.js';
export { FieldControl } from './frame/FieldControl.js';
export { BodyField } from './frame/BodyField.js';
export { registerPlugin, applyTheme, type Plugin, type ThemeTokens } from './plugins.js';
export {
  GitWorkflow,
  FileWorkflow,
  workflowFor,
  type Workflow,
  type EntryStatus,
} from './workflow/index.js';
export { SourceEditor } from './frame/SourceEditor.js';
export {
  createTranslate,
  resolveLocale,
  LOCALE_NAMES,
  locales,
  type Locale,
  type Translate,
  type TranslationKey,
} from './i18n/index.js';
export { RichEditor, richRoundTrip } from './frame/RichEditor.js';
// Exported so a theme can serve the in-context bridge from its own pages, which is what makes it
// work when the editor and the site are on different origins.
export { bridgeScript, parseBridgeMessage, type InContextPick } from './preview/bridge.js';

export interface MountOptions {
  config: unknown;
  /** A ready backend. Without one, the config's `backend.local` decides what is used. */
  storage?: StorageAdapter;
  /** `light` or `dark`; the host decides, since the CMS does not own the page. */
  theme?: 'light' | 'dark';
  /** Element or selector. */
  container: HTMLElement | string;
}

const roots = new WeakMap<HTMLElement, Root>();

/**
 * Render the editor into a container. The CMS scopes all of its styles under `.v7-cms` so it can
 * live inside a page it does not control.
 */
export function mount(options: MountOptions): Root {
  const container =
    typeof options.container === 'string'
      ? document.querySelector<HTMLElement>(options.container)
      : options.container;
  if (!container) throw new Error('mount(): container not found.');

  container.classList.add('v7-cms');
  // A consumer's plugins may want to restyle the editor, so setup happens before render.
  setupPlugins(container);
  if (options.theme) container.dataset['theme'] = options.theme;

  const existing = roots.get(container);
  const root = existing ?? createRoot(container);
  roots.set(container, root);
  root.render(
    <StrictMode>
      <CmsApp config={options.config} storage={options.storage}>
        <Shell />
      </CmsApp>
    </StrictMode>,
  );
  return root;
}
