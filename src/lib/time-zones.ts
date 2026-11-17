/** Calendar arithmetic is explicit: browser/server defaults never define a requested zone. */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}
export interface ZonedParts extends CalendarDate {
  weekday: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
export function isTimeZone(value: string): boolean {
  // Modern Intl also accepts unnamed numeric offsets, which cannot model DST.
  // This contract requires a named IANA zone (including UTC and supported aliases).
  if (!value || value.length > 100 || /^[+-]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}
export function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isTimeZone(zone) ? zone : "UTC";
  } catch {
    return "UTC";
  }
}
function formatter(timeZone: string) {
  let value = formatters.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    // Bound the process-wide cache for authenticated but arbitrarily chosen IANA aliases.
    if (formatters.size >= 64) formatters.delete(formatters.keys().next().value!);
    formatters.set(timeZone, value);
  }
  return value;
}
function calendarEpoch(date: CalendarDate, hour = 0, minute = 0, second = 0): number {
  const d = new Date(0);
  d.setUTCFullYear(date.year, date.month - 1, date.day);
  d.setUTCHours(hour, minute, second, 0);
  return d.getTime();
}
export function zonedParts(instant: string | number | Date, timeZone: string): ZonedParts {
  const d = new Date(instant);
  if (!Number.isFinite(d.getTime())) throw new RangeError("Invalid instant");
  const parts = formatter(timeZone).formatToParts(d);
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === name)!.value);
  const date = { year: part("year"), month: part("month"), day: part("day") };
  return {
    ...date,
    weekday: new Date(calendarEpoch(date)).getUTCDay(),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}
export function shiftCalendarDate(date: CalendarDate, days: number): CalendarDate {
  const d = new Date(calendarEpoch(date));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Resolve a wall-clock minute in an IANA zone. Zero results means a DST gap or
 * invalid date; two means an overlap. Never normalize a nonexistent time or
 * assume every UTC offset is an integer number of hours. Offset samples around
 * the date cover both sides of modern DST and dateline changes.
 */
export function zonedInstants(
  date: CalendarDate,
  hour: number,
  minute: number,
  timeZone: string,
): Date[] {
  if (
    ![date.year, date.month, date.day, hour, minute].every(Number.isInteger) ||
    date.year < 1 ||
    date.year > 9998 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  )
    return [];
  const wall = calendarEpoch(date, hour, minute);
  const check = new Date(wall);
  if (
    check.getUTCFullYear() !== date.year ||
    check.getUTCMonth() + 1 !== date.month ||
    check.getUTCDate() !== date.day
  )
    return [];
  const offsets = new Set<number>();
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    const sample = wall + hours * 3600_000;
    const p = zonedParts(sample, timeZone);
    offsets.add(calendarEpoch(p, p.hour, p.minute, p.second) - sample);
  }
  const candidates: number[] = [];
  for (const offset of offsets) {
    const at = wall - offset;
    const p = zonedParts(at, timeZone);
    if (
      p.year === date.year &&
      p.month === date.month &&
      p.day === date.day &&
      p.hour === hour &&
      p.minute === minute
    )
      candidates.push(at);
  }
  return [...new Set(candidates)].sort((a, b) => a - b).map((at) => new Date(at));
}

export function formatZonedInstant(iso: string | null, language: string, timeZone: string): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "—";
  return new Intl.DateTimeFormat(language === "en-US" ? "en-US" : "pt-BR", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "shortOffset",
  }).format(new Date(iso));
}
