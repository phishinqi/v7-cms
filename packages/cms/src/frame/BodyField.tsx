/**
 * The body field: chooses between the rich editor and the source editor, and explains why.
 *
 * The decision is made from the body's current text via `classifyBody`. When a body is source-only
 * the author can still ask for rich text, but the switch is an explicit act with a warning, not
 * something that happens by default — the whole point is that a save must never quietly rewrite an
 * MDX file.
 */
import { useEffect, useRef, useState } from 'react';
import { classifyBody, type BodyModeResult } from '@v7-cms/core';
import { RichEditor, type RichEditorHandle } from './RichEditor.js';
import { SourceEditor, type SourceEditorHandle } from './SourceEditor.js';
import { tableText, type TableConfig, type TableFormat } from './table-utils.js';
import { FigureTools } from './FigureTools.js';
import type { MediaTarget } from '../upload/media.js';
import { useTranslate, type Translate } from '../i18n/index.js';

export interface BodyFieldProps {
  value: string;
  onChange(value: string): void;
  /** File extension; MDX is always edited as source. */
  extension?: string;
  /** Set by the config for fields that are source-only by definition. */
  forceSource?: boolean;
  /** Fence languages this site treats as structured, on top of the built-in set. */
  structuredFences?: string[];
  /** Called before a rich edit replaces the body, so the caller can keep a rollback copy. */
  onOverrideSource?(previous: string): void;
  mediaTarget?: MediaTarget;
}

export function BodyField({
  value,
  onChange,
  extension,
  forceSource,
  structuredFences,
  onOverrideSource,
  mediaTarget = {},
}: BodyFieldProps) {
  const t = useTranslate();
  const verdict: BodyModeResult = classifyBody(value, { extension, forceSource, structuredFences });
  const [modeOverride, setModeOverride] = useState<'source' | 'rich' | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const sourceEditor = useRef<SourceEditorHandle>(null);
  const richEditor = useRef<RichEditorHandle>(null);
  const canUseRich = modeOverride ? modeOverride === 'rich' : verdict.mode === 'rich';

  return (
    <div className="body-field" data-mode={canUseRich ? 'rich' : 'source'}>
      <div className="body-head">
        <span className="field-label">{t('field.body')}</span>
        <div className="body-actions">
          <button type="button" className="button" onClick={() => setTableOpen(true)}>
            {t('table.insert')}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              if (canUseRich) {
                setModeOverride('source');
              } else {
                onOverrideSource?.(value);
                setModeOverride('rich');
              }
            }}
          >
            {canUseRich ? t('action.editSource') : t('action.editRich')}
          </button>
          {canUseRich && (verdict.mode === 'source' || modeOverride === 'rich') && (
            <span className="body-warning">{t('body.richWarning')}</span>
          )}
        </div>
      </div>

      {!canUseRich && verdict.mode === 'source' && (
        <p className="field-hint" data-reason={verdict.reason}>
          {explain(verdict.reason, t)} {t('body.sourceOnly')}
        </p>
      )}

      {canUseRich ? (
        <RichEditor ref={richEditor} id="entry-body" value={value} onChange={onChange} />
      ) : (
        <SourceEditor ref={sourceEditor} id="entry-body" value={value} onChange={onChange} />
      )}
      {tableOpen && (
        <TableDialog
          richMode={canUseRich}
          onCancel={() => setTableOpen(false)}
          onInsert={(config) => {
            if (canUseRich) richEditor.current?.insertTable(config);
            else sourceEditor.current?.insertText(`${tableText(config)}\n\n`);
            setTableOpen(false);
          }}
        />
      )}
      {(extension === 'md' || extension === 'mdx') && (
        <FigureTools
          value={value}
          onChange={onChange}
          extension={extension}
          mediaTarget={mediaTarget}
        />
      )}
    </div>
  );
}

function TableDialog({
  richMode,
  onCancel,
  onInsert,
}: {
  richMode: boolean;
  onCancel(): void;
  onInsert(config: TableConfig): void;
}) {
  const t = useTranslate();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);
  const [format, setFormat] = useState<TableFormat>('gfm');
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(3);
  const [hasHeader, setHasHeader] = useState(true);
  const chooseSize = (nextRows: number, nextColumns: number) => {
    setRows(nextRows);
    setColumns(nextColumns);
  };
  return (
    <div
      className="table-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="table-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-dialog-title"
      >
        <h3 id="table-dialog-title">{t('table.insert')}</h3>
        <div className="table-dialog-grid">
          <label className="field">
            <span className="field-label">{t('table.rows')}</span>
            <input
              className="input"
              type="number"
              min="1"
              max="20"
              value={rows}
              onChange={(event) => setRows(Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span className="field-label">{t('table.columns')}</span>
            <input
              className="input"
              type="number"
              min="1"
              max="12"
              value={columns}
              onChange={(event) => setColumns(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="table-format" role="radiogroup" aria-label={t('table.format')}>
          <label>
            <input
              type="radio"
              name="table-format"
              value="gfm"
              checked={format === 'gfm'}
              onChange={() => setFormat('gfm')}
            />{' '}
            {t('table.gfm')}
          </label>
          <label className={richMode ? 'is-disabled' : undefined}>
            <input
              type="radio"
              name="table-format"
              value="html"
              checked={format === 'html'}
              disabled={richMode}
              onChange={() => setFormat('html')}
            />{' '}
            {t('table.html')}
          </label>
        </div>
        {richMode && <p className="field-hint">{t('table.richOnlyGfm')}</p>}
        <label className="toggle">
          <input
            type="checkbox"
            checked={hasHeader}
            onChange={(event) => setHasHeader(event.target.checked)}
          />{' '}
          {t('table.header')}
        </label>
        <div className="table-grid-picker" aria-label={t('table.chooseSize')}>
          {Array.from({ length: 6 }, (_, row) =>
            Array.from({ length: 6 }, (_, column) => (
              <button
                key={`${row}-${column}`}
                type="button"
                className="table-grid-cell"
                aria-label={`${row + 1} x ${column + 1}`}
                aria-pressed={rows === row + 1 && columns === column + 1}
                onClick={() => chooseSize(row + 1, column + 1)}
              />
            )),
          )}
        </div>
        <div className="table-dialog-actions">
          <button type="button" className="button" onClick={onCancel}>
            {t('action.cancel')}
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() =>
              onInsert({ format: richMode ? 'gfm' : format, rows, columns, hasHeader })
            }
          >
            {t('table.insert')}
          </button>
        </div>
      </section>
    </div>
  );
}

/** Why the source editor was chosen, in terms the author can act on. */
function explain(reason: BodyResult['reason'], t: Translate): string {
  switch (reason) {
    case 'mdx':
      return t('body.reason.mdx');
    case 'imports':
      return t('body.reason.imports');
    case 'jsx':
      return t('body.reason.jsx');
    case 'html':
      return t('body.reason.html');
    case 'table':
      return t('body.reason.table');
    case 'structured-fence':
      return t('body.reason.structuredFence');
    case 'math':
      return t('body.reason.math');
    case 'indented-code':
      return t('body.reason.indentedCode');
    case 'configured':
      return t('body.reason.configured');
    default:
      return '';
  }
}

type BodyResult = BodyModeResult;
