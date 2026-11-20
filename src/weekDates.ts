export function dateKey(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function localDate(key: string) {
  return new Date(key + 'T12:00:00');
}

export function validDateKey(key: unknown): key is string {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && dateKey(localDate(key)) === key;
}

export function shiftDate(key: string, days: number) {
  const date = localDate(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function startOfWeek(date: Date) {
  return shiftDate(dateKey(date), -((date.getDay() + 6) % 7));
}
