// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  articleStructure,
  insertArticleFigure,
  replaceArticleFigure,
  serializeArticleFigure,
  type ArticleFigure,
} from '../src/frame/article-figures.js';

const figure: ArticleFigure = {
  src: '/images/photo.webp',
  alt: 'Two people at a table',
  caption: 'A small gathering',
  width: 420,
  height: 280,
  align: 'wrap-right',
};

describe('article illustrations', () => {
  it('places a figure after a chosen paragraph and reads it back', () => {
    const body = '## Opening\n\nFirst paragraph.\n\nSecond paragraph.\n';
    const { positions } = articleStructure(body);
    expect(positions.map((item) => item.label)).toEqual([
      'Opening',
      'First paragraph.',
      'Second paragraph.',
    ]);
    const next = insertArticleFigure(body, figure, positions[1]!.value);
    expect(next.indexOf('First paragraph.')).toBeLessThan(next.indexOf('<figure'));
    expect(next.indexOf('<figure')).toBeLessThan(next.indexOf('Second paragraph.'));
    expect(articleStructure(next).figures[0]?.figure).toEqual(figure);
    expect(next).toContain('data-v7-align="wrap-right"');
  });

  it('edits and removes only the selected figure', () => {
    const body = insertArticleFigure('Before.\n\nAfter.\n', figure, 'start');
    const current = articleStructure(body).figures[0]!;
    const updated = replaceArticleFigure(body, current, { ...figure, caption: 'Revised' });
    expect(updated).toContain('<figcaption>Revised</figcaption>');
    expect(updated).toContain('Before.\n\nAfter.');
    expect(replaceArticleFigure(updated, articleStructure(updated).figures[0]!, null)).toContain(
      'Before.\n\nAfter.',
    );
  });

  it('escapes captions and writes MDX-compatible style objects', () => {
    const next = serializeArticleFigure(
      { ...figure, caption: '<script>alert(1)</script> {caption}' },
      'mdx',
    );
    expect(next).toContain("style={{ width: '420px', maxWidth: '100%' }}");
    expect(next).toContain('&lt;script&gt;');
    expect(next).toContain('&#123;caption&#125;');
    expect(articleStructure(`${next}\n`).figures[0]?.figure.caption).toBe(
      '<script>alert(1)</script> {caption}',
    );
  });
});
