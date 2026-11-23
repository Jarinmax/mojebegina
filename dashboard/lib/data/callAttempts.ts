// Opakované volání, když klient nezvedá (Lucie + Jarin, 22. 11. 2026).
// Rozumně, ne „stalking“:
//   1. nezvedá → hned SMS/WhatsApp (šablona v UI)
//   2. pokus: čerstvý lead z formuláře (do hodiny) za 10 minut, jinak za 2–3 h
//      v jinou část dne
//   3. pokus: další pracovní den, jiná doba (kavárny ne v obědovou špičku)
//   4. pokus: za 3 pracovní dny + krátký e-mail
//   konec: po 4 marných pokusech „Nedovolali jsme se“, jedna připomínka za měsíc
// Nanejvýš 2 hovory za den a 4 za týden. Čistá logika bez DB.
import { DateTime } from "luxon";

export const MAX_CALL_ATTEMPTS = 4;
const ZONE = "Europe/Prague";
const FRESH_LEAD_MINUTES = 60;
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 17;

export type AttemptPlan = {
  /** Kolikátý pokus právě nevyšel (1 = první hovor). */
  failedAttempt: number;
  /** Kdy zkusit znovu; null = už nevolat (konec řady). */
  nextAt: Date | null;
  /** Po posledním pokusu: připomenout jednou za měsíc. */
  remindAt: Date | null;
  stop: boolean;
  suggestEmail: boolean;
  /** Krátký text pro obchodníka, např. „Pokus 1/4 nevyšel · další dnes 16:30“. */
  label: string;
};

function isWorkday(d: DateTime): boolean {
  return d.weekday <= 5;
}

function nextWorkday(d: DateTime): DateTime {
  let x = d.plus({ days: 1 });
  while (!isWorkday(x)) x = x.plus({ days: 1 });
  return x;
}

function addWorkdays(d: DateTime, n: number): DateTime {
  let x = d;
  for (let i = 0; i < n; i++) x = nextWorkday(x);
  return x;
}

/** Posune čas mimo oběd (11:30–13:30) a mimo pracovní dobu na nejbližší rozumný okamžik. */
function fitToCallingHours(d: DateTime): DateTime {
  let x = d;
  if (!isWorkday(x) || x.hour >= DAY_END_HOUR) x = nextWorkday(x).set({ hour: 9, minute: 30, second: 0, millisecond: 0 });
  if (x.hour < DAY_START_HOUR) x = x.set({ hour: 9, minute: 30, second: 0, millisecond: 0 });
  const minutes = x.hour * 60 + x.minute;
  if (minutes >= 11 * 60 + 30 && minutes < 13 * 60 + 30) x = x.set({ hour: 14, minute: 30, second: 0, millisecond: 0 });
  return x;
}

function roundToQuarter(d: DateTime): DateTime {
  const m = Math.ceil(d.minute / 15) * 15;
  return d.set({ minute: 0, second: 0, millisecond: 0 }).plus({ minutes: m });
}

function whenLabel(at: DateTime, now: DateTime): string {
  const time = at.toFormat("H:mm");
  if (at.hasSame(now, "day")) return `dnes ${time}`;
  if (at.hasSame(now.plus({ days: 1 }), "day")) return `zítra ${time}`;
  return `${at.setLocale("cs").toFormat("ccc d. M.")} ${time}`;
}

export function planNextAttempt(input: { failedAttempt: number; leadCreatedAt: Date; now?: Date }): AttemptPlan {
  const now = DateTime.fromJSDate(input.now ?? new Date()).setZone(ZONE);
  const n = Math.max(1, input.failedAttempt);
  let next: DateTime | null = null;
  let suggestEmail = false;

  if (n === 1) {
    const ageMin = now.diff(DateTime.fromJSDate(input.leadCreatedAt).setZone(ZONE), "minutes").minutes;
    next = ageMin <= FRESH_LEAD_MINUTES ? fitToCallingHours(now.plus({ minutes: 10 })) : fitToCallingHours(roundToQuarter(now.plus({ hours: 2, minutes: 30 })));
  } else if (n === 2) {
    const morning = now.hour < 12;
    next = nextWorkday(now).set({ hour: morning ? 14 : 9, minute: 30, second: 0, millisecond: 0 });
  } else if (n === 3) {
    next = addWorkdays(now, 3).set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
    suggestEmail = true;
  }

  if (next) {
    return {
      failedAttempt: n,
      nextAt: next.toJSDate(),
      remindAt: null,
      stop: false,
      suggestEmail,
      label: `Pokus ${n}/${MAX_CALL_ATTEMPTS} nevyšel · další pokus ${whenLabel(next, now)}`,
    };
  }

  const remind = addWorkdays(now.plus({ days: 28 }), 1).set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
  return {
    failedAttempt: n,
    nextAt: null,
    remindAt: remind.toJSDate(),
    stop: true,
    suggestEmail: false,
    label: `Pokus ${n}/${MAX_CALL_ATTEMPTS} nevyšel · konec, nevolat. Jednou připomenu ${whenLabel(remind, now)}.`,
  };
}

/** Kolik pokusů po sobě nevyšlo — z historie hovorů od nejnovějšího. */
export function countConsecutiveNoAnswers(
  activity: { kind: string; metadata: Record<string, unknown> | null }[]
): number {
  let count = 0;
  for (const a of activity) {
    if (a.kind !== "call_logged") continue;
    if (a.metadata?.callResult === "no_answer") count += 1;
    else break;
  }
  return count;
}

export function smsText(salesName: string | null): string {
  const intro = salesName ? `tady ${salesName.split(" ")[0]} z Beginy` : "tady Begina";
  return `Dobrý den, ${intro}. Volali jsme vám kvůli ochutnávce našich polévek a sirupů do provozu. Kdy se vám hodí zavolat? Děkuji.`;
}
