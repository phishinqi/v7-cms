/**
 * The in-context editing protocol.
 *
 * The editor and the embedded site are separate documents that may not share an origin, so the
 * only thing holding them together is the shape of these messages. The frame is whatever the dev
 * server serves — not necessarily code we wrote — so parsing is the security boundary, and it is
 * tested as one.
 */
import { describe, expect, it } from 'vitest';
import { bridgeScript, parseBridgeMessage } from '../src/preview/bridge.js';

describe('parseBridgeMessage', () => {
  it('accepts the three messages the bridge sends', () => {
    expect(parseBridgeMessage({ v7: 'ready' })).toEqual({ v7: 'ready' });
    expect(parseBridgeMessage({ v7: 'hover', path: 'title' })).toEqual({
      v7: 'hover',
      path: 'title',
    });
    expect(parseBridgeMessage({ v7: 'pick', pick: { path: 'cover.alt', text: 'A cat' } })).toEqual({
      v7: 'pick',
      pick: { path: 'cover.alt', text: 'A cat' },
    });
  });

  it('rejects anything that is not the protocol', () => {
    for (const data of [
      undefined,
      null,
      'ready',
      42,
      {},
      { v7: 'unknown' },
      { type: 'webpackOk' },
      // A pick without a usable path would focus nothing, so it is not a pick.
      { v7: 'pick' },
      { v7: 'pick', pick: {} },
      { v7: 'pick', pick: { path: '' } },
      { v7: 'pick', pick: { path: 42 } },
    ]) {
      expect(parseBridgeMessage(data), JSON.stringify(data)).toBeUndefined();
    }
  });

  it('drops a non-string text rather than passing it through', () => {
    // The frame is untrusted; a field the editor renders must not receive an arbitrary value.
    expect(
      parseBridgeMessage({ v7: 'pick', pick: { path: 'title', text: { evil: true } } }),
    ).toEqual({ v7: 'pick', pick: { path: 'title' } });
  });

  it('normalizes a hover with no path to null', () => {
    expect(parseBridgeMessage({ v7: 'hover' })).toEqual({ v7: 'hover', path: null });
    expect(parseBridgeMessage({ v7: 'hover', path: 7 })).toEqual({ v7: 'hover', path: null });
  });
});

describe('bridgeScript', () => {
  it('is a self-contained IIFE that announces itself once', () => {
    const script = bridgeScript({ attribute: 'data-v7-field', accent: '#964630' });
    expect(script).toContain('__v7Bridge');
    // Guarded, so injecting twice does not stack duplicate listeners.
    expect(script).toContain('if (window.__v7Bridge) return');
    expect(script.trim().startsWith('(() =>')).toBe(true);
  });

  it('carries the configured attribute and colour, JSON-encoded', () => {
    const script = bridgeScript({ attribute: 'data-field', accent: 'rgb(1,2,3)' });
    expect(script).toContain('"data-field"');
    expect(script).toContain('"rgb(1,2,3)"');
  });

  it('escapes an attribute that would otherwise break out of the string', () => {
    // The value reaches the frame as source, so quoting it is what keeps it from becoming code:
    // an unescaped `"` would end the literal and leave `alert(1)` as a statement.
    const script = bridgeScript({ attribute: 'x"];alert(1);//', accent: '#000' });
    const line = script.split('\n').find((text) => text.includes('const ATTR'))!;
    expect(line).toBe('  const ATTR = "x\\"];alert(1);//";');
    // The injected statement never appears outside the string literal.
    expect(line.indexOf('alert(1)')).toBeGreaterThan(line.indexOf('const ATTR'));
    expect(script).toContain('const ATTR = "x\\"]');
  });

  it('posts to the parent and never evaluates anything it receives', () => {
    const script = bridgeScript({ attribute: 'data-v7-field', accent: '#000' });
    expect(script).toContain('parent.postMessage');
    for (const forbidden of ['eval(', 'new Function', 'innerHTML = data', 'document.write']) {
      expect(script, `the bridge must not use ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('prevents the default on a pick, so a click edits instead of navigating', () => {
    const script = bridgeScript({ attribute: 'data-v7-field', accent: '#000' });
    expect(script).toContain('event.preventDefault()');
    expect(script).toContain('event.stopPropagation()');
  });
});
