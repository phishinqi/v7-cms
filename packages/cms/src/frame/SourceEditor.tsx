/**
 * The source editor. This is what most bodies open in, because anything a Markdown editor would
 * rewrite — MDX, JSX, structured fences, indented code — is edited here instead.
 *
 * CodeMirror owns the document, so the value is pushed into it only when it changes from the
 * outside; otherwise every keystroke would reset the cursor.
 */
import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';

export interface SourceEditorProps {
  value: string;
  onChange(value: string): void;
  /** Forwarded to the textarea for label association. */
  id?: string;
  /** Shown above the editor when the body was sent here for a reason. */
  readOnly?: boolean;
}

export function SourceEditor({ value, onChange, id, readOnly = false }: SourceEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  // Kept in a ref so the CodeMirror update listener never needs re-creating.
  const notify = useRef(onChange);
  notify.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        bracketMatching(),
        indentOnInput(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        // `codeLanguages` from @codemirror/language-data is deliberately omitted: it adds a
        // lazily-loaded parser for every language it knows, which turns a blog editor into a
        // 114-chunk, 5 MB download. Fenced code still renders; only in-fence highlighting is lost.
        markdown({ base: markdownLanguage }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) notify.current(update.state.doc.toString());
        }),
      ],
    });
    const instance = new EditorView({ state, parent: host.current });
    view.current = instance;
    return () => {
      instance.destroy();
      view.current = null;
    };
    // Built once: external value changes are applied by the effect below.
  }, [readOnly]);

  // Apply an outside change (a different entry, or a reset) without disturbing the cursor when
  // the text already matches.
  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    const current = instance.state.doc.toString();
    if (current === value) return;
    instance.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return (
    <div className="source-editor" id={id} ref={host} data-read-only={readOnly || undefined} />
  );
}
