/**
 * Choosing an image.
 *
 * The value is a path; the work is in what happens to the file before it becomes one. Every upload
 * goes through `prepareImage`, which re-encodes it through a canvas — that is what removes EXIF,
 * GPS and every other kind of metadata. EXIF is read first, purely to prefill the form.
 *
 * Whether this control is used at all is the caller's decision: a settings file usually wants a
 * plain path field, while an album photo wants the full pipeline.
 */
import { useState } from 'react';
import { prepareImage, uploadName, type PreparedImage } from '../upload/image-pipeline.js';
import { useTranslate } from '../i18n/index.js';

export interface ImagePickerProps {
  id: string;
  value: string;
  onChange(src: string, prepared?: PreparedImage & { id: string; name: string }): void;
  /** Where files are written, and the URL prefix they are served from. */
  target: { repoPath: string; publicPath: string };
}

export function ImagePicker({ id, value, onChange, target }: ImagePickerProps) {
  const t = useTranslate();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const choose = async (file: File) => {
    setBusy(true);
    setStatus(t('image.compressing'));
    try {
      const prepared = await prepareImage(file, { longEdge: 2400 });
      const [image] = prepared.variants;
      if (!image) throw new Error(t('image.noOutput'));
      const name = `${uploadName(file.name)}.webp`;
      setStatus('');
      onChange(`${target.publicPath.replace(/\/$/, '')}/${name}`, {
        ...prepared,
        id: name.replace(/\.webp$/, ''),
        name,
      });
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="image-picker">
      {value && <img className="image-preview" src={value} alt="" />}
      <input
        id={id}
        className="input"
        value={value}
        placeholder="/images/…"
        onChange={(event) => onChange(event.target.value)}
      />
      <label className="button image-upload">
        {busy ? t('action.working') : t('action.upload')}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void choose(file);
            event.target.value = '';
          }}
        />
      </label>
      {status && (
        <p className="field-hint" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
