/**
 * The top-level view: a sidebar of collections and the editor for the selected one.
 *
 * The selected collection lives in the URL hash so a reload keeps your place and a link can be
 * shared, which is how the previous CMS behaved.
 */
import { useEffect, useState } from 'react';
import { useApp } from '../app.js';
import { Editor } from './Editor.js';
import { FileEditor } from './FileEditor.js';

export function Shell() {
  const { config, issues } = useApp();
  const collections = config.collections.filter((collection) => collection.kind === 'fields');
  const files = config.collections.filter((collection) => collection.kind === 'file');
  const [selected, setSelected] = useState(() => hashCollection() ?? collections[0]?.name ?? '');

  useEffect(() => {
    const onHashChange = () => setSelected(hashCollection() ?? collections[0]?.name ?? '');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [collections]);

  // A collection may be either kind, so the shell looks the selected one up rather than assuming.
  const active = config.collections.find((collection) => collection.name === selected);

  const select = (name: string) => {
    setSelected(name);
    window.location.hash = `#/collections/${name}`;
  };

  if (issues.length > 0) {
    return (
      <div className="config-errors" role="alert">
        <h1>Configuration problems</h1>
        <ul>
          {issues.map((issue) => (
            <li key={`${issue.path}:${issue.message}`}>
              <code>{issue.path}</code> — {issue.message}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Collections">
        <p className="brand">{config.locale === 'zh-CN' ? 'V7 CMS' : 'V7 CMS'}</p>
        <ul>
          {collections.map((collection) => (
            <li key={collection.name}>
              <button
                type="button"
                className="nav-link"
                aria-current={selected === collection.name ? 'page' : undefined}
                onClick={() => select(collection.name)}
              >
                {collection.label}
              </button>
            </li>
          ))}
        </ul>
        {files.length > 0 && (
          <>
            <p className="nav-heading">Settings</p>
            <ul>
              {files.map((collection) => (
                <li key={collection.name}>
                  <button
                    type="button"
                    className="nav-link"
                    aria-current={selected === collection.name ? 'page' : undefined}
                    onClick={() => select(collection.name)}
                  >
                    {collection.label}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>
      <main className="main">
        {active ? (
          active.kind === 'file' ? (
            <FileEditor key={active.name} collection={active} />
          ) : (
            <Editor key={active.name} collectionName={active.name} />
          )
        ) : (
          <p className="notice">Add a collection to your config to get started.</p>
        )}
      </main>
    </div>
  );
}

function hashCollection(): string | undefined {
  const match = /^#\/collections\/([^/]+)/.exec(window.location.hash);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}
