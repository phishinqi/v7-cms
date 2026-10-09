// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { richRoundTrip } from '../src/frame/RichEditor.js';

describe('rich editor tables', () => {
  it('round-trips a GFM table through Tiptap Markdown', () => {
    const source = '| 标题 1 | 标题 2 |\n| --- | --- |\n| 值 A | 值 B |';
    const result = richRoundTrip(source);
    expect(result).toContain('| 标题 1 | 标题 2 |');
    expect(result).toMatch(/\| 值 A\s+\| 值 B\s+\|/);
  });
});
