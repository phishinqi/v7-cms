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
import { checkEntryFormatForSource, runFieldValidation } from '@v7-cms/core';
import { useApp } from '../app.js';
import { useTranslate } from '../i18n/index.js';
import { FieldControl } from './FieldControl.js';
import { FormatNotes } from './FormatNotes.js';
import { SourceEditor } from './SourceEditor.js';
import { inferFields, normalizeInferredValues } from './infer-schema.js';

type SaveState = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';

export function FileEditor({ collection }: { collection: FileCollection }) {
  const { storage } = useApp();
  const t = useTranslate();
  const [entry, setEntry] = useState<FileEntry | undefined>(collection.files[0]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [original, setOriginal] = useState<Record<string, unknown>>({});
  /** Whole-file text, used instead of `values` when the entry is edited as source. */
  const [text, setText] = useState('');
  /** The text as loaded, so "did the author change anything" is a plain comparison. */
  const [originalText, setOriginalText] = useState('');
  const [sha, setSha] = useState<string | undefined>();
  const [state, setState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  /** A file that is a document rather than data: an MDX page, a stylesheet, a script. */
  const asSource = entry?.source === true;

  useEffect(() => {
    if (!entry || !storage) return;
    setLoading(true);
    void storage
      .readFile(entry.file)
      .then((file) => {
        setSha(file.sha);
        setState('idle');
        if (entry.source) {
          // Nothing is parsed: the text is the content, and it goes back out as it came in.
          setText(file.text);
          setOriginalText(file.text);
          return;
        }
        const parsed = JSON.parse(file.text || '{}') as Record<string, unknown>;
        const normalized = normalizeInferredValues(parsed);
        setValues(normalized);
        setOriginal(normalized);
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
    () => (asSource ? text !== originalText : JSON.stringify(values) !== JSON.stringify(original)),
    [asSource, text, originalText, values, original],
  );

  const formatNotes = useMemo(
    () => (asSource ? checkEntryFormatForSource(text, entry?.file) : []),
    [asSource, text, entry?.file],
  );

  const save = async () => {
    if (!entry || !storage) return;
    setState('saving');
    try {
      // A source file is written back byte for byte; only a parsed one is re-serialised.
      const body = asSource ? text : `${JSON.stringify(values, null, 2)}\n`;
      const result = await storage.writeFile(entry.file, body, {
        message: `Update ${entry.label}`,
        ...(sha === undefined ? {} : { sha }),
      });
      if (asSource) setOriginalText(text);
      else setOriginal(values);
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

      <FormatNotes issues={formatNotes} path={entry?.file} />

      {asSource ? (
        // A document, not data: one source editor over the whole file, saved byte for byte.
        <div className="fields">
          <SourceEditor value={text} onChange={setText} id="file-source" />
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
