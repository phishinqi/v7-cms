/**
 * Format notes: what the editor noticed about a file's shape before you save it.
 *
 * These are warnings, not validation. Field validation blocks Save because a bad value would be
 * written wrong; a format note describes something already true about the file, and refusing to save
 * an entry the author opened read-only would be worse than saving it. So they are shown and never
 * gate the button.
 *
 * There are two sources. The checks in `@v7-cms/core` are pure and always available, and they catch
 * the shapes that break a file. Prettier itself is asked for separately, through the backend, and
 * only the local proxy can answer — see `usePrettierNote` for why.
 *
 * The text is built from the issue's `code` rather than its message, so the same check speaks
 * English or Chinese instead of whichever language the core happened to be written in.
 */
import { useEffect, useState } from 'react';
import type { FormatIssue, FormatIssueCode } from '@v7-cms/core';
import { useApp } from '../app.js';
import { useTranslate, type Translate } from '../i18n/index.js';

const KEYS: Record<FormatIssueCode, Parameters<Translate>[0]> = {
  'missing-frontmatter': 'format.missingFrontmatter',
  'scalar-frontmatter': 'format.scalarFrontmatter',
  'body-looks-like-frontmatter': 'format.bodyLooksLikeFrontmatter',
  'mixed-line-endings': 'format.mixedLineEndings',
  'no-trailing-newline': 'format.noTrailingNewline',
};

export function FormatNotes({ issues, path }: { issues: FormatIssue[]; path?: string }) {
  const t = useTranslate();
  const prettier = usePrettierNote(path);
  if (issues.length === 0 && prettier === undefined) return null;
  return (
    <div className="format-notes">
      <p className="field-label">{t('format.title')}</p>
      <ul>
        {issues.map((issue) => (
          <li key={`${issue.code}:${issue.path}`} className="format-note" data-code={issue.code}>
            {t(KEYS[issue.code])}
          </li>
        ))}
        {prettier !== undefined && (
          <li className="format-note" data-code="prettier">
            {t('format.notFormatted')}
            {prettier > 0 ? ` (line ${prettier})` : ''}
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * Whether Prettier would rewrite this file, asked of the backend when it can answer.
 *
 * Only the local proxy backend can: a config is a file that may import plugins, so evaluating it
 * needs a filesystem. Every other backend has no `checkFormat`, and the answer is simply "no note"
 * — the editor never guesses at formatting it cannot check.
 *
 * The check runs when a different file is opened, not on every keystroke: it costs a round trip to a
 * separate process, and the author cannot act on the answer while still typing.
 */
function usePrettierNote(path: string | undefined): number | undefined {
  const { storage } = useApp();
  const [line, setLine] = useState<number | undefined>(undefined);

  useEffect(() => {
    setLine(undefined);
    if (!path || !storage?.checkFormat) return;
    let cancelled = false;
    void storage
      .checkFormat([path])
      .then((report) => {
        if (cancelled || report.unavailable) return;
        const finding = report.findings.find((item) => item.path === path);
        setLine(finding ? finding.firstDiffLine : 0);
      })
      .catch(() => {
        // A backend that cannot answer is not a formatting problem.
      });
    return () => {
      cancelled = true;
    };
  }, [storage, path]);

  return line;
}
