/**
 * The customisation surface.
 *
 * A consumer extends the CMS by registering things, not by forking it. Everything registrable goes
 * through one registry so the order of imports cannot matter, and so a plugin can be a plain
 * object rather than something with a lifecycle to learn.
 */
import type { FieldType } from '@v7-cms/core';
import { registerFieldType } from '@v7-cms/core';
import type { PreviewRenderer } from './preview/renderers.js';

export interface ThemeTokens {
  paper?: string;
  surface?: string;
  ink?: string;
  muted?: string;
  accent?: string;
  line?: string;
  danger?: string;
  /** Typefaces. */
  heading?: string;
  ui?: string;
  mono?: string;
  radius?: string;
}

export interface Plugin {
  name: string;
  /** Field types this plugin adds, registered by name so configs can refer to them. */
  fields?: FieldType<never>[];
  /** Preview renderers for fence languages this plugin understands. */
  renderers?: PreviewRenderer[];
  /** Design tokens, applied as CSS custom properties on the editor's root. */
  theme?: ThemeTokens;
  /** Called once after registration, for anything else a plugin needs to do. */
  setup?(context: PluginContext): void;
}

export interface PluginContext {
  /** The element the editor is mounted into. */
  root: HTMLElement;
  /** Apply tokens at any time, not only at setup. */
  applyTheme(tokens: ThemeTokens): void;
}

const plugins = new Map<string, Plugin>();

/**
 * Registers a plugin. Field types are forwarded to core's registry; renderers and theme are kept
 * here, because only the browser layer can use them.
 */
export function registerPlugin(plugin: Plugin): void {
  if (!plugin.name) throw new Error('A plugin needs a name.');
  if (plugins.has(plugin.name)) throw new Error(`Plugin "${plugin.name}" is already registered.`);
  for (const field of plugin.fields ?? []) registerFieldType(field);
  plugins.set(plugin.name, plugin);
}

export function registeredPlugins(): string[] {
  return [...plugins.keys()].sort();
}

export function pluginRenderers(): PreviewRenderer[] {
  return [...plugins.values()].flatMap((plugin) => plugin.renderers ?? []);
}

export function pluginTheme(): ThemeTokens {
  return Object.assign({}, ...[...plugins.values()].map((plugin) => plugin.theme ?? {}));
}

/**
 * Apply design tokens as custom properties. Every token maps to one of the variables the editor's
 * stylesheet already reads, so a consumer can restyle it without writing CSS or knowing the class
 * names.
 */
export function applyTheme(root: HTMLElement, tokens: ThemeTokens): void {
  for (const [key, value] of Object.entries(tokens)) {
    if (!value) continue;
    root.style.setProperty(`--${kebab(key)}`, value);
  }
}

/** Run each plugin's setup, passing the mount point and a way to restyle later. */
export function setupPlugins(root: HTMLElement): void {
  const context: PluginContext = {
    root,
    applyTheme: (tokens) => applyTheme(root, tokens),
  };
  for (const plugin of plugins.values()) plugin.setup?.(context);
}

/** `postsPerPage` -> `posts-per-page`, so a token name can stay camelCase in TypeScript. */
function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
