import { describe, expect, it } from 'vitest';
import { tableHtml, tableMarkdown, normalizeTableConfig } from '../src/frame/table-utils.js';

describe('table utilities', () => {
  it('creates a headed GFM table with the requested dimensions', () => {
    expect(tableMarkdown({ format: 'gfm', rows: 3, columns: 2, hasHeader: true })).toBe(
      '| 标题 1 | 标题 2 |\n| --- | --- |\n|  |  |\n|  |  |',
    );
  });

  it('creates a body-only HTML table', () => {
    const html = tableHtml({ format: 'html', rows: 2, columns: 3, hasHeader: false });
    expect(html).toContain('<tbody>');
    expect(html).not.toContain('<thead>');
    expect((html.match(/<td>/g) ?? []).length).toBe(6);
  });

  it('clamps invalid dimensions', () => {
    expect(normalizeTableConfig({ format: 'gfm', rows: 0, columns: 99, hasHeader: true })).toEqual({
      format: 'gfm',
      rows: 1,
      columns: 12,
      hasHeader: true,
    });
  });
});
