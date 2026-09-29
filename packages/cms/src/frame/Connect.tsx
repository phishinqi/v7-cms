/**
 * Connecting to a backend.
 *
 * The app cannot construct a GitHub backend on its own — it needs a token, and only the author can
 * supply one. This view is where that happens, so the editor is usable rather than only testable.
 */
import { useState } from 'react';
import { verifyToken, tokenStore, type TokenStorage } from '@v7-cms/adapters';
import type { CMSConfig } from '@v7-cms/core';

export interface ConnectProps {
  config: CMSConfig;
  onConnected(token: string, remember: boolean): void;
}

export function Connect({ config, onConnected }: ConnectProps) {
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const repo = config.backend.repo ?? 'the repository';
  const authBase = config.backend.authBase;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Checked immediately, so a wrong token fails here rather than on the first save.
      const session = await verifyToken(token.trim());
      const storage: TokenStorage = remember ? 'local' : 'session';
      tokenStore.write(session.token, storage);
      onConnected(session.token, remember);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signInWithGitHub = async () => {
    setError(null);
    try {
      const { beginOAuth } = await import('@v7-cms/adapters');
      const session = await beginOAuth({ authBase: authBase! });
      tokenStore.write(session.token);
      onConnected(session.token, false);
    } catch (problem) {
      setError((problem as Error).message);
    }
  };

  return (
    <div className="connect">
      <h1>Connect to {repo}</h1>
      <p className="notice">
        The editor needs permission to read and write this repository. Nothing leaves your browser
        except the requests GitHub itself receives.
      </p>

      {authBase && (
        <p>
          <button type="button" className="button primary" onClick={() => void signInWithGitHub()}>
            Sign in with GitHub
          </button>
        </p>
      )}

      <form onSubmit={(event) => void submit(event)}>
        <label className="field-label" htmlFor="token">
          Personal access token
        </label>
        <input
          id="token"
          className="input"
          type="password"
          autoComplete="off"
          value={token}
          placeholder="github_pat_… or ghp_…"
          onChange={(event) => setToken(event.target.value)}
        />
        <p className="field-hint">
          Needs repository contents read and write. Create one under GitHub → Settings → Developer
          settings → Personal access tokens.
        </p>

        <label className="toggle">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <span>Remember on this device</span>
        </label>
        <p className="field-hint">
          Left off, the token is kept for this tab only and forgotten when it closes.
        </p>

        <p>
          <button type="submit" className="button primary" disabled={busy || token.trim() === ''}>
            {busy ? 'Checking…' : 'Connect'}
          </button>
        </p>
      </form>

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
