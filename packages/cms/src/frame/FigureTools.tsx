import { useMemo, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ImagePlus,
  PanelLeft,
  PanelRight,
  X,
} from 'lucide-react';
import type { MediaTarget } from '../upload/media.js';
import { ImagePicker } from './ImagePicker.js';
import { useTranslate } from '../i18n/index.js';
import {
  articleStructure,
  insertArticleFigure,
  replaceArticleFigure,
  type ArticleFigure,
  type FigureAlign,
} from './article-figures.js';

const blankFigure = (): ArticleFigure => ({
  src: '',
  alt: '',
  caption: '',
  width: 480,
  align: 'center',
});

const alignmentIcons = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
  'wrap-left': PanelLeft,
  'wrap-right': PanelRight,
};

export function FigureTools({
  value,
  onChange,
  extension,
  mediaTarget,
}: {
  value: string;
  onChange(value: string): void;
  extension?: string;
  mediaTarget: MediaTarget;
}) {
  const t = useTranslate();
  const { positions, figures } = useMemo(() => articleStructure(value), [value]);
  const [draft, setDraft] = useState<ArticleFigure | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [position, setPosition] = useState('end');
  const [error, setError] = useState('');

  const close = () => {
    setDraft(null);
    setEditing(null);
    setError('');
  };
  const startNew = () => {
    setEditing(null);
    setPosition('end');
    setDraft(blankFigure());
    setError('');
  };
  const startEdit = (index: number) => {
    const selected = figures[index];
    if (!selected) return;
    setEditing(index);
    setPosition('keep');
    setDraft({ ...selected.figure });
    setError('');
  };
  const save = () => {
    if (!draft) return;
    if (!/^(\/(?!\/)|https:\/\/)/.test(draft.src.trim()) || !draft.alt.trim()) {
      setError(t('figure.invalidImage'));
      return;
    }
    if (
      !Number.isInteger(draft.width) ||
      draft.width < 80 ||
      draft.width > 1600 ||
      (draft.height !== undefined &&
        (!Number.isInteger(draft.height) || draft.height < 80 || draft.height > 1600))
    ) {
      setError(t('figure.invalidSize'));
      return;
    }
    const current = editing === null ? undefined : figures[editing];
    const next = current ? replaceArticleFigure(value, current, null) : value;
    onChange(
      current && position === 'keep'
        ? replaceArticleFigure(value, current, draft, extension)
        : insertArticleFigure(next, draft, position, extension),
    );
    close();
  };
  const remove = () => {
    const current = editing === null ? undefined : figures[editing];
    if (current) onChange(replaceArticleFigure(value, current, null));
    close();
  };

  return (
    <section className="figure-tools" aria-label={t('figure.title')}>
      <div className="figure-tools-head">
        <button type="button" className="button" onClick={startNew}>
          <ImagePlus size={16} aria-hidden="true" /> {t('figure.insert')}
        </button>
        {figures.length > 0 && (
          <select
            className="input figure-existing"
            aria-label={t('figure.editExisting')}
            value=""
            onChange={(event) => startEdit(Number(event.target.value))}
          >
            <option value="" disabled>
              {t('figure.editExisting')}
            </option>
            {figures.map((item, index) => (
              <option key={`${item.start}-${index}`} value={index}>
                {index + 1}. {item.figure.caption || item.figure.alt}
              </option>
            ))}
          </select>
        )}
      </div>
      {draft && (
        <div className="figure-composer">
          <div className="figure-composer-head">
            <h3>{editing === null ? t('figure.insert') : t('figure.edit')}</h3>
            <button
              type="button"
              className="icon-button"
              onClick={close}
              aria-label={t('common.cancel')}
              title={t('common.cancel')}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="figure-composer-grid">
            <div className="field figure-image-field">
              <label className="field-label" htmlFor="article-figure-src">
                {t('figure.image')}
              </label>
              <ImagePicker
                id="article-figure-src"
                value={draft.src}
                target={mediaTarget}
                onChange={(src, uploaded) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          src,
                          width: uploaded ? Math.min(uploaded.width, 480) : current.width,
                        }
                      : null,
                  )
                }
              />
            </div>
            <label className="field">
              <span className="field-label">{t('figure.alt')}</span>
              <input
                className="input"
                value={draft.alt}
                onChange={(event) => setDraft({ ...draft, alt: event.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">{t('figure.caption')}</span>
              <input
                className="input"
                value={draft.caption}
                onChange={(event) => setDraft({ ...draft, caption: event.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">{t('figure.position')}</span>
              <select
                className="input"
                value={position}
                onChange={(event) => setPosition(event.target.value)}
              >
                {editing !== null && <option value="keep">{t('figure.keepPosition')}</option>}
                <option value="start">{t('figure.start')}</option>
                {positions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {t(item.kind === 'heading' ? 'figure.afterHeading' : 'figure.afterParagraph', {
                      name: item.label,
                    })}
                  </option>
                ))}
                <option value="end">{t('figure.end')}</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">{t('figure.width')}</span>
              <input
                className="input"
                type="number"
                min="80"
                max="1600"
                step="1"
                value={draft.width}
                onChange={(event) => setDraft({ ...draft, width: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              <span className="field-label">{t('figure.height')}</span>
              <input
                className="input"
                type="number"
                min="80"
                max="1600"
                step="1"
                value={draft.height ?? ''}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    height: event.target.value ? Number(event.target.value) : undefined,
                  })
                }
              />
            </label>
          </div>
          <div className="field">
            <span className="field-label" id="figure-align-label">
              {t('figure.align')}
            </span>
            <div className="figure-align" role="group" aria-labelledby="figure-align-label">
              {(Object.keys(alignmentIcons) as FigureAlign[]).map((align) => {
                const Icon = alignmentIcons[align];
                const label = t(`figure.align.${align}`);
                return (
                  <button
                    key={align}
                    type="button"
                    className="figure-align-option"
                    aria-label={label}
                    title={label}
                    aria-pressed={draft.align === align}
                    onClick={() => setDraft({ ...draft, align })}
                  >
                    <Icon size={17} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="figure-composer-actions">
            {editing !== null && (
              <button type="button" className="button danger" onClick={remove}>
                {t('figure.remove')}
              </button>
            )}
            <button type="button" className="button" onClick={close}>
              {t('common.cancel')}
            </button>
            <button type="button" className="button primary" onClick={save}>
              {editing === null ? t('figure.insert') : t('figure.update')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
