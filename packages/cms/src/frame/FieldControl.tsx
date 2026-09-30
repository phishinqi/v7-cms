/**
 * Field controls.
 *
 * One component per widget name, kept deliberately plain: they read a value, report changes, and
 * show validation. Nested content (objects, lists) recurses through `FieldControl`, so an album's
 * list of photo objects renders the same way a top-level object does.
 */
import type { Field } from '@v7-cms/core';
import { getFieldType } from '@v7-cms/core';
import { ImagePicker } from './ImagePicker.js';
import { useTranslate } from '../i18n/index.js';

// A sensible default, so an image field works before a collection configures where media goes.
const DEFAULT_MEDIA = { repoPath: 'public/images/uploads', publicPath: '/images/uploads' };

export interface FieldControlProps {
  field: Field;
  value: unknown;
  issues: Array<{ path: string; message: string }>;
  onChange(value: unknown): void;
  /** Dotted path of this field, used to match issues and to build child paths. */
  path: string;
  /** Where an uploaded image goes, and the URL it is served from. */
  mediaTarget?: { repoPath: string; publicPath: string };
}

const issuesAt = (issues: FieldControlProps['issues'], path: string) =>
  issues.filter((issue) => issue.path === path);

function Wrapper({
  field,
  children,
  issues,
  path,
}: FieldControlProps & { children: React.ReactNode }) {
  const t = useTranslate();
  const messages = issuesAt(issues, path);
  return (
    <div className="field" data-field={field.name} data-invalid={messages.length > 0}>
      <label className="field-label" htmlFor={idFor(path)}>
        {field.label ?? field.name}
        {field.required !== true && <span className="field-optional"> {t('field.optional')}</span>}
      </label>
      {children}
      {field.hint && <p className="field-hint">{field.hint}</p>}
      {messages.map((issue) => (
        <p className="field-error" key={issue.message} role="alert">
          {issue.message}
        </p>
      ))}
    </div>
  );
}

/** Stable element ids, so labels and inputs stay associated. */
export function idFor(path: string): string {
  return `${path.replace(/[^a-zA-Z0-9]+/g, '-')}-field`;
}

const asText = (value: unknown): string =>
  typeof value === 'string' ? value : value == null ? '' : String(value);

export function FieldControl(props: FieldControlProps): React.ReactElement | null {
  const { field, value, onChange, path, mediaTarget = DEFAULT_MEDIA } = props;
  const widget = field.widget ?? 'string';

  switch (widget) {
    case 'text':
      return (
        <Wrapper {...props}>
          <textarea
            id={idFor(path)}
            className="input textarea"
            rows={4}
            value={asText(value)}
            onChange={(event) => onChange(event.target.value)}
          />
        </Wrapper>
      );

    case 'number':
      return (
        <Wrapper {...props}>
          <input
            id={idFor(path)}
            className="input"
            type="number"
            value={value === undefined || value === null ? '' : String(value)}
            onChange={(event) =>
              onChange(event.target.value === '' ? '' : Number(event.target.value))
            }
          />
        </Wrapper>
      );

    case 'boolean':
      return (
        <Wrapper {...props}>
          <label className="toggle">
            <input
              id={idFor(path)}
              type="checkbox"
              checked={value === true}
              onChange={(event) => onChange(event.target.checked)}
            />
            <span>{field.label ?? field.name}</span>
          </label>
        </Wrapper>
      );

    case 'select':
      return (
        <Wrapper {...props}>
          <select
            id={idFor(path)}
            className="input"
            value={asText(value)}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">—</option>
            {(field.options ?? []).map((option) => {
              const value = typeof option === 'string' ? option : option.value;
              const label = typeof option === 'string' ? option : option.label;
              return (
                <option key={value} value={value}>
                  {label}
                </option>
              );
            })}
          </select>
        </Wrapper>
      );

    case 'datetime':
      return (
        <Wrapper {...props}>
          <input
            id={idFor(path)}
            className="input"
            type={field.format === 'YYYY-MM-DD' ? 'date' : 'text'}
            placeholder="2026-09-21T09:00:00+08:00"
            value={asText(value)}
            onChange={(event) => onChange(event.target.value)}
          />
        </Wrapper>
      );

    case 'relation':
      return (
        <Wrapper {...props}>
          <input
            id={idFor(path)}
            className="input"
            value={asText(value)}
            onChange={(event) => onChange(event.target.value)}
          />
        </Wrapper>
      );

    case 'object':
      return (
        <Wrapper {...props}>
          <div className="object">
            {(field.fields ?? []).map((child) => (
              <FieldControl
                key={child.name}
                field={child}
                path={`${path}.${child.name}`}
                value={(value as Record<string, unknown> | undefined)?.[child.name]}
                issues={props.issues}
                onChange={(next) => onChange({ ...(value as object), [child.name]: next })}
              />
            ))}
          </div>
        </Wrapper>
      );

    case 'list':
      return <ListControl {...props} />;

    // A localized string is one input per locale. The locales come from the config when it names
    // them and from the value otherwise, so adding a language needs no code change.
    case 'i18n-string':
      return <LocalizedControl {...props} />;

    // An image is a path. The picker adds an upload that compresses the file and strips its
    // metadata before it becomes one; a settings file usually just types the path.
    case 'image':
      return (
        <Wrapper {...props}>
          <ImagePicker
            id={idFor(path)}
            value={asText(value)}
            target={mediaTarget}
            onChange={(src, prepared) => {
              // A photo wants its size and colour recorded too, which is what the upload knows.
              if (prepared && field.fields?.length) {
                const [image] = prepared.variants;
                onChange({
                  ...(typeof value === 'object' && value ? value : {}),
                  src,
                  width: image?.width,
                  height: image?.height,
                  color: prepared.color,
                });
                return;
              }
              onChange(src);
            }}
          />
        </Wrapper>
      );

    default:
      return (
        <Wrapper {...props}>
          <input
            id={idFor(path)}
            className="input"
            value={asText(value)}
            onChange={(event) => onChange(event.target.value)}
          />
        </Wrapper>
      );
  }
}

