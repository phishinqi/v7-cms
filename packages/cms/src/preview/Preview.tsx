/**
 * The preview panel.
 *
 * Two modes, because they answer different questions. The rendered preview is always available and
 * shows the body as Markdown, including diagrams and math. The site preview embeds the real
 * development server when one is configured, which is the only way to see the actual layout.
 *
 * With `preview.editAttribute` set, the embedded page becomes editable in place: nodes the theme
 * marked are outlined, and clicking one reports the frontmatter path it came from. The editor half
 * of that protocol lives in `bridge.ts`.
 */
import { useEffect, useRef, useState } from 'react';
import MarkdownIt from 'markdown-it';
import { renderPreview } from './renderers.js';
import { bridgeScript, parseBridgeMessage, type InContextPick } from './bridge.js';
import { useTranslate } from '../i18n/index.js';

export interface PreviewProps {
  /** Markdown body, exactly as it will be written to the file. */
  body: string;
  /** Dev server to embed, if the config provides one. */
  devServerURL?: string;
  /** Path of this entry on that server, e.g. `/posts/my-post/`. */
  sitePath?: string;
  /** Attribute marking editable nodes; in-context editing is off without it. */
  editAttribute?: string;
  /** Called when the author clicks a marked node in the embedded page. */
  onPick?(pick: InContextPick): void;
  /** Field to reveal in the frame, set when the author focuses a control instead. */
  revealPath?: string;
  /**
   * Bumped per request, so asking twice for the same field scrolls twice. Keying the component
   * instead would remount the frame and reload the page the author is looking at.
   */
  revealNonce?: number;
}

const md = new MarkdownIt({ html: false, linkify: true, typographer: false });

type Mode = 'rendered' | 'site';

export function Preview({
  body,
  devServerURL,
  sitePath,
  editAttribute,
  onPick,
  revealPath,
  revealNonce,
}: PreviewProps) {
  const t = useTranslate();
  // In-context editing is only meaningful against the real site, so it opens there.
  const [mode, setMode] = useState<Mode>(editAttribute ? 'site' : 'rendered');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => readTheme());
  const host = useRef<HTMLDivElement | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);

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

  // Listen for picks from the frame. The frame is whatever the dev server serves, so every message
  // is parsed rather than trusted, and nothing from it is ever evaluated.
  useEffect(() => {
    if (!editAttribute) return;
    const onMessage = (event: MessageEvent) => {
      // Only the frame this panel embedded may speak, and only into this window.
      if (event.source !== frame.current?.contentWindow) return;
      const message = parseBridgeMessage(event.data);
      if (message?.v7 === 'pick') onPick?.(message.pick);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [editAttribute, onPick]);

  // Focusing a control scrolls the frame to what it produces. The reverse of a pick.
  useEffect(() => {
    if (mode !== 'site' || !revealPath) return;
    frame.current?.contentWindow?.postMessage({ v7: 'reveal', path: revealPath }, '*');
  }, [mode, revealPath, revealNonce]);

  const siteURL = devServerURL && sitePath ? new URL(sitePath, devServerURL).href : undefined;
  const inContext = Boolean(editAttribute && siteURL);

  return (
    <div className="preview" data-in-context={inContext}>
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
          <iframe
            title={t('preview.site')}
            src={siteURL}
            ref={frame}
            // The bridge has to reach into the frame, which a cross-origin iframe only allows when
            // both sides agree. A dev server on another port is still another origin.
            onLoad={() => {
              if (!inContext || !editAttribute) return;
              injectBridge(frame.current, editAttribute);
            }}
          />
          {inContext ? (
            <p className="field-hint">{t('preview.inContextHint')}</p>
          ) : (
            <p className="field-hint">{t('preview.siteHint')}</p>
          )}
          {siteURL && editAttribute && !inContext && (
            <p className="field-hint">{t('preview.inContextNeedsPath')}</p>
          )}
        </div>
      )}

      {mode === 'rendered' && <p className="field-hint">{t('preview.markdownHint')}</p>}
    </div>
  );
}

/**
 * Add the bridge to the embedded page.
 *
 * This only works when the frame is same-origin, which is the case for the usual setup: the editor
 * is served at `/admin/` by the same dev server that renders the site. Cross-origin — a deployed
 * editor pointing at a local dev server — has no `contentDocument`, and there the site has to serve
 * the bridge itself. `bridgeScript()` is exported so that is a one-liner in the theme; the editor
 * simply waits for the `ready` message either way.
 *
 * A script element is appended rather than `contentWindow.eval`, so the frame's own CSP still
 * applies and nothing is evaluated in this document.
 */
function injectBridge(iframe: HTMLIFrameElement | null, editAttribute: string): void {
  let doc: Document | null;
  try {
    doc = iframe?.contentDocument ?? null;
  } catch {
    // Cross-origin access throws rather than returning null.
    doc = null;
  }
  if (!doc) return;
  const script = doc.createElement('script');
  script.textContent = bridgeScript({
    attribute: editAttribute,
    accent: getComputedStyle(document.querySelector('.v7-cms') ?? document.body)
      .getPropertyValue('--accent')
      .trim(),
  });
  doc.head.appendChild(script);
}

function readTheme(): 'light' | 'dark' {
  const root = document.querySelector('.v7-cms');
  return root?.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
