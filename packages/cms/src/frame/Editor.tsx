/**
 * The editor: pick a collection, pick an entry, edit its fields, save.
 *
 * The view holds a draft in local state so edits are cheap, and only writes on save. Save is
 * disabled while there are validation errors, but validation never blocks typing.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FieldsCollection } from '@v7-cms/core';
import { ConflictError } from '@v7-cms/core/storage';
import { useStore } from '../app.js';
import type { EntrySummary, LoadedEntry } from '../entry-store.js';
import { FieldControl } from './FieldControl.js';

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string }
  | { kind: 'conflict' };

export function Editor({ collectionName }: { collectionName: string }) {
  const store = useStore();
  const collection = store.collection(collectionName);
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  const [entry, setEntry] = useState<LoadedEntry | null>(null);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });

  const refresh = useCallback(async () => {
    setEntries(await store.list(collectionName));
  }, [store, collectionName]);

  useEffect(() => {
    void refresh();
    setEntry(null);
  }, [refresh]);

  const issues = useMemo(() => (entry ? store.validate(entry) : []), [entry, store]);

  if (!collection) {
    return <p className="notice">Unknown collection “{collectionName}”.</p>;
  }

  const open = async (path: string) => {
    setEntry(await store.load(collectionName, path));
    setState({ kind: 'idle' });
  };

  const create = () => {
    const path = `${collection.folder}/${uniqueName(collection, entries)}.${collection.extension}`;
    setEntry(store.blank(collectionName, path));
    setState({ kind: 'idle' });
  };

  const save = async () => {
    if (!entry) return;
    setState({ kind: 'saving' });
    try {
      const saved = await store.save(entry);
      setEntry(saved);
      setState({ kind: 'saved' });
      await refresh();
    } catch (error) {
      setState(
        error instanceof ConflictError
          ? { kind: 'conflict' }
          : { kind: 'error', message: (error as Error).message },
      );
    }
  };

  const remove = async () => {
    if (!entry) return;
    await store.remove(entry);
    setEntry(null);
    await refresh();
  };

  return (
    <div className="editor">
      <aside className="entry-list">
        <div className="entry-list-head">
          <h2>{collection.label}</h2>
          {collection.create !== false && (
            <button type="button" className="button" onClick={create}>
              New
            </button>
          )}
        </div>
        <ul>
          {entries.map((summary) => (
            <li key={summary.path}>
              <button
                type="button"
                className="entry-link"
                aria-current={entry?.path === summary.path ? 'true' : undefined}
                onClick={() => void open(summary.path)}
              >
                {summary.label}
              </button>
            </li>
          ))}
        </ul>
        {entries.length === 0 && <p className="notice">Nothing here yet.</p>}
      </aside>

      <section className="entry-editor">
        {!entry && <p className="notice">Select an entry, or create one.</p>}
        {entry && (
          <>
            <header className="editor-head">
              <span className="editor-path">{entry.path}</span>
              <div className="editor-actions">
                {!entry.isNew && (
                  <button type="button" className="button danger" onClick={() => void remove()}>
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  className="button primary"
                  onClick={() => void save()}
                  disabled={state.kind === 'saving' || issues.length > 0}
                >
                  {state.kind === 'saving' ? 'Saving…' : 'Save'}
                </button>
              </div>
            </header>

            {issues.length > 0 && (
              <p className="notice error" role="alert">
                {issues.length} field{issues.length === 1 ? '' : 's'} need attention.
              </p>
            )}
            {state.kind === 'saved' && <p className="notice ok">Saved.</p>}
            {state.kind === 'error' && (
              <p className="notice error" role="alert">
                {state.message}
              </p>
            )}
            {state.kind === 'conflict' && (
              <p className="notice error" role="alert">
                This file changed elsewhere. Reopen it before saving.
              </p>
            )}

            <div className="fields">
              {collection.fields
                .filter((field) => field.name !== collection.contentField)
                .map((field) => (
                  <FieldControl
                    key={field.name}
                    field={field}
                    path={field.name}
                    value={entry.values[field.name]}
                    issues={issues}
                    onChange={(value) =>
                      setEntry({ ...entry, values: { ...entry.values, [field.name]: value } })
                    }
                  />
                ))}
            </div>

            {collection.contentField && (
              <div className="body-field">
                <label className="field-label" htmlFor="entry-body">
                  Body
                </label>
                <textarea
                  id="entry-body"
                  className="input textarea body"
                  rows={18}
                  spellCheck={false}
                  value={entry.body}
                  onChange={(event) => setEntry({ ...entry, body: event.target.value })}
                />
                <p className="field-hint">
                  Source view. Content that is not edited here is written back untouched.
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** A file name that is not taken yet, so “New” twice does not collide. */
function uniqueName(collection: FieldsCollection, entries: EntrySummary[]): string {
  const taken = new Set(entries.map((entry) => entry.path.split('/').pop()));
  let index = 1;
  for (;;) {
    const candidate = `untitled${index === 1 ? '' : `-${index}`}.${collection.extension}`;
    if (!taken.has(candidate)) return `untitled${index === 1 ? '' : `-${index}`}`;
    index += 1;
  }
}
