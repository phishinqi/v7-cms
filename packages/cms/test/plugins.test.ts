// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFieldType, fieldTypeNames } from '@v7-cms/core';
import {
  applyTheme,
  pluginRenderers,
  pluginTheme,
  registerPlugin,
  registeredPlugins,
  setupPlugins,
} from '../src/plugins.js';

afterEach(() => vi.restoreAllMocks());

describe('plugins', () => {
  it('registers a plugin and lists it', () => {
    registerPlugin({ name: 'test-basic' });
    expect(registeredPlugins()).toContain('test-basic');
  });

  it('refuses a plugin without a name', () => {
    expect(() => registerPlugin({ name: '' })).toThrow(/needs a name/);
  });

  it('refuses the same name twice, rather than silently replacing', () => {
    registerPlugin({ name: 'test-dupe' });
    expect(() => registerPlugin({ name: 'test-dupe' })).toThrow(/already registered/);
  });

  it('makes a plugin field type available to configs', () => {
    registerPlugin({
      name: 'test-fields',
      fields: [{ name: 'test-slug', isEmpty: (value) => value === '' } as never],
    });
    // Registered by name, which is how a config refers to it.
    expect(fieldTypeNames()).toContain('test-slug');
    expect(getFieldType('test-slug')).toBeDefined();
  });

  it('collects renderers from every plugin', () => {
    registerPlugin({
      name: 'test-renderers',
      renderers: [
        {
          name: 'test-diagram',
          matches: ({ language }) => language === 'test',
          render: async () => undefined,
        },
      ],
    });
    expect(pluginRenderers().map((renderer) => renderer.name)).toContain('test-diagram');
  });

  it('merges theme tokens, later plugins winning', () => {
    registerPlugin({ name: 'test-theme-a', theme: { accent: '#111111', ink: '#222222' } });
    registerPlugin({ name: 'test-theme-b', theme: { accent: '#333333' } });
    const theme = pluginTheme();
    expect(theme.accent).toBe('#333333');
    expect(theme.ink).toBe('#222222');
  });

  describe('theme application', () => {
    const element = () => {
      const root = document.createElement('div');
      return root;
    };

    it('writes tokens as custom properties', () => {
      const root = element();
      applyTheme(root, { accent: '#964630', radius: '4px' });
      expect(root.style.getPropertyValue('--accent')).toBe('#964630');
      expect(root.style.getPropertyValue('--radius')).toBe('4px');
    });

    it('converts camelCase token names', () => {
      const root = element();
      applyTheme(root, { readingFont: 'Georgia' } as never);
      expect(root.style.getPropertyValue('--reading-font')).toBe('Georgia');
    });

    it('skips empty values rather than clearing a token', () => {
      const root = element();
      root.style.setProperty('--accent', '#964630');
      applyTheme(root, { accent: undefined, ink: '' });
      expect(root.style.getPropertyValue('--accent')).toBe('#964630');
    });

    it('does nothing at all when given no tokens', () => {
      const root = element();
      applyTheme(root, {});
      expect(root.style.cssText).toBe('');
    });
  });

  it('runs setup once per plugin with the mount point', () => {
    const seen: string[] = [];
    registerPlugin({
      name: 'test-setup',
      setup: ({ root }) => seen.push(root.tagName),
    });
    setupPlugins(document.createElement('div'));
    expect(seen).toContain('DIV');
  });

  it('lets setup restyle later, not only at mount time', () => {
    let restyle: ((tokens: { accent: string }) => void) | undefined;
    registerPlugin({
      name: 'test-later',
      setup: ({ applyTheme: apply }) => {
        restyle = apply as never;
      },
    });
    const root = document.createElement('div');
    setupPlugins(root);
    restyle?.({ accent: '#abcdef' });
    expect(root.style.getPropertyValue('--accent')).toBe('#abcdef');
  });
});
