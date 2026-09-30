/**
 * Who the editor is signed in as, and the way out.
 *
 * A Git-backed editor holds a credential that can write to a repository, and it can be opened on a
 * machine that is not yours. Without this the author had no way to see which account was acting or
 * to drop it — the token simply persisted.
 *
 * The panel is only rendered when the backend can name an account. A folder on disk has none, so a
 * local author sees a plain label instead of a sign-out button that would do nothing.
 */
import { useState } from 'react';
import { useApp } from '../app.js';
import { useTranslate } from '../i18n/index.js';

export function AccountPanel() {
  const { account, storage, disconnect } = useApp();
  const t = useTranslate();
  const [confirming, setConfirming] = useState(false);

  // Nothing to show and nothing to leave: an unauthenticated backend with no session.
  if (!storage) return null;

  if (!account) {
    // A local or memory backend. Say what is being edited, but offer no sign-out.
    return (
      <div className="account" data-account="local">
        <p className="account-name">{t('account.localFolder')}</p>
        <p className="account-via">{t('account.localFolderHint')}</p>
      </div>
    );
  }

  const label = account.name && account.name !== account.login ? account.name : account.login;
  const via = account.via === 'oauth' ? t('account.viaOauth') : t('account.viaToken');

  return (
    <div className="account" data-account={account.via}>
      <div className="account-identity">
        {account.avatar && (
          <img className="account-avatar" src={account.avatar} alt="" width="28" height="28" />
        )}
        <div className="account-text">
          <p className="account-name" title={label ?? account.repo?.repo}>
            {label ?? account.repo?.repo}
          </p>
          <p className="account-via">{via}</p>
        </div>
      </div>

      {confirming ? (
        // Signing out of a shared machine must not be one stray click away from the sidebar.
        <div className="account-confirm">
          <p className="account-via">{t('account.signOutConfirm')}</p>
          <div className="account-actions">
            <button
              type="button"
              className="button danger"
              onClick={() => {
                disconnect?.();
                setConfirming(false);
              }}
            >
              {t('account.signOut')}
            </button>
            <button type="button" className="button" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="button account-signout"
          onClick={() => setConfirming(true)}
        >
          {t('account.signOut')}
        </button>
      )}
    </div>
  );
}
