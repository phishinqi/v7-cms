/**
 * Editing a whole file, with fields inferred from its current contents.
 *
 * This is how a site's settings stay editable. The file's shape changes as the site grows, so
 * writing a field definition for every key would go stale; the form is derived from the file
 * instead, and `fieldOverrides` in the config refines the result.
 *
 * The file is JSON, so unlike frontmatter there is no formatting to preserve beyond indentation:
 * writing it back is a straightforward serialisation. What it does preserve is key order and any
 * key the form does not describe, because a settings file may carry things this editor has no
 * opinion about.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Field, FileCollection, FileEntry } from '@v7-cms/core';
import { runFieldValidation } from '@v7-cms/core';
import { useApp } from '../app.js';
import { useTranslate } from '../i18n/index.js';
import { FieldControl } from './FieldControl.js';
import { inferFields } from './infer-schema.js';

type SaveState = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';

export function FileEditor({ collection }: { collection: FileCollection }) {
  const { storage } = useApp();
  const t = useTranslate();
  const [entry, setEntry] = useState<FileEntry | undefined>(collection.files[0]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [original, setOriginal] = useState<Record<string, unknown>>({});
  const [sha, setSha] = useState<string | undefined>();
  const [state, setState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entry || !storage) return;
    setLoading(true);
    void storage
      .readFile(entry.file)
      .then((file) => {
        const parsed = JSON.parse(file.text || '{}') as Record<string, unknown>;
        setValues(parsed);
        setOriginal(parsed);
        setSha(file.sha);
        setState('idle');
      })
      .catch((error: Error) => {
        setMessage(error.message);
        setState('error');
      })
      .finally(() => setLoading(false));
  }, [entry, storage]);

  const fields = useMemo(() => {
    if (!entry) return [];
    // Declared fields win; otherwise the form comes from the file. `inferSchema` is what decides,
    // so a collection can declare fields instead when it prefers to.
    if (entry.fields?.length) return entry.fields;
    if (entry.inferSchema !== false) return inferFields(values, entry.fieldOverrides ?? {});
    return [];
  }, [entry, values]);

  const issues = useMemo(() => {
    const found: Array<{ path: string; message: string }> = [];
    for (const field of fields) {
      found.push(
        ...runFieldValidation(
          field as Field & Record<string, unknown>,
          values[field.name],
          field.name,
          values,
        ).map((issue) => ({ path: issue.path ?? field.name, message: issue.message })),
      );
    }
    return found;
  }, [fields, values]);

  const dirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(original),
    [values, original],
  );

  const save = async () => {
    if (!entry || !storage) return;
    setState('saving');
    try {
      // Two-space indent and a trailing newline, which is what the file already uses.
      const text = `${JSON.stringify(values, null, 2)}\n`;
      const result = await storage.writeFile(entry.file, text, {
        message: `Update ${entry.label}`,
        ...(sha === undefined ? {} : { sha }),
      });
      setOriginal(values);
      if (result.sha !== undefined) setSha(result.sha);
      setState('saved');
    } catch (error) {
      const conflict = (error as Error).name === 'ConflictError';
      setState(conflict ? 'conflict' : 'error');
      setMessage((error as Error).message);
    }
  };

  if (loading)
    return (
      <p className="notice">
        {t('field.reading')} {entry?.label}…
      </p>
    );

  return (
    <div className="file-editor">
      <header className="editor-head">
        <span className="editor-path">{entry?.file}</span>
        <div className="editor-actions">
          <button
            type="button"
            className="button primary"
            disabled={!dirty || state === 'saving' || issues.length > 0}
            onClick={() => void save()}
          >
            {state === 'saving' ? t('action.saving') : t('action.save')}
          </button>
        </div>
      </header>

      {collection.files.length > 1 && (
        <div className="view-switch" role="tablist" aria-label={collection.label}>
          {collection.files.map((file) => (
            <button
              key={file.name}
              type="button"
              role="tab"
              aria-selected={entry?.name === file.name}
              onClick={() => setEntry(file)}
            >
              {file.label}
            </button>
          ))}
        </div>
      )}

      {issues.length > 0 && (
        <p className="notice error" role="alert">
          {issues.length}
          {issues.length === 1
            ? t('notice.fieldsNeedAttention')
            : t('notice.fieldsNeedAttentionPlural')}
        </p>
      )}
      {state === 'saved' && <p className="notice ok">{t('action.saved')}</p>}
      {state === 'error' && (
        <p className="notice error" role="alert">
          {message}
        </p>
      )}
      {state === 'conflict' && (
        <p className="notice error" role="alert">
          {t('notice.conflict')}
        </p>
      )}

      <div className="fields">
        {fields.map((field) => (
          <FieldControl
            key={field.name}
            field={field}
            path={field.name}
            value={values[field.name]}
            issues={issues}
            onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
          />
        ))}
      </div>

      {fields.length === 0 && <p className="notice">{t('notice.nothingEditable')}</p>}
    </div>
  );
}
