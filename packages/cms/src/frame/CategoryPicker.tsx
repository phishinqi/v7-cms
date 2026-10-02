import { useEffect, useState } from 'react';
import { useApp } from '../app.js';
import { useTranslate } from '../i18n/index.js';

type Category = { id: string; title: Record<string, string> };

function categoryId(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `category-${crypto.randomUUID().slice(0, 8)}`
  );
}
export function CategoryPicker({
  id,
  value,
  onChange,
  file,
}: {
  id: string;
  value: string;
  onChange(value: string): void;
  file: string;
}) {
  const { storage, locale } = useApp();
  const t = useTranslate();
  const [items, setItems] = useState<Category[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (storage)
      void storage
        .readFile(file)
        .then((result) => {
          const data = JSON.parse(result.text);
          if (!Array.isArray(data.categories)) throw new Error('Invalid category registry');
          const current = value.trim();
          const existing = data.categories.find((item: Category) => item.id === current);
          if (current && !existing) {
            let key = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(current) ? current : categoryId(current);
            let suffix = 2;
            while (data.categories.some((item: Category) => item.id === key)) {
              key = `${categoryId(current)}-${suffix++}`;
            }
            data.categories.push({
              id: key,
              title: { 'zh-CN': current, en: current },
              description: { 'zh-CN': '', en: '' },
            });
            return storage
              .writeFile(file, JSON.stringify(data, null, 2) + '\n', {
                message: `Register category ${key}`,
                ...(result.sha ? { sha: result.sha } : {}),
              })
              .then(() => {
                if (!active) return;
                setItems(data.categories);
                if (key !== value) onChange(key);
              });
          }
          if (active) setItems(data.categories);
        })
        .catch((e) => {
          if (active) setError(String(e.message));
        });
    return () => {
      active = false;
    };
  }, [storage, file, value]);
  async function create() {
    if (!storage || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const current = await storage.readFile(file);
      const data = JSON.parse(current.text);
      if (!Array.isArray(data.categories)) throw new Error('Invalid category registry');
      const existing = data.categories.find((item: Category) =>
        Object.values(item.title).some((title) => title === name.trim()),
      );
      if (existing) {
        setItems(data.categories);
        onChange(existing.id);
        setCreating(false);
        return;
      }
      const key =
        slug.trim() ||
        name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') ||
        `category-${crypto.randomUUID().slice(0, 8)}`;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) throw new Error(t('category.invalidId'));
      if (data.categories.some((item: Category) => item.id === key))
        throw new Error(t('category.duplicate'));
      data.categories.push({
        id: key,
        title: { 'zh-CN': name.trim(), en: name.trim() },
        description: { 'zh-CN': '', en: '' },
      });
      await storage.writeFile(file, JSON.stringify(data, null, 2) + '\n', {
        message: `Create category ${key}`,
        ...(current.sha ? { sha: current.sha } : {}),
      });
      setItems(data.categories);
      onChange(key);
      setCreating(false);
      setName('');
      setSlug('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {value && !items.some((item) => item.id === value) && (
          <option value={value}>{value}</option>
        )}
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title[locale] ?? item.id}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="button"
        onClick={() => setCreating(!creating)}
        disabled={busy}
      >
        {t('category.new')}
      </button>
      {creating && (
        <div>
          <label>
            {t('category.name')}
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            {t('category.id')}
            <input
              className="input"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={busy}
            />
          </label>
          <p className="field-hint">{t('category.hint')}</p>
          <button
            type="button"
            className="button"
            disabled={busy || !name.trim()}
            onClick={() => void create()}
          >
            {t('category.create')}
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
