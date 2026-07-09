/**
 * Timezone helpers shared by the schedulers and "is it today" checks. The app
 * runs single-tenant in one configured timezone (APP_TIMEZONE), so we interpret
 * all calendar-day / hour logic in that zone.
 */
export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  weekday: number; // 0 = Sunday .. 6 = Saturday
  dateKey: string; // YYYY-MM-DD in the given timezone
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;
  const year = parseInt(get('year'), 10);
  const month = parseInt(get('month'), 10);
  const day = parseInt(get('day'), 10);
  return {
    year,
    month,
    day,
    hour,
    minute: parseInt(get('minute'), 10),
    weekday: WEEKDAYS[get('weekday')] ?? date.getDay(),
    dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

export function zonedDateKey(date: Date, timeZone: string): string {
  return zonedParts(date, timeZone).dateKey;
}

/** True if both instants fall on the same calendar day in the given zone. */
export function isSameZonedDay(a: Date, b: Date, timeZone: string): boolean {
  return zonedDateKey(a, timeZone) === zonedDateKey(b, timeZone);
}
