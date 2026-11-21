// Svěřené peníze spolupracovníka — čistý výpočet bez databáze.
// Pohyby: vklady (+) a jednorázové platby (−) + pravidelná platba,
// která se odečítá automaticky k danému dni každého měsíce. Splátka „nastane“
// až v den splatnosti (Europe/Prague); budoucí jsou jen ve výhledu.

export type TrustEntry = {
  id: string;
  entryDate: string; // YYYY-MM-DD
  kind: "deposit" | "withdrawal";
  amountKc: number;
  description: string;
};

export type TrustPlan = {
  id: string;
  label: string;
  amountKc: number;
  dayOfMonth: number;
  startMonth: string; // YYYY-MM
  endMonth: string | null;
  note: string | null;
};

export type TrustLine = {
  date: string;
  kind: "deposit" | "withdrawal" | "recurring";
  label: string;
  /** Kladně = vklad, záporně = platba. */
  amountKc: number;
  balanceKc: number;
  entryId: string | null;
  planId: string | null;
};

export type TrustForecast = {
  nextDue: { date: string; label: string; amountKc: number } | null;
  /** Kolik dalších plateb zůstatek ještě pokryje celých. */
  coveredCount: number;
  lastCoveredDate: string | null;
  /** První platba, na kterou už nezbude (null = plán skončí dřív). */
  firstUncoveredDate: string | null;
  /** Kolik zbude po poslední pokryté platbě. */
  remainderKc: number;
};

const pad = (n: number) => String(n).padStart(2, "0");
export const addMonths = (ym: string, n: number): string => {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
};
const dueDate = (ym: string, day: number) => `${ym}-${pad(day)}`;

/** Splátky jednoho pravidla od začátku do (včetně) měsíce `untilMonth`. */
function installments(plan: TrustPlan, untilMonth: string): { date: string; month: string }[] {
  const out: { date: string; month: string }[] = [];
  const last = plan.endMonth && plan.endMonth < untilMonth ? plan.endMonth : untilMonth;
  for (let ym = plan.startMonth; ym <= last; ym = addMonths(ym, 1)) out.push({ date: dueDate(ym, plan.dayOfMonth), month: ym });
  return out;
}

const monthName = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"][m - 1]} ${y}`;
};

export function computeTrust(entries: readonly TrustEntry[], plans: readonly TrustPlan[], today: string) {
  const todayMonth = today.slice(0, 7);
  type Raw = Omit<TrustLine, "balanceKc"> & { order: number };
  const raw: Raw[] = entries.map((e) => ({
    date: e.entryDate,
    kind: e.kind,
    label: e.description,
    amountKc: e.kind === "deposit" ? e.amountKc : -e.amountKc,
    entryId: e.id,
    planId: null,
    order: e.kind === "deposit" ? 0 : 1, // ve stejný den vklad před platbou
  }));
  for (const p of plans) {
    for (const i of installments(p, todayMonth)) {
      if (i.date > today) continue;
      raw.push({ date: i.date, kind: "recurring", label: `${p.label} – ${monthName(i.month)}`, amountKc: -p.amountKc, entryId: null, planId: p.id, order: 2 });
    }
  }
  raw.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1));

  let balance = 0;
  const lines: TrustLine[] = raw.map(({ order: _order, ...l }) => {
    balance += l.amountKc;
    return { ...l, balanceKc: balance };
  });

  // Výhled: budoucí splátky (po dnešku) všech pravidel v pořadí, dokud stačí zůstatek.
  const horizon = addMonths(todayMonth, 600);
  const future = plans
    .flatMap((p) =>
      installments(p, p.endMonth ?? horizon)
        .filter((i) => i.date > today)
        .map((i) => ({ date: i.date, label: `${p.label} – ${monthName(i.month)}`, amountKc: p.amountKc }))
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let left = balance;
  let coveredCount = 0;
  let lastCoveredDate: string | null = null;
  let firstUncoveredDate: string | null = null;
  for (const f of future) {
    if (left < f.amountKc) {
      firstUncoveredDate = f.date;
      break;
    }
    left -= f.amountKc;
    coveredCount++;
    lastCoveredDate = f.date;
  }

  const forecast: TrustForecast = {
    nextDue: future[0] ?? null,
    coveredCount,
    lastCoveredDate,
    firstUncoveredDate,
    remainderKc: left,
  };
  const depositedKc = entries.filter((e) => e.kind === "deposit").reduce((s, e) => s + e.amountKc, 0);
  return { lines, balanceKc: balance, depositedKc, spentKc: depositedKc - balance, forecast };
}

/** Validace měsíce „YYYY-MM“ z formuláře. */
export const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export const isDate = (v: string) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v);
