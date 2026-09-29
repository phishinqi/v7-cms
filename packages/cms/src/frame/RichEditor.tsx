/**
 * The rich-text editor, for bodies that a Markdown round trip will not damage.
 *
 * The rule this component exists to respect: it is only ever mounted for a body that
 * `classifyBody` cleared. Anything carrying MDX, JSX, structured fences or indented code goes to
 * `SourceEditor` instead, because a rich editor would normalise it.
 */
import { useEffect, useRef } from 'react';
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Markdown } from '@tiptap/markdown';

// StarterKit covers the prose nodes; images and links are added because a blog body needs them
// and, without the nodes, a round trip would drop them.
const extensions = [
  StarterKit,
  Link.configure({ openOnClick: false }),
  Image.configure({ inline: false }),
  Markdown,
];

export interface RichEditorProps {
  value: string;
  onChange(value: string): void;
  id?: string;
}

export function RichEditor({ value, onChange, id }: RichEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const editor = useRef<Editor | null>(null);
  const notify = useRef(onChange);
  notify.current = onChange;

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
      },
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

  return <div className="rich-editor" id={id} ref={host} />;
}

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