/**
 * Lists come in two shapes. With `fields` each item is an object and gets a summary line and its
 * own nested controls; with `field` each item is a scalar. Reordering is by explicit buttons so
 * it works on a touch screen without a drag library.
 */
function ListControl(all: FieldControlProps) {
  const t = useTranslate();
  const { field, value, onChange, issues, path } = all;
  const items = Array.isArray(value) ? value : [];
  const itemFields = field.fields ?? (field.field ? [field.field] : []);

  const replace = (index: number, next: unknown) => {
    const copy = [...items];
    copy[index] = next;
    onChange(copy);
  };
  const move = (index: number, by: number) => {
    const target = index + by;
    if (target < 0 || target >= items.length) return;
    const copy = [...items];
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item);
    onChange(copy);
  };

  const summaryOf = (item: unknown, index: number): string => {
    if (field.fields) {
      for (const key of ['title', 'name', 'alt', 'src', 'id']) {
        const candidate = (item as Record<string, unknown>)?.[key];
        if (typeof candidate === 'string' && candidate.trim() !== '') return candidate;
      }
      return `Item ${index + 1}`;
    }
    return asText(item) || `Item ${index + 1}`;
  };

  return (
    <Wrapper {...all}>
      <ul className="list">
        {items.map((item, index) => (
          <li className="list-item" key={index}>
            <div className="list-row">
              <span className="list-summary">{summaryOf(item, index)}</span>
              <div className="list-actions">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  aria-label={t('action.moveUp')}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  aria-label={t('action.moveDown')}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, at) => at !== index))}
                  aria-label={`Remove ${summaryOf(item, index)}`}
                >
                  ×
                </button>
              </div>
            </div>
            {field.fields ? (
              <div className="list-fields">
                {(field.fields ?? []).map((child) => (
                  <FieldControl
                    key={child.name}
                    field={child}
                    path={`${path}.${index}.${child.name}`}
                    value={(item as Record<string, unknown> | undefined)?.[child.name]}
                    issues={issues}
                    mediaTarget={all.mediaTarget}
                    onChange={(next) => replace(index, { ...(item as object), [child.name]: next })}
                  />
                ))}
              </div>
            ) : (
              <FieldControl
                field={itemFields[0]!}
                path={`${path}.${index}`}
                value={item}
                issues={issues}
                mediaTarget={all.mediaTarget}
                onChange={(next) => replace(index, next)}
              />
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="button add-item"
        onClick={() => onChange([...items, emptyItem(itemFields)])}
      >
        {t('action.add')} {field.labelSingular ?? field.label ?? ''}
      </button>
    </Wrapper>
  );
}

/** A fresh list item: scalar fields get their type's default, objects get one key per field. */
function emptyItem(fields: Field[]): unknown {
  if (fields.length === 1 && fields[0]!.fields === undefined) {
    const type = getFieldType(fields[0]!.widget ?? 'string');
    return fields[0]!.default ?? type?.defaultValue?.() ?? '';
  }
  const item: Record<string, unknown> = {};
  for (const field of fields) {
    const type = getFieldType(field.widget ?? 'string');
    item[field.name] = field.default ?? type?.defaultValue?.() ?? '';
  }
  return item;
}

/**
 * A `{ locale: text }` object, one input per locale.
 *
 * Keys already in the value are kept, so a locale the config does not mention survives an edit
 * rather than being dropped.
 */
function LocalizedControl(all: FieldControlProps) {
  const { field, value, onChange, path } = all;
  const record = (value && typeof value === 'object' ? value : {}) as Record<string, string>;
  const configured = (field as { locales?: string[] }).locales;
  const locales = configured?.length ? configured : Object.keys(record);
  const shown = locales.length ? locales : ['zh-CN', 'en'];

  return (
    <Wrapper {...all}>
      <div className="localized">
        {shown.map((locale) => (
          <label className="localized-row" key={locale}>
            <span className="localized-locale" lang={locale}>
              {locale}
            </span>
            <input
              id={idFor(`${path}.${locale}`)}
              className="input"
              lang={locale}
              value={record[locale] ?? ''}
              onChange={(event) => onChange({ ...record, [locale]: event.target.value })}
            />
          </label>
        ))}
      </div>
    </Wrapper>
  );
}
