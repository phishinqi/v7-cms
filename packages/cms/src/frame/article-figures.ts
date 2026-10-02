import MarkdownIt from 'markdown-it';

export type FigureAlign = 'left' | 'center' | 'right' | 'wrap-left' | 'wrap-right';

export interface ArticleFigure {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height?: number;
  align: FigureAlign;
}

export interface FigureLocation {
  start: number;
  end: number;
  figure: ArticleFigure;
}

export interface ArticlePosition {
  value: string;
  kind: 'heading' | 'paragraph';
  label: string;
  endLine: number;
}

const markdown = new MarkdownIt({ html: true });
const aligns: FigureAlign[] = ['left', 'center', 'right', 'wrap-left', 'wrap-right'];

function lineOffset(lines: string[], line: number): number {
  let offset = 0;
  for (let index = 0; index < line; index++) offset += (lines[index]?.length ?? 0) + 1;
  return offset;
}

/** Markdown tokens provide source lines, so positions never depend on text matching. */
export function articleStructure(body: string): {
  positions: ArticlePosition[];
  figures: FigureLocation[];
} {
  const lines = body.split('\n');
  const tokens = markdown.parse(body, {});
  const positions: ArticlePosition[] = [];
  const figures: FigureLocation[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (token.type === 'html_block' && token.map) {
      const figure = parseArticleFigure(token.content);
      if (figure) {
        figures.push({
          start: lineOffset(lines, token.map[0]),
          end: lineOffset(lines, token.map[1]),
          figure,
        });
      }
    }
    if (token.level !== 0 || !token.map) continue;
    if (token.type !== 'heading_open' && token.type !== 'paragraph_open') continue;
    const content = tokens[index + 1]?.content.trim().replace(/\s+/g, ' ') ?? '';
    if (!content) continue;
    positions.push({
      value: `after:${positions.length}`,
      kind: token.type === 'heading_open' ? 'heading' : 'paragraph',
      label: content.length > 64 ? `${content.slice(0, 61)}...` : content,
      endLine: token.map[1],
    });
  }
  return { positions, figures };
}

function parseArticleFigure(markup: string): ArticleFigure | null {
  if (!/^\s*<figure\b/i.test(markup)) return null;
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  const element = doc.body.firstElementChild;
  if (element?.tagName !== 'FIGURE' || element.getAttribute('data-v7-figure') !== '1') return null;
  const image = element.querySelector('img');
  if (!image) return null;
  const width = Number(element.getAttribute('data-v7-width'));
  const height = Number(element.getAttribute('data-v7-height'));
  const rawAlign = element.getAttribute('data-v7-align') as FigureAlign;
  return {
    src: image.getAttribute('src') ?? '',
    alt: image.getAttribute('alt') ?? '',
    caption: element.querySelector('figcaption')?.textContent ?? '',
    width: Number.isFinite(width) && width > 0 ? width : 480,
    ...(Number.isFinite(height) && height > 0 ? { height } : {}),
    align: aligns.includes(rawAlign) ? rawAlign : 'center',
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

export function serializeArticleFigure(figure: ArticleFigure, extension = 'md'): string {
  const jsx = extension === 'mdx';
  const src = escapeHtml(figure.src.trim());
  const alt = escapeHtml(figure.alt.trim());
  const caption = escapeHtml(figure.caption.trim());
  const width = Math.round(figure.width);
  const height = figure.height ? Math.round(figure.height) : undefined;
  const frameStyle = jsx
    ? `style={{ width: '${width}px', maxWidth: '100%' }}`
    : `style="width: ${width}px; max-width: 100%"`;
  const imageStyle = height
    ? jsx
      ? ` style={{ height: '${height}px', objectFit: 'cover' }}`
      : ` style="height: ${height}px; object-fit: cover"`
    : '';
  return [
    `<figure data-v7-figure="1" data-v7-align="${figure.align}" data-v7-width="${width}"${height ? ` data-v7-height="${height}"` : ''} ${frameStyle}>`,
    `  <img src="${src}" alt="${alt}" width="${width}"${height ? ` height="${height}"` : ''}${imageStyle} />`,
    ...(caption ? [`  <figcaption>${caption}</figcaption>`] : []),
    '</figure>',
  ].join('\n');
}

export function insertArticleFigure(
  body: string,
  figure: ArticleFigure,
  position: string,
  extension = 'md',
): string {
  const positions = articleStructure(body).positions;
  const selected = positions.find((item) => item.value === position);
  const offset =
    position === 'start'
      ? 0
      : selected
        ? lineOffset(body.split('\n'), selected.endLine)
        : body.length;
  const before = body.slice(0, offset);
  const after = body.slice(offset);
  const leading = before
    ? before.endsWith('\n\n')
      ? ''
      : before.endsWith('\n')
        ? '\n'
        : '\n\n'
    : '';
  const trailing = after ? (after.startsWith('\n') ? '\n' : '\n\n') : '\n';
  return `${before}${leading}${serializeArticleFigure(figure, extension)}${trailing}${after}`;
}

export function replaceArticleFigure(
  body: string,
  location: FigureLocation,
  figure: ArticleFigure | null,
  extension = 'md',
): string {
  return `${body.slice(0, location.start)}${figure ? `${serializeArticleFigure(figure, extension)}\n` : ''}${body.slice(location.end)}`;
}
