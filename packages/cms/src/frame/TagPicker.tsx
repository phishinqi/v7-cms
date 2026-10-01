import { useEffect, useState } from 'react';
import { useApp } from '../app.js';
import { useTranslate } from '../i18n/index.js';

export function TagPicker({
  id,
  value,
  onChange,
  file,
}: {
  id: string;
  value: string[];
  onChange(value: string[]): void;
  file: string;
}) {
  const { storage } = useApp();
  const t = useTranslate();
  const [items, setItems] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (storage)
      void storage
        .readFile(file)
        .then((result) => {
          const data = JSON.parse(result.text);
          if (!Array.isArray(data.tags)) throw new Error(t('tag.invalidRegistry'));
          if (active) setItems(data.tags.map((tag: { name: string }) => tag.name));
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [storage, file, t]);
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
      if (!Array.isArray(data.tags)) throw new Error(t('tag.invalidRegistry'));
      if (!data.tags.some((item: { name: string }) => item.name === tag)) {
        data.tags.push({ name: tag });
        await storage.writeFile(file, JSON.stringify(data, null, 2) + '\n', {
          message: `Create tag ${tag}`,
          ...(current.sha ? { sha: current.sha } : {}),
        });
      }
      setItems(data.tags.map((item: { name: string }) => item.name));
      onChange([...new Set([...value, tag])]);
      setName('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <ul>
        {value.map((tag) => (
          <li key={tag}>
            {tag}{' '}
            <button
              type="button"
              disabled={busy}
              aria-label={t('tag.remove', { name: tag })}
              onClick={() => onChange(value.filter((item) => item !== tag))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <select
        id={id}
        className="input"
        value=""
        disabled={busy}
        onChange={(event) => {
          if (event.target.value) onChange([...new Set([...value, event.target.value])]);
        }}
      >
        <option value="">{t('tag.choose')}</option>
        {items
          .filter((tag) => !value.includes(tag))
          .map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
      </select>
      <label>
        {t('tag.new')}
        <input
          className="input"
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="button"
        disabled={busy || !name.trim()}
        onClick={() => void create()}
      >
        {t('tag.create')}
      </button>
      <p className="field-hint">{t('tag.hint')}</p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
