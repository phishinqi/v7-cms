import { useRef } from 'react';
import { useTranslate } from '../i18n/index.js';
import { pickerValue, storedDate, currentDate } from './date-value.js';

export function DateTimePicker({
  id,
  value,
  dateOnly,
  onChange,
}: {
  id: string;
  value: string;
  dateOnly: boolean;
  onChange(value: string): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const t = useTranslate();
  return (
    <div>
      <input
        ref={input}
        id={id}
        className="input"
        type={dateOnly ? 'date' : 'datetime-local'}
        step={dateOnly ? undefined : 1}
        value={pickerValue(value, dateOnly)}
        onChange={(event) => onChange(storedDate(event.target.value, value, dateOnly))}
      />
      <button
        type="button"
        className="button"
        onClick={() => {
          try {
            input.current?.showPicker();
          } catch {
            input.current?.focus();
          }
        }}
      >
        {t('date.choose')}
      </button>
      <button
        type="button"
        className="button"
        onClick={() => onChange(currentDate(dateOnly, value))}
      >
        {t(dateOnly ? 'date.today' : 'date.now')}
      </button>
      {!dateOnly && (
        <p className="field-hint">
          {t('date.zone')}: {value.match(/(Z|[+-]\d{2}:\d{2})$/)?.[1] ?? t('date.local')}
        </p>
      )}
    </div>
  );
}
