// Pracovní dny v ČR — termín dodání pro výrobu (Lucie 18. 11. 2026):
// „od zaplacení do 5 pracovních dnů“. Víkendy a státní svátky se nepočítají
// (zákon č. 245/2000 Sb., vč. Velkého pátku a Velikonočního pondělí).
// Pracuje s kalendářními dny v Europe/Prague.

const FIXED_HOLIDAYS = ["01-01", "05-01", "05-08", "07-05", "07-06", "09-28", "10-28", "11-17", "12-24", "12-25", "12-26"];

/** Velikonoční neděle (gregoriánský kalendář, anonymní algoritmus). */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Svátky roku jako "MM-DD". */
export function czHolidays(year: number): Set<string> {
  const set = new Set(FIXED_HOLIDAYS);
  const easter = easterSunday(year);
  const sunday = Date.UTC(year, easter.month - 1, easter.day);
  for (const offset of [-2, 1]) {
    const d = new Date(sunday + offset * 86_400_000);
    set.add(`${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
  }
  return set;
}

const pragueYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" });

function isWorkday(utcMidnight: Date): boolean {
  const dow = utcMidnight.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const key = `${pad(utcMidnight.getUTCMonth() + 1)}-${pad(utcMidnight.getUTCDate())}`;
  return !czHolidays(utcMidnight.getUTCFullYear()).has(key);
}

/**
 * Kalendářní den (Europe/Prague) o `workdays` pracovních dnů po `from`.
 * Den zaplacení se nepočítá: zaplaceno ve středu 18. 11. 2026 → 5 pracovních
 * dnů = středa 25. 11. 2026. Vrací půlnoc UTC daného dne (jen pro datum).
 */
export function addCzWorkdays(from: Date, workdays: number): Date {
  const [y, m, d] = pragueYmd.format(from).split("-").map(Number);
  let cursor = new Date(Date.UTC(y, m - 1, d));
  let left = workdays;
  while (left > 0) {
    cursor = new Date(cursor.getTime() + 86_400_000);
    if (isWorkday(cursor)) left -= 1;
  }
  return cursor;
}

const longDate = new Intl.DateTimeFormat("cs-CZ", { timeZone: "UTC", weekday: "long", day: "numeric", month: "numeric" });
const shortDate = new Intl.DateTimeFormat("cs-CZ", { timeZone: "UTC", day: "numeric", month: "numeric" });

/** „středa 25. 11.“ */
export function formatDeadlineLong(date: Date): string {
  return longDate.format(date).replace(/\s+/g, " ");
}

/** „25. 11.“ */
export function formatDeadlineShort(date: Date): string {
  return shortDate.format(date).replace(/\s+/g, " ").trim();
}
