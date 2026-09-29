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
}

export function BodyField({
  value,
  onChange,
  extension,
  forceSource,
  structuredFences,
  onOverrideSource,
}: BodyFieldProps) {
  const verdict: BodyModeResult = classifyBody(value, { extension, forceSource, structuredFences });
  const [override, setOverride] = useState(false);
  const canUseRich = verdict.mode === 'rich' || override;

  return (
    <div className="body-field" data-mode={canUseRich ? 'rich' : 'source'}>
      <div className="body-head">
        <span className="field-label">Body</span>
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
              Edit as rich text anyway
            </button>
          )}
          {override && <span className="body-warning">Rich text will reformat this file.</span>}
        </div>
      </div>

      {verdict.mode === 'source' && !override && (
        <p className="field-hint" data-reason={verdict.reason}>
          {explain(verdict.reason)} Editing as source.
        </p>
      )}

      {canUseRich ? (
        <RichEditor id="entry-body" value={value} onChange={onChange} />
      ) : (
        <SourceEditor id="entry-body" value={value} onChange={onChange} />
      )}
    </div>
  );
}

/** Why the source editor was chosen, in terms the author can act on. */
function explain(reason: BodyResult['reason']): string {
  switch (reason) {
    case 'mdx':
      return 'This file is MDX, which carries imports and components.';
    case 'imports':
      return 'This body contains an import or export.';
    case 'jsx':
      return 'This body contains a component.';
    case 'html':
      return 'This body contains HTML.';
    case 'structured-fence':
      return 'This body contains a diagram or other structured block.';
    case 'math':
      return 'This body contains display math.';
    case 'indented-code':
      return 'This body contains an indented code block.';
    case 'configured':
      return 'This field is configured as source only.';
    default:
      return '';
  }
}

type BodyResult = BodyModeResult;
