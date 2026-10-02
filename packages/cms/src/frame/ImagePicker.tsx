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
import { tokenStore } from '@v7-cms/adapters';
import { useApp } from '../app.js';
import {
  mediaPaths,
  uploadPreparedImage,
  type MediaTarget,
  type UploadedImage,
} from '../upload/media.js';
import {
  IMAGE_ACCEPT,
  prepareImage,
  uploadName,
  type PreparedImage,
} from '../upload/image-pipeline.js';
import { useTranslate } from '../i18n/index.js';

export interface ImagePickerProps {
  id: string;
  value: string;
  onChange(src: string, prepared?: PreparedImage & UploadedImage): void;
  /** Where files are written, and the URL prefix they are served from. */
  target: MediaTarget;
}

export function ImagePicker({ id, value, onChange, target }: ImagePickerProps) {
  const t = useTranslate();
  const { config, storage } = useApp();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const choose = async (file: File) => {
    setBusy(true);
    setStatus(t('image.compressing'));
    try {
      if (!storage) throw new Error('Connect a storage backend before uploading.');
      const media = mediaPaths(
        { ...config.media, ...target },
        target.slug ?? '',
        target.collection ?? '',
      );
      const prepared = await prepareImage(
        file,
        media.provider === 'r2'
          ? { widths: [480, 960, 1600, 2400] }
          : { longEdge: media.maxEdge ?? 2400 },
      );
      const [image] = prepared.variants;
      if (!image) throw new Error(t('image.noOutput'));
      const name = `${uploadName(file.name)}.webp`;
      const token = tokenStore.read() ?? tokenStore.read('local');
      const uploaded = await uploadPreparedImage(
        prepared,
        name,
        media,
        storage,
        token ? { token } : {},
      );
      setStatus('');
      onChange(uploaded.src, {
        ...prepared,
        ...uploaded,
        exif: media.exif === false ? {} : prepared.exif,
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
          accept={IMAGE_ACCEPT}
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
