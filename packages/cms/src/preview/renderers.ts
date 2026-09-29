/**
 * Rendering a body for preview.
 *
 * A preview is not the published site, and this one does not pretend to be: it renders Markdown,
 * runs the diagram and math renderers the site uses, and says so when it cannot show something.
 * The alternative — an iframe of the real site — is better but needs a dev server, so both exist.
 *
 * The diagram engines are fetched from a CDN the first time a preview actually contains one. They
 * are several megabytes of diagram code between them, and bundling Mermaid alone turns a 500 kB
 * editor into an 18 MB directory of 67 chunks. A post with no diagram downloads none of it.
 *
 * The other rule: previews never mutate the content they are given.
 */

export interface PreviewRenderer {
  name: string;
  /** Called once per rendered preview, so libraries are only imported when actually needed. */
  render(root: HTMLElement, options: { theme: 'light' | 'dark' }): Promise<void>;
  /** If this returns false, `render` is not called and the fence stays as code. */
  matches(fence: { language: string; code: string }): boolean;
}

export interface RenderOptions {
  theme?: 'light' | 'dark';
  /** Extra renderers, so a consumer can preview their own fence languages. */
  renderers?: PreviewRenderer[];
  /** Where the diagram engines are fetched from. */
  cdn?: string;
}

const DEFAULT_CDN = 'https://cdn.jsdelivr.net/npm';

/** A stable id per library, so a preview that renders twice does not fetch twice. */
const loaded = new Map<string, Promise<unknown>>();

/**
 * Import a library from the CDN, once. The URL is resolved by the browser rather than a bundler,
 * which is what keeps the editor free of these dependencies at build time.
 */
function loadModule<T>(cdn: string, specifier: string): Promise<T> {
  const key = `${cdn}/${specifier}`;
  if (!loaded.has(key)) {
    loaded.set(
      key,
      import(/* @vite-ignore */ key).catch((error: unknown) => {
        // Let a later attempt retry rather than caching the failure forever.
        loaded.delete(key);
        throw error;
      }),
    );
  }
  return loaded.get(key) as Promise<T>;
}

interface MermaidApi {
  initialize(options: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string }>;
}
interface KatexApi {
  render(code: string, element: HTMLElement, options: Record<string, unknown>): void;
}
interface AbcjsApi {
  renderAbc(element: HTMLElement, code: string, options?: Record<string, unknown>): void;
}

/** The fences in a rendered body, with their language. */
function fencesIn(root: HTMLElement): Array<{ language: string; code: string }> {
  return [...root.querySelectorAll<HTMLElement>('pre > code')].map((code) => ({
    language:
      [...code.classList].find((name) => name.startsWith('language-'))?.slice('language-'.length) ??
      '',
    code: code.textContent ?? '',
  }));
}

/** Replace a fence's `<pre>` with a host element, keeping the source if the render fails. */
function hostFor(pre: HTMLPreElement, className: string): HTMLElement {
  const host = document.createElement('div');
  host.className = className;
  pre.replaceWith(host);
  return host;
}

function fallback(host: HTMLElement, source: string): void {
  host.textContent = source;
  host.classList.add('preview-error');
}

/**
 * The renderers, in the order they are tried. Each is only reached when a body actually contains
 * one of its fences.
 */
export function builtInRenderers(cdn = DEFAULT_CDN): PreviewRenderer[] {
  return [
    {
      name: 'mermaid',
      matches: ({ language }) => language === 'mermaid',
      async render(root, { theme }) {
        const pres = [...root.querySelectorAll<HTMLElement>('code.language-mermaid')]
          .map((code) => code.closest('pre'))
          .filter((pre): pre is HTMLPreElement => pre !== null);
        if (pres.length === 0) return;
        const mermaid = await loadModule<{ default: MermaidApi }>(
          cdn,
          'mermaid@12/dist/mermaid.esm.min.mjs',
        );
        const api = mermaid.default;
        api.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: theme === 'dark' ? 'dark' : 'default',
          suppressErrorRendering: true,
        });
        let counter = 0;
        for (const pre of pres) {
          const source = pre.textContent ?? '';
          const host = hostFor(pre, 'preview-diagram');
          counter += 1;
          try {
            const { svg } = await api.render(`v7-preview-${counter}-${Date.now()}`, source);
            host.innerHTML = svg;
          } catch {
            fallback(host, source);
          }
        }
      },
    },
    {
      name: 'katex',
      matches: ({ language }) => language === 'math' || language === 'katex',
      async render(root) {
        const blocks = [
          ...root.querySelectorAll<HTMLElement>('code.language-math, code.language-katex'),
        ];
        if (blocks.length === 0) return;
        await loadStyle(`${cdn}/katex@0.16.9/dist/katex.min.css`);
        const katex = await loadModule<{ default: KatexApi }>(cdn, 'katex@0.16.9/dist/katex.mjs');
        for (const block of blocks) {
          const pre = block.closest('pre');
          if (!pre) continue;
          const source = block.textContent ?? '';
          const host = hostFor(pre, 'preview-math');
          try {
            katex.default.render(source, host, { displayMode: true, throwOnError: false });
          } catch {
            fallback(host, source);
          }
        }
      },
    },
    {
      name: 'abc',
      matches: ({ language }) => language === 'abc',
      async render(root) {
        const pres = [...root.querySelectorAll<HTMLElement>('code.language-abc')]
          .map((code) => code.closest('pre'))
          .filter((pre): pre is HTMLPreElement => pre !== null);
        if (pres.length === 0) return;
        const abcjs = await loadModule<AbcjsApi>(cdn, 'abcjs@6.7.1/dist/abcjs-basic-min.js');
        for (const pre of pres) {
          const source = pre.textContent ?? '';
          const host = hostFor(pre, 'preview-score');
          try {
            abcjs.renderAbc(host, source, { responsive: 'resize' });
          } catch {
            fallback(host, source);
          }
        }
      },
    },
  ];
}

/** Stylesheets the renderers need. KaTeX has no styling of its own in the bundle. */
const styles = new Map<string, Promise<void>>();
function loadStyle(href: string): Promise<void> {
  if (!styles.has(href)) {
    styles.set(
      href,
      new Promise<void>((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = () => resolve();
        // A missing stylesheet must not block the preview; the maths is still readable.
        link.onerror = () => resolve();
        document.head.append(link);
      }),
    );
  }
  return styles.get(href)!;
}

/** Run every renderer whose fences are present. Exported so it can be tested directly. */
export async function renderPreview(
  root: HTMLElement,
  options: RenderOptions = {},
): Promise<string[]> {
  const renderers = [...builtInRenderers(options.cdn), ...(options.renderers ?? [])];
  const theme = options.theme ?? 'light';
  const used: string[] = [];
  const fences = fencesIn(root);
  for (const renderer of renderers) {
    if (!fences.some((fence) => renderer.matches(fence))) continue;
    used.push(renderer.name);
    await renderer.render(root, { theme });
  }
  return used;
}
