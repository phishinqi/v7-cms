/**
 * The rich-text editor, for bodies that a Markdown round trip will not damage.
 *
 * The rule this component exists to respect: it is only ever mounted for a body that
 * `classifyBody` cleared. Anything carrying MDX, JSX, structured fences or indented code goes to
 * `SourceEditor` instead, because a rich editor would normalise it.
 */
import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Markdown } from '@tiptap/markdown';
import { TableKit } from '@tiptap/extension-table';
import type { TableConfig } from './table-utils.js';
import { useTranslate } from '../i18n/index.js';

// StarterKit covers the prose nodes; images and links are added because a blog body needs them
// and, without the nodes, a round trip would drop them.
const extensions = [
  StarterKit.configure({ link: false }),
  Link.configure({ openOnClick: false }),
  Image.configure({ inline: false }),
  TableKit.configure({ table: { resizable: false } }),
  Markdown,
];

export interface RichEditorHandle {
  insertTable(config: Pick<TableConfig, 'rows' | 'columns' | 'hasHeader'>): void;
}

export interface RichEditorProps {
  value: string;
  onChange(value: string): void;
  id?: string;
}

export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(function RichEditor(
  { value, onChange, id },
  ref,
) {
  const host = useRef<HTMLDivElement | null>(null);
  const editor = useRef<Editor | null>(null);
  const notify = useRef(onChange);
  const [tableActive, setTableActive] = useState(false);
  const t = useTranslate();
  notify.current = onChange;
  useImperativeHandle(
    ref,
    () => ({
      insertTable(config) {
        editor.current
          ?.chain()
          .focus()
          .insertTable({
            rows: config.rows,
            cols: config.columns,
            withHeaderRow: config.hasHeader,
          })
          .run();
      },
    }),
    [],
  );

  useEffect(() => {
    if (!host.current) return;
    const instance = new Editor({
      element: host.current,
      extensions,
      content: value,
      contentType: 'markdown',
      onUpdate: ({ editor: current }) => {
        // `getMarkdown()` is Tiptap's serialiser; it is only safe because the caller checked the
        // body first.
        notify.current(current.getMarkdown());
        setTableActive(current.isActive('table'));
      },
      onSelectionUpdate: ({ editor: current }) => setTableActive(current.isActive('table')),
    });
    editor.current = instance;
    return () => {
      instance.destroy();
      editor.current = null;
    };
  }, []);

  // Adopt an outside change (switching entries) without fighting the user's typing.
  useEffect(() => {
    const instance = editor.current;
    if (!instance) return;
    if (instance.getMarkdown() === value) return;
    instance.commands.setContent(value, { contentType: 'markdown' } as {
      contentType: 'markdown';
    } & {
      emitUpdate?: boolean;
    });
  }, [value]);

  return (
    <div className="rich-editor-wrap">
      <div className="rich-editor" id={id} ref={host} />
      {tableActive && (
        <div className="table-context" role="toolbar" aria-label={t('table.actions')}>
          <button
            type="button"
            className="button"
            onClick={() => editor.current?.chain().focus().addRowBefore().run()}
          >
            {t('table.insertAbove')}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => editor.current?.chain().focus().addRowAfter().run()}
          >
            {t('table.insertBelow')}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => editor.current?.chain().focus().addColumnBefore().run()}
          >
            {t('table.insertLeft')}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => editor.current?.chain().focus().addColumnAfter().run()}
          >
            {t('table.insertRight')}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => editor.current?.chain().focus().deleteRow().run()}
          >
            {t('table.deleteRow')}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => editor.current?.chain().focus().deleteColumn().run()}
          >
            {t('table.deleteColumn')}
          </button>
          <button
            type="button"
            className="button danger"
            onClick={() => editor.current?.chain().focus().deleteTable().run()}
          >
            {t('table.delete')}
          </button>
        </div>
      )}
    </div>
  );
});

/** Exported for tests: the Markdown a rich edit would produce for a given document. */
export function richRoundTrip(markdown: string): string {
  const instance = new Editor({
    extensions,
    content: markdown,
    contentType: 'markdown',
  });
  const result = instance.getMarkdown();
  instance.destroy();
  return result;
}

export type { JSONContent };
