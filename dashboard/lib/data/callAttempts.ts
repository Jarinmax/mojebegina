// Kadence obvolávání leadů (Jarin 26. 11. 2026, vlákno Investor/Leady) —
// nahrazuje dřívější řadu z 22. 11. (10 min / 2–3 h / další den / +3 dny).
//   den 1  hovor; nezvedá → hned SMS/e-mail (šablona v UI)
//   den 3  hovor
//   den 10 hovor
//   den 20 poslední hovor + poslední e-mail
//   pak    lead přejde do fáze „Newsletter“ (už se nevolá)
// = max. 5 kontaktů (4 hovory + SMS/e-mail). Volací okna 9:30–11:00
// a 14:00–16:00, jen pracovní dny; další pokus v jinou část dne než ten marný.
// Čistá logika bez DB.
import { DateTime } from "luxon";

/** Kolik marných hovorů po sobě, než lead přejde do newsletteru. */
export const MAX_CALL_ATTEMPTS = 4;
/** Den kadence (od 1. hovoru) pro pokus č. 1–4. */
export const CADENCE_DAYS = [1, 3, 10, 20] as const;
const ZONE = "Europe/Prague";

export type AttemptPlan = {
  /** Kolikátý pokus právě nevyšel (1 = první hovor). */
  failedAttempt: number;
  /** Kdy zkusit znovu; null = už nevolat (lead jde do newsletteru). */
  nextAt: Date | null;
  /** Zachováno kvůli kompatibilitě — nová kadence měsíční připomínku nemá. */
  remindAt: Date | null;
  /** true = konec řady → fáze „newsletter“. */
  stop: boolean;
  /** Další krok je poslední pokus + poslední e-mail (den 20). */
  suggestEmail: boolean;
  /** Text dalšího kroku do leadu („Zavolat znovu – pokus 2/4 (den 3)“). */
  nextStepNote: string;
  /** Krátký text pro obchodníka, např. „Pokus 1/4 nevyšel · další pokus út 1. 12. 14:00“. */
  label: string;
};

function isWorkday(d: DateTime): boolean {
  return d.weekday <= 5;
}

function toWorkday(d: DateTime): DateTime {
  let x = d;
  while (!isWorkday(x)) x = x.plus({ days: 1 });
  return x;
}

function whenLabel(at: DateTime, now: DateTime): string {
  const time = at.toFormat("H:mm");
  if (at.hasSame(now, "day")) return `dnes ${time}`;
  if (at.hasSame(now.plus({ days: 1 }), "day")) return `zítra ${time}`;
  return `${at.setLocale("cs").toFormat("ccc d. M.")} ${time}`;
}

export function planNextAttempt(input: { failedAttempt: number; leadCreatedAt?: Date; now?: Date }): AttemptPlan {
  const now = DateTime.fromJSDate(input.now ?? new Date()).setZone(ZONE);
  const n = Math.max(1, input.failedAttempt);

  if (n >= MAX_CALL_ATTEMPTS) {
    return {
      failedAttempt: n,
      nextAt: null,
      remindAt: null,
      stop: true,
      suggestEmail: false,
      nextStepNote: `Nedovolali jsme se (${n} pokusy, den 1/3/10/20) — přešel do newsletteru`,
      label: `Pokus ${n}/${MAX_CALL_ATTEMPTS} nevyšel · konec řady, lead přešel do Newsletteru.`,
    };
  }

  const gapDays = CADENCE_DAYS[n] - CADENCE_DAYS[n - 1];
  const morning = now.hour < 12;
  const next = toWorkday(now.plus({ days: gapDays })).set({
    hour: morning ? 14 : 9,
    minute: morning ? 0 : 30,
    second: 0,
    millisecond: 0,
  });
  const nextAttempt = n + 1;
  const last = nextAttempt === MAX_CALL_ATTEMPTS;
  const nextStepNote = last
    ? `Poslední pokus ${nextAttempt}/${MAX_CALL_ATTEMPTS} (den ${CADENCE_DAYS[n]}) + poslat poslední e-mail`
    : `Zavolat znovu – pokus ${nextAttempt}/${MAX_CALL_ATTEMPTS} (den ${CADENCE_DAYS[n]})`;

  return {
    failedAttempt: n,
    nextAt: next.toJSDate(),
    remindAt: null,
    stop: false,
    suggestEmail: last,
    nextStepNote,
    label: `Pokus ${n}/${MAX_CALL_ATTEMPTS} nevyšel · další pokus ${whenLabel(next, now)}${last ? " + poslední e-mail" : ""}`,
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

/**
 * Pravidlo „žádný aktivní lead bez dalšího kroku a termínu“ (26. 11. 2026):
 * po zápisu hovoru musí aktivní lead mít termín dalšího kontaktu v budoucnu.
 * Vrací chybovou hlášku, nebo null, když je vše v pořádku.
 */
export function requireNextContactError(input: {
  finalStageActive: boolean;
  effectiveNextFollowUpAt: Date | null;
  now?: Date;
}): string | null {
  if (!input.finalStageActive) return null;
  const now = input.now ?? new Date();
  if (input.effectiveNextFollowUpAt && input.effectiveNextFollowUpAt.getTime() > now.getTime()) return null;
  return "Doplňte datum dalšího kontaktu — aktivní lead nesmí zůstat bez termínu. (Když se nedovoláte, klepněte na „Nezvedá“ a termín se naplánuje sám.)";
}
