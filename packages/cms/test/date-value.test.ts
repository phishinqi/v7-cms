import { it, expect } from 'vitest';
import { pickerValue, storedDate, currentDate } from '../src/frame/date-value.js';
import { inferFields } from '../src/frame/infer-schema.js';

it('keeps wall time and explicit offsets when selecting dates', () => {
  expect(pickerValue('2026-10-02', false)).toBe('2026-10-02T00:00:00');
  expect(pickerValue('2026-10-02T12:30:45+08:00', false)).toBe('2026-10-02T12:30:45');
  expect(storedDate('2026-10-03T14:00', '2026-10-02T12:30:45+08:00', false)).toBe(
    '2026-10-03T14:00+08:00',
  );
  expect(storedDate('2026-10-03T14:00', '2026-10-02T12:30Z', false)).toBe('2026-10-03T14:00Z');
  expect(storedDate('', '2026-10-02T12:30Z', false)).toBe('');
  expect(storedDate('2026-10-03', '', true)).toBe('2026-10-03');
});
it('uses the same instant for Now in the stored offset', () => {
  const now = new Date('2026-10-02T04:30:00Z');
  expect(currentDate(false, '2020-01-01T00:00+08:00', now)).toBe('2026-10-02T12:30:00+08:00');
  expect(currentDate(false, '2020-01-01T00:00-05:30', now)).toBe('2026-10-01T23:00:00-05:30');
  expect(new Date(currentDate(false, '', now)).getTime()).toBe(now.getTime());
});
it('does not infer a timestamp as a date-only field', () => {
  const fields = inferFields({ date: '2026-10-02', updated: '2026-10-02T04:30:00Z' }, {});
  expect(fields[0]?.format).toBe('YYYY-MM-DD');
  expect(fields[1]?.widget).toBe('datetime');
  expect(fields[1]?.format).toBeUndefined();
});
