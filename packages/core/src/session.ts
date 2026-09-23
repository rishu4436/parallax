import type { Atmosphere, Session } from "./types";

/**
 * Full NYSE closures for 2026. Early closes stay in the regular session until 16:00 ET.
 * Source: NYSE holiday calendar (New Year's, MLK, Presidents, Good Friday, Memorial,
 * Juneteenth, Independence observed, Labor, Thanksgiving, Christmas).
 */
export const NYSE_HOLIDAYS_2026 = new Set([
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
]);

const TZ = "America/New_York";

export interface EtParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
  ymd: string;
}

export interface CashSession {
  kind: Session;
  atmosphere: Atmosphere;
  label: string;
  chip: string;
  nextOpen: Date;
  nextClose: Date | null;
  countdownMs: number;
  et: EtParts;
  forced: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function etParts(date: Date): EtParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) bag[p.type] = p.value;
  const hour = Number(bag.hour === "24" ? "0" : bag.hour);
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const year = Number(bag.year);
  const month = Number(bag.month);
  const day = Number(bag.day);
  return {
    year,
    month,
    day,
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
    weekday: weekdayMap[bag.weekday] ?? 0,
    ymd: `${year}-${pad(month)}-${pad(day)}`,
  };
}

function tzOffsetMs(date: Date): number {
  const p = etParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/** Civil time in America/New_York as a UTC instant. */
export function etInstant(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const first = new Date(guess.getTime() - tzOffsetMs(guess));
  const second = new Date(guess.getTime() - tzOffsetMs(first));
  return second;
}

function addDays(ymd: string, days: number): { year: number; month: number; day: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

function isBusinessYmd(ymd: string, weekday: number): boolean {
  if (weekday === 0 || weekday === 6) return false;
  return !NYSE_HOLIDAYS_2026.has(ymd);
}

export function classifyEt(p: EtParts): Session {
  if (p.weekday === 0 || p.weekday === 6) return "weekend";
  if (NYSE_HOLIDAYS_2026.has(p.ymd)) return "holiday";
  const mins = p.hour * 60 + p.minute;
  if (mins < 4 * 60) return "overnight";
  if (mins < 9 * 60 + 30) return "pre";
  if (mins < 16 * 60) return "regular";
  if (mins < 20 * 60) return "post";
  return "overnight";
}

function nextRegularOpen(from: Date): Date {
  const start = etParts(from);
  for (let i = 0; i < 14; i++) {
    const civil = i === 0
      ? { year: start.year, month: start.month, day: start.day }
      : addDays(start.ymd, i);
    const ymd = `${civil.year}-${pad(civil.month)}-${pad(civil.day)}`;
    const probe = etInstant(civil.year, civil.month, civil.day, 12, 0);
    const weekday = etParts(probe).weekday;
    if (!isBusinessYmd(ymd, weekday)) continue;
    const open = etInstant(civil.year, civil.month, civil.day, 9, 30);
    if (open.getTime() > from.getTime()) return open;
  }
  return new Date(from.getTime() + 24 * 3600_000);
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${pad(m)}m`;
}

export function cashSession(now = new Date(), force?: Atmosphere): CashSession {
  const et = etParts(now);
  const kind = force === "open" ? "regular" : force === "closed" ? "overnight" : classifyEt(et);
  const atmosphere: Atmosphere = force ?? (kind === "regular" ? "open" : "closed");
  const nextOpen = atmosphere === "open" ? nextRegularOpen(etInstant(et.year, et.month, et.day, 16, 0)) : nextRegularOpen(now);
  const openToday = etInstant(et.year, et.month, et.day, 9, 30);
  const closeToday = etInstant(et.year, et.month, et.day, 16, 0);
  const nextClose = atmosphere === "open" ? closeToday : null;
  const countdownMs = atmosphere === "open" ? closeToday.getTime() - now.getTime() : nextOpen.getTime() - now.getTime();
  const chip =
    atmosphere === "open"
      ? "US cash open"
      : `US cash closed · ${formatCountdown(nextOpen.getTime() - now.getTime())} to 09:30 ET`;
  const label =
    kind === "regular"
      ? "Regular cash session"
      : kind === "pre"
        ? "Pre-market"
        : kind === "post"
          ? "Post-market"
          : kind === "weekend"
            ? "Weekend"
            : kind === "holiday"
              ? "US equity holiday"
              : "Overnight";
  return {
    kind: force === "closed" ? (classifyEt(et) === "regular" ? "overnight" : classifyEt(et)) : kind,
    atmosphere,
    label,
    chip,
    nextOpen: atmosphere === "open" ? openToday : nextOpen,
    nextClose,
    countdownMs,
    et,
    forced: Boolean(force),
  };
}

export function localClock(now = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now);
}
