import { useEffect, useState, useRef } from 'react';
import { useApp } from '../app.js';
import { useTranslate } from '../i18n/index.js';

function tagName(item: unknown): string | undefined {
  const name =
    typeof item === 'string'
      ? item
      : item && typeof item === 'object' && 'name' in item
        ? item.name
        : undefined;
  return typeof name === 'string' && name.trim() ? name.trim() : undefined;
}

function tagNames(items: unknown[]): string[] {
  return [...new Set(items.map(tagName).filter((name): name is string => name !== undefined))];
}

export function TagPicker({
  id,
  value,
  onChange,
  file,
  kind = 'tags',
}: {
  id: string;
  value: string[];
  onChange(value: string[]): void;
  file: string;
  kind?: 'tags' | 'authors';
}) {
  const { storage } = useApp();
  const t = useTranslate();
  const [items, setItems] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const label = (id: string) => labels[id] ?? id;
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    if (storage)
      void storage
        .readFile(file)
        .then((result) => {
          const data = JSON.parse(result.text);
          if (!Array.isArray(data?.[kind]))
            throw new Error(
              t(kind === 'authors' ? 'author.invalidRegistry' : 'tag.invalidRegistry'),
            );
          if (!active) return;
          if (kind === 'authors') {
            const entries = data.authors.filter(
              (item: unknown): item is { id: string; name?: string } =>
                !!item &&
                typeof item === 'object' &&
                'id' in item &&
                typeof item.id === 'string' &&
                !!item.id.trim(),
            );
            setItems([...new Set<string>(entries.map((item: { id: string }) => item.id))]);
            setLabels(
              Object.fromEntries(
                entries.map((item: { id: string; name?: unknown }) => [
                  item.id,
                  typeof item.name === 'string' && item.name.trim() ? item.name : item.id,
                ]),
              ),
            );
          } else setItems(tagNames(data.tags));
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [storage, file, kind, t]);
  async function create() {
    const tag = name.trim();
    if (!storage || !tag) return;
    setBusy(true);
    setError('');
    try {
      if (tag.length > 40 || /[\\/#?%]/.test(tag) || tag === '.' || tag === '..')
        throw new Error(t('tag.invalidName'));
      const current = await storage.readFile(file);
      const data = JSON.parse(current.text);
      if (!Array.isArray(data?.tags)) throw new Error(t('tag.invalidRegistry'));
      if (!tagNames(data.tags).includes(tag)) {
        const firstValid = data.tags.find((item: unknown) => tagName(item) !== undefined);
        data.tags.push(typeof firstValid === 'string' ? tag : { name: tag });
        await storage.writeFile(file, JSON.stringify(data, null, 2) + '\n', {
          message: `Create tag ${tag}`,
          ...(current.sha ? { sha: current.sha } : {}),
        });
      }
      setItems(tagNames(data.tags));
      onChange([...new Set([...value, tag])]);
      setName('');
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const query = name.trim();
  const matches = [...new Set(items)].filter(
    (tag) =>
      !value.includes(tag) &&
      `${label(tag)} ${tag}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const canCreate = kind === 'tags' && !!query && !items.includes(query) && !value.includes(query);
  const choices = [...matches, ...(canCreate ? [query] : [])];
  const selectedIndex = Math.min(active, Math.max(0, choices.length - 1));
  function choose(index: number) {
    const tag = choices[index];
    if (!tag || busy) return;
    if (canCreate && index === matches.length) {
      void create();
      return;
    }
    onChange([...new Set([...value, tag])]);
    setName('');
    setOpen(false);
    input.current?.focus();
  }
  return (
    <div
      className="tag-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="tag-picker-control">
        {value.map((tag) => (
          <span className="tag-chip" key={tag}>
            <span>{label(tag)}</span>
            <button
              type="button"
              disabled={busy}
              aria-label={t('tag.remove', { name: label(tag) })}
              onClick={() => onChange(value.filter((item) => item !== tag))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={input}
          id={id}
          className="tag-picker-input"
          value={name}
          disabled={busy}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && choices.length > 0}
          aria-controls={`${id}-options`}
          aria-activedescendant={
            open && choices.length ? `${id}-option-${selectedIndex}` : undefined
          }
          placeholder={t(kind === 'authors' ? 'author.search' : 'tag.search')}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setName(event.target.value);
            setActive(0);
            setOpen(true);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              setActive(
                Math.max(
                  0,
                  Math.min(
                    choices.length - 1,
                    open ? selectedIndex + (event.key === 'ArrowDown' ? 1 : -1) : 0,
                  ),
                ),
              );
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              if (open) choose(selectedIndex);
            }
          }}
        />
        {busy && (
          <span className="tag-picker-pending" role="status">
            {t('action.working')}
          </span>
        )}
      </div>
      {open && choices.length > 0 && (
        <ul
          className="tag-picker-options"
          id={`${id}-options`}
          role="listbox"
          aria-label={t(kind === 'authors' ? 'author.choose' : 'tag.choose')}
        >
          {choices.map((tag, index) => (
            <li
              key={tag}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              className="tag-picker-option"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
            >
              {canCreate && index === matches.length ? (
                <>
                  <span className="tag-picker-plus" aria-hidden="true">
                    +
                  </span>
                  {t('tag.createNamed', { name: tag })}
                </>
              ) : (
                label(tag)
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="field-hint tag-picker-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
