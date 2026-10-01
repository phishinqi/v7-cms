/** Keep an existing explicit offset; new timestamps use the browser's local offset. */
export function pickerValue(value: string, dateOnly: boolean): string {
  if (dateOnly) return value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00`;
  return value.replace(/(Z|[+-]\d{2}:\d{2})$/, '');
}
export function storedDate(value: string, previous: string, dateOnly: boolean): string {
  if (!value || dateOnly) return value;
  const existing = previous.match(/(Z|[+-]\d{2}:\d{2})$/)?.[1];
  const minutes = -new Date(value).getTimezoneOffset();
  const offset = `${minutes >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`;
  return value + (existing ?? offset);
}
export function currentDate(dateOnly: boolean, previous: string, now = new Date()): string {
  if (dateOnly) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  const offset = previous.match(/(Z|[+-]\d{2}:\d{2})$/)?.[1];
  if (offset) {
    const minutes =
      offset === 'Z'
        ? 0
        : (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4))) *
          (offset[0] === '+' ? 1 : -1);
    return new Date(now.getTime() + minutes * 60000).toISOString().slice(0, 19) + offset;
  }
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
  return storedDate(local, '', false);
}
