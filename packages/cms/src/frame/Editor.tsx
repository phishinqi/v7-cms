/**
 * The editor: pick a collection, pick an entry, edit its fields, save.
 *
 * The view holds a draft in local state so edits are cheap, and only writes on save. Save is
 * disabled while there are validation errors, but validation never blocks typing.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FieldsCollection } from '@v7-cms/core';
import { ConflictError } from '@v7-cms/core/storage';
import { useApp, useStore } from '../app.js';
import { useTranslate } from '../i18n/index.js';
import type { EntrySummary, LoadedEntry } from '../entry-store.js';
import { BodyField } from './BodyField.js';
import { FieldControl } from './FieldControl.js';
import { Preview } from '../preview/Preview.js';

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string }
  | { kind: 'conflict' };

export function Editor({ collectionName }: { collectionName: string }) {
  const store = useStore();
  const t = useTranslate();
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
  const bodyField = collection?.fields.find((field) => field.name === collection.contentField);
  const preview = useApp().config.preview;
  const media = useApp().config.media;
  // A collection can keep its images together; otherwise the config's paths apply.
  const mediaTarget = {
    repoPath: collection?.media?.repoPath ?? media?.repoPath ?? 'public/images/uploads',
    publicPath: collection?.media?.publicPath ?? media?.publicPath ?? '/images/uploads',
  };

  if (!collection) {
    return (
      <p className="notice">
        {t('list.unknownCollection')} “{collectionName}”.
      </p>
    );
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
              {t('action.new')}
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
        {entries.length === 0 && <p className="notice">{t('list.empty')}</p>}
      </aside>

      <section className="entry-editor" data-with-preview={Boolean(entry)}>
        {!entry && <p className="notice">{t('list.selectEntry')}</p>}
        {entry && (
          <>
            <header className="editor-head">
              <span className="editor-path">{entry.path}</span>
              <div className="editor-actions">
                {!entry.isNew && (
                  <button type="button" className="button danger" onClick={() => void remove()}>
                    {t('action.delete')}
                  </button>
                )}
                <button
                  type="button"
                  className="button primary"
                  onClick={() => void save()}
                  disabled={state.kind === 'saving' || issues.length > 0}
                >
                  {state.kind === 'saving' ? t('action.saving') : t('action.save')}
                </button>
              </div>
            </header>

            {issues.length > 0 && (
              <p className="notice error" role="alert">
                {issues.length}
                {issues.length === 1
                  ? t('notice.fieldsNeedAttention')
                  : t('notice.fieldsNeedAttentionPlural')}
              </p>
            )}
            {state.kind === 'saved' && <p className="notice ok">{t('action.saved')}</p>}
            {state.kind === 'error' && (
              <p className="notice error" role="alert">
                {state.message}
              </p>
            )}
            {state.kind === 'conflict' && (
              <p className="notice error" role="alert">
                {t('notice.conflict')}
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
                    mediaTarget={mediaTarget}
                    value={entry.values[field.name]}
                    issues={issues}
                    onChange={(value) =>
                      setEntry({ ...entry, values: { ...entry.values, [field.name]: value } })
                    }
                  />
                ))}
            </div>

            {collection.contentField && (
              <BodyField
                value={entry.body}
                extension={collection.extension}
                forceSource={bodyField?.widget === 'source'}
                onChange={(body) => setEntry({ ...entry, body })}
              />
            )}
          </>
        )}
      </section>

      {entry && collection.contentField && (
        <aside className="entry-preview">
          <Preview
            body={entry.body}
            {...(preview?.devServerURL ? { devServerURL: preview.devServerURL } : {})}
            {...(sitePathOf(preview?.pathTemplate, entry)
              ? { sitePath: sitePathOf(preview?.pathTemplate, entry)! }
              : {})}
          />
        </aside>
      )}
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

/**
 * Where this entry lives on the site, from the config's path template. Returns undefined when the
 * template needs something the entry does not have, so the preview simply does not offer the site
 * view rather than pointing at a broken URL.
 */
function sitePathOf(template: string | undefined, entry: LoadedEntry): string | undefined {
  if (!template) return undefined;
  const values: Record<string, string> = {
    slug: entry.id,
    collection: entry.collection.name,
  };
  const path = template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? '');
  return path.includes('{{') ? undefined : path;
}
