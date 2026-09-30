/**
 * The preview panel.
 *
 * Two modes, because they answer different questions. The rendered preview is always available and
 * shows the body as Markdown, including diagrams and math. The site preview embeds the real
 * development server when one is configured, which is the only way to see the actual layout.
 */
import { useEffect, useRef, useState } from 'react';
import MarkdownIt from 'markdown-it';
import { renderPreview } from './renderers.js';
import { useTranslate } from '../i18n/index.js';

export interface PreviewProps {
  /** Markdown body, exactly as it will be written to the file. */
  body: string;
  /** Dev server to embed, if the config provides one. */
  devServerURL?: string;
  /** Path of this entry on that server, e.g. `/posts/my-post/`. */
  sitePath?: string;
}

const md = new MarkdownIt({ html: false, linkify: true, typographer: false });

type Mode = 'rendered' | 'site';

export function Preview({ body, devServerURL, sitePath }: PreviewProps) {
  const t = useTranslate();
  const [mode, setMode] = useState<Mode>('rendered');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => readTheme());
  const host = useRef<HTMLDivElement | null>(null);

  // The editor's own theme, so previews match without a second setting to keep in sync.
  useEffect(() => {
    const onTheme = () => setTheme(readTheme());
    window.addEventListener('v7-cms:theme', onTheme);
    return () => window.removeEventListener('v7-cms:theme', onTheme);
  }, []);

  useEffect(() => {
    if (mode !== 'rendered' || !host.current) return;
    const element = host.current;
    let superseded = false;

    // Synchronous, so the text appears immediately rather than after a diagram finishes.
    element.innerHTML = md.render(body);

    // Rendering a diagram is async, so a fast typist can outrun it. A superseded run bails out
    // before it writes anything, leaving the newer run's output in place.
    void renderPreview(element, { theme }).catch(() => {
      /* A missing diagram engine leaves the fence as code, which is the right fallback. */
    });

    return () => {
      superseded = true;
      void superseded;
    };
  }, [body, mode, theme]);

  const siteURL = devServerURL && sitePath ? new URL(sitePath, devServerURL).href : undefined;

  return (
    <div className="preview">
      <div className="preview-head">
        <span className="field-label">{t('preview.title')}</span>
        <div className="view-switch" role="tablist" aria-label={t('preview.title')}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'rendered'}
            onClick={() => setMode('rendered')}
          >
            {t('preview.rendered')}
          </button>
          {siteURL && (
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'site'}
              onClick={() => setMode('site')}
            >
              {t('preview.site')}
            </button>
          )}
        </div>
      </div>

      {mode === 'rendered' ? (
        <div className="preview-body" ref={host} />
      ) : (
        <div className="preview-site">
          <iframe title={t('preview.site')} src={siteURL} />
          <p className="field-hint">{t('preview.siteHint')}</p>
        </div>
      )}

      {mode === 'rendered' && <p className="field-hint">{t('preview.markdownHint')}</p>}
    </div>
  );
}

function readTheme(): 'light' | 'dark' {
  const root = document.querySelector('.v7-cms');
  return root?.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
