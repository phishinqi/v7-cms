/**
 * The bridge between the embedded site and this editor.
 *
 * In-context editing means clicking a paragraph on the rendered page and landing on the field that
 * produced it. The preview runs in an iframe on the site's origin, so the two sides talk over
 * `postMessage`; this module is the editor half, and `bridgeScript()` is the half that runs inside
 * the frame. Keeping both here means the message shapes cannot drift apart.
 *
 * The frame is not trusted to be ours — it is whatever the dev server serves. So the editor only
 * accepts messages that look like the protocol, and never evaluates anything it receives.
 */

/** What the frame reports when the author clicks something. */
export interface InContextPick {
  /** Dotted frontmatter path, e.g. `title` or `cover.alt`. */
  path: string;
  /** Text the frame found at that node, used to focus the matching control. */
  text?: string;
}

/** Messages the frame sends. */
export type BridgeMessage =
  { v7: 'ready' } | { v7: 'pick'; pick: InContextPick } | { v7: 'hover'; path: string | null };

/** Narrow an arbitrary `postMessage` payload to a bridge message. */
export function parseBridgeMessage(data: unknown): BridgeMessage | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const value = data as Record<string, unknown>;
  if (value['v7'] === 'ready') return { v7: 'ready' };
  if (value['v7'] === 'hover') {
    const path = value['path'];
    return { v7: 'hover', path: typeof path === 'string' ? path : null };
  }
  if (value['v7'] === 'pick') {
    const pick = value['pick'] as Record<string, unknown> | undefined;
    if (!pick || typeof pick['path'] !== 'string' || pick['path'] === '') return undefined;
    return {
      v7: 'pick',
      pick: {
        path: pick['path'],
        ...(typeof pick['text'] === 'string' ? { text: pick['text'] } : {}),
      },
    };
  }
  return undefined;
}

export interface BridgeOptions {
  /**
   * Attribute the site marks editable nodes with. A theme opts in by rendering
   * `data-v7-field="title"` on the element that shows that field; without it the page is only a
   * preview, which is the correct default — this must never guess.
   */
  attribute: string;
  /** Outline colour for the highlighted node, from the editor's own tokens. */
  accent: string;
}

/**
 * The script injected into the frame.
 *
 * It is a string rather than a module because an iframe on another origin cannot import from here.
 * It stays small and does three things: outline whatever the pointer is over, report a click, and
 * scroll to a node the editor asks about.
 */
export function bridgeScript(options: BridgeOptions): string {
  const attribute = JSON.stringify(options.attribute);
  const accent = JSON.stringify(options.accent);

  return `(() => {
  const ATTR = ${attribute};
  const ACCENT = ${accent};
  if (window.__v7Bridge) return;
  window.__v7Bridge = true;

  const style = document.createElement('style');
  style.textContent =
    '[data-v7-hover]{outline:2px solid ' + ACCENT + ';outline-offset:2px;cursor:pointer;}' +
    '[data-v7-flash]{outline:3px solid ' + ACCENT + ';outline-offset:3px;transition:outline-color .4s;}';
  document.head.appendChild(style);

  const send = (message) => {
    try { parent.postMessage(message, '*'); } catch (error) { /* The frame may be detached. */ }
  };

  /** The nearest ancestor carrying the opt-in attribute. */
  const owner = (node) => {
    if (!(node instanceof Element)) return null;
    return node.closest('[' + ATTR + ']');
  };

  let hovered = null;
  document.addEventListener('pointerover', (event) => {
    const node = owner(event.target);
    if (node === hovered) return;
    if (hovered) hovered.removeAttribute('data-v7-hover');
    hovered = node;
    if (!node) { send({ v7: 'hover', path: null }); return; }
    node.setAttribute('data-v7-hover', '');
    send({ v7: 'hover', path: node.getAttribute(ATTR) });
  }, true);

  document.addEventListener('click', (event) => {
    const node = owner(event.target);
    if (!node) return;
    // The point of the click is to edit, not to follow a link out of the frame.
    event.preventDefault();
    event.stopPropagation();
    const path = node.getAttribute(ATTR);
    if (!path) return;
    const text = (node.textContent || '').trim().slice(0, 120);
    send({ v7: 'pick', pick: { path: path, text: text } });
  }, true);

  // The editor asks the frame to reveal a field, so a click in the form can highlight the page.
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.v7 !== 'reveal' || typeof data.path !== 'string') return;
    let target = null;
    document.querySelectorAll('[' + ATTR + ']').forEach((node) => {
      if (target === null && node.getAttribute(ATTR) === data.path) target = node;
    });
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.setAttribute('data-v7-flash', '');
    setTimeout(() => target.removeAttribute('data-v7-flash'), 1200);
  });

  send({ v7: 'ready' });
})();`;
}
