/**
 * The body field: chooses between the rich editor and the source editor, and explains why.
 *
 * The decision is made from the body's current text via `classifyBody`. When a body is source-only
 * the author can still ask for rich text, but the switch is an explicit act with a warning, not
 * something that happens by default — the whole point is that a save must never quietly rewrite an
 * MDX file.
 */
import { useState } from 'react';
import { classifyBody, type BodyModeResult } from '@v7-cms/core';
import { RichEditor } from './RichEditor.js';
import { SourceEditor } from './SourceEditor.js';
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
  const [override, setOverride] = useState(false);
  const canUseRich = verdict.mode === 'rich' || override;

  return (
    <div className="body-field" data-mode={canUseRich ? 'rich' : 'source'}>
      <div className="body-head">
        <span className="field-label">{t('field.body')}</span>
        <div className="body-actions">
          {verdict.mode === 'source' && !override && (
            <button
              type="button"
              className="button"
              onClick={() => {
                onOverrideSource?.(value);
                setOverride(true);
              }}
            >
              {t('action.editRich')}
            </button>
          )}
          {override && <span className="body-warning">{t('body.richWarning')}</span>}
        </div>
      </div>

      {verdict.mode === 'source' && !override && (
        <p className="field-hint" data-reason={verdict.reason}>
          {explain(verdict.reason, t)} {t('body.sourceOnly')}
        </p>
      )}

      {canUseRich ? (
        <RichEditor id="entry-body" value={value} onChange={onChange} />
      ) : (
        <SourceEditor id="entry-body" value={value} onChange={onChange} />
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
