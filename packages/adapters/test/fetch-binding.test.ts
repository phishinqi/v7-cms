/**
 * `fetch` must keep its receiver.
 *
 * Every adapter test injects a stub, and a plain function has no receiver to lose — so this whole
 * class of bug is invisible to them. In a real browser, `globalThis.fetch` read off the object and
 * called later as a bare function throws "Illegal invocation", which is what a deployed editor did
 * the moment it tried to list a directory: sign-in succeeded, then nothing loaded.
 *
 * These tests assert the production path: no injected fetch, a `this`-sensitive stand-in on
 * `globalThis`.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { GitHubAdapter } from '../src/github/adapter.js';
import { ProxyAdapter } from '../src/proxy.js';
import { verifyToken } from '../src/github/auth.js';

/** Stands in for `window.fetch`, which throws unless called with the global as its receiver. */
function strictFetch(this: unknown, url: string | URL, init?: RequestInit): Promise<Response> {
  if (this !== globalThis) {
    throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
  }
  void url;
  void init;
  return Promise.resolve(
    new Response(JSON.stringify({ permissions: { push: true }, login: 'tester' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('fetch binding', () => {
  it('calls the global fetch with the global as its receiver', async () => {
    (globalThis as { fetch?: unknown }).fetch = strictFetch;
    const adapter = new GitHubAdapter({ owner: 'o', repo: 'r', token: 't' });
    // Would throw "Illegal invocation" if the receiver were lost.
    await expect(adapter.init()).resolves.toBeUndefined();
  });

  it('binds the proxy adapter the same way', async () => {
    (globalThis as { fetch?: unknown }).fetch = strictFetch;
    const adapter = new ProxyAdapter({ url: 'http://127.0.0.1:5177', token: 't' });
    await expect(adapter.init()).resolves.toBeUndefined();
  });

  it('binds verifyToken, which the token sign-in path uses', async () => {
    (globalThis as { fetch?: unknown }).fetch = strictFetch;
    await expect(verifyToken('ghp_x')).resolves.toMatchObject({ token: 'ghp_x', login: 'tester' });
  });

  it('still honours an injected fetch, which is what the other tests rely on', async () => {
    const calls: string[] = [];
    const injected = (url: string | URL) => {
      calls.push(String(url));
      return Promise.resolve(
        new Response(JSON.stringify({ permissions: { push: true } }), { status: 200 }),
      );
    };
    const adapter = new GitHubAdapter({ owner: 'o', repo: 'r', token: 't', fetch: injected });
    await adapter.init();
    expect(calls[0]).toContain('/repos/o/r');
  });
});
