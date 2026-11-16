// FINANCE – KONTROLY A AUDIT 1.0 — čisté kontroly nad daty (bez databáze).
//
// Každá kontrola je samostatná „složka“ (CHECKS níže): má stálý klíč, název,
// popis, co hlídá, a vrací seznam nálezů. Nález má stálý klíč (findingKey),
// aby se k němu dal v auditním deníku (finance_check_log) zapsat výsledek
// prověření — a aby zápis platil i při dalším otevření kontroly.
//
// Kontroly nic neopravují ani nemažou. Jen ukazují, co je potřeba prověřit;
// rozhodnutí a zápis dělá Jaroslav nebo Lucie.
//
// Begina NENÍ plátce DPH — všechny částky jsou celkové (bez rozpadu DPH).

export type CheckKey =
  | "ekonomika-duplicity"
  | "ekonomika-cislovani"
  | "ekonomika-uplnost"
  | "ekonomika-vysoke-castky"
  | "ekonomika-mezery"
  | "objednavky-faktury"
  | "objednavky-uhrady"
  | "faktury-v-ekonomice"
  | "idoklad";

export type CheckGroup = "ekonomika" | "objednavky" | "idoklad";

/** error = chyba k opravě, warning = k prověření, info = k ověření dokladu */
export type FindingLevel = "error" | "warning" | "info";

export type Finding = {
  key: string;
  level: FindingLevel;
  message: string;
  /** odkaz do MojeBegina, kde se dá věc dohledat */
  href?: string | null;
};

export type CheckDefinition = {
  key: CheckKey;
  group: CheckGroup;
  title: string;
  /** co kontrola hlídá — jedna, dvě věty pro složku */
  description: string;
  /** spouští se jen tlačítkem (čte cizí systém s omezenou denní kvótou) */
  onDemand?: boolean;
};

export const CHECK_GROUPS: { key: CheckGroup; title: string; description: string }[] = [
  { key: "ekonomika", title: "Ekonomika", description: "Příjmy a náklady zapsané v Ekonomice." },
  { key: "objednavky", title: "Objednávky, faktury a platby", description: "Objednávky v MojeBegina, jejich faktury a zapsané platby." },
  { key: "idoklad", title: "iDoklad", description: "Vydané faktury v iDokladu (jen čtení)." },
];

export const CHECKS: CheckDefinition[] = [
  {
    key: "ekonomika-duplicity",
    group: "ekonomika",
    title: "Možné duplicitní zápisy",
    description: "Stejný druh, den, částka, protistrana i popis zapsané víckrát. Často jde o omylem dvakrát zapsaný doklad.",
  },
  {
    key: "ekonomika-cislovani",
    group: "ekonomika",
    title: "Číslování faktur v příjmech",
    description: "Čísla faktur u příjmů: stejné číslo víckrát, chybějící čísla v řadě (nezapsaná nebo stornovaná faktura) a neobvyklý tvar čísla.",
  },
  {
    key: "ekonomika-uplnost",
    group: "ekonomika",
    title: "Úplnost zápisů",
    description: "Faktura bez čísla, náklad bez prodávajícího, příjem bez způsobu úhrady nebo s neznámým způsobem úhrady, datum v budoucnosti.",
  },
  {
    key: "ekonomika-vysoke-castky",
    group: "ekonomika",
    title: "Neobvykle vysoké částky",
    description: "Jedno procento nejvyšších nákladů a příjmů roku (nejméně 5 000 Kč). Stojí za to ověřit, že k nim je doklad a částka sedí.",
  },
  {
    key: "ekonomika-mezery",
    group: "ekonomika",
    title: "Mezery v zápisech",
    description: "Uplynulé měsíce bez jediného příjmu nebo nákladu a období 21 a více dní bez zapsaného nákladu — mohou chybět doklady.",
  },
  {
    key: "objednavky-faktury",
    group: "objednavky",
    title: "Objednávky bez faktury",
    description: "Doručené nebo zaplacené objednávky (ne stornované), ke kterým v MojeBegina není vystavená faktura.",
  },
  {
    key: "objednavky-uhrady",
    group: "objednavky",
    title: "Úhrady objednávek",
    description: "Objednávka vedená jako zaplacená bez zapsané platby, přeplatek, částečná úhrada, dlouho neuhrazená doručená objednávka a nespárované platby.",
  },
  {
    key: "faktury-v-ekonomice",
    group: "objednavky",
    title: "Faktury z MojeBegina v Ekonomice",
    description: "Faktury vystavené v MojeBegina, které nejsou zapsané v příjmech Ekonomiky, nebo jsou zapsané s jinou částkou.",
  },
  {
    key: "idoklad",
    group: "idoklad",
    title: "Kontrola iDokladu",
    description: "Audit číslování a datování vydaných faktur, neuhrazené faktury a nesoulad s fakturami z MojeBegina. Čte iDoklad, proto se spouští tlačítkem.",
    onDemand: true,
  },
];

export function findCheck(key: string): CheckDefinition | null {
  return CHECKS.find((check) => check.key === key) ?? null;
}

// ------------------------------------------------------------------ vstupní data

export type EconomyCheckRow = {
  id: string;
  kind: "income" | "cost";
  entryDate: string; // YYYY-MM-DD
  title: string;
  counterparty: string | null;
  amountHal: number;
  paymentForm: string | null;
  invoiceNumber: string | null;
};

export type OrderCheckRow = {
  id: string;
  orderNumber: number | null;
  label: string; // kupující pro výpis
  channel: string;
  orderedAt: string; // YYYY-MM-DD (pražský den)
  totalKc: number;
  paymentStatus: string; // unpaid | invoiced | paid
  fulfillmentStatus: string;
  /** stav podle zapsaných plateb (pohled order_payment_balance); null = nic */
  balanceState: string | null;
  receivedHal: number;
  requiredHal: number;
  issuedInvoiceNumber: string | null;
};

export type PaymentCheckRow = {
  id: string;
  occurredAt: string | null; // YYYY-MM-DD
  amountHal: number;
  method: string;
  vs: string | null;
  matchStatus: string;
};

export type IssuedInvoiceRow = {
  number: string;
  totalKc: number;
  issuedAt: string; // YYYY-MM-DD
  orderId: string;
};

// ------------------------------------------------------------------ pomocné

const kc = (hal: number) => {
  const value = hal / 100;
  return `${value.toLocaleString("cs-CZ", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })} Kč`;
};

const czDate = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}. ${iso.slice(0, 4)}`;

const normalize = (text: string | null) =>
  (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const kindLabel = (kind: "income" | "cost") => (kind === "income" ? "příjem" : "náklad");

function entryLabel(row: EconomyCheckRow): string {
  const who = row.counterparty ? `, ${row.counterparty}` : "";
  return `${czDate(row.entryDate)} · ${row.title}${who} · ${kc(row.amountHal)}`;
}

const economyHref = (row: Pick<EconomyCheckRow, "entryDate" | "kind">) =>
  `/rizeni-firmy/ekonomika?rok=${row.entryDate.slice(0, 4)}&mesic=${Number(row.entryDate.slice(5, 7))}&zobrazit=${row.kind === "income" ? "prijmy" : "naklady"}`;

const orderHref = (id: string) => `/rizeni-firmy/objednavky/${id}`;

function orderLabel(order: OrderCheckRow): string {
  const number = order.orderNumber ? `č. ${order.orderNumber}` : `z ${czDate(order.orderedAt)}`;
  return `Objednávka ${number} (${order.label}, ${order.totalKc.toLocaleString("cs-CZ")} Kč)`;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ Ekonomika

/** Stejný druh, den, částka, protistrana i popis víckrát. */
export function checkEconomyDuplicates(rows: EconomyCheckRow[]): Finding[] {
  const groups = new Map<string, EconomyCheckRow[]>();
  for (const row of rows) {
    const key = [row.kind, row.entryDate, row.amountHal, normalize(row.counterparty), normalize(row.title)].join("|");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const findings: Finding[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const first = group[0];
    const ids = group.map((row) => row.id).sort();
    findings.push({
      key: `dup:${ids.join("+")}`,
      level: "warning",
      message: `${group.length}× stejný ${kindLabel(first.kind)}: ${entryLabel(first)}.`,
      href: economyHref(first),
    });
  }
  return findings.sort((a, b) => a.message.localeCompare(b.message, "cs"));
}

/** Obvyklé tvary čísla faktury: 2026xxxx (ruční řada) a 926xxxx (e-shop). */
const INVOICE_NUMBER_FORMAT = /^(20\d{2}\d{4}|9\d{2}\d{4})$/;

/** Čísla faktur u příjmů: duplicity, mezery v řadě, neobvyklý tvar. */
export function checkInvoiceNumbering(rows: EconomyCheckRow[]): Finding[] {
  const findings: Finding[] = [];
  const byNumber = new Map<string, EconomyCheckRow[]>();
  for (const row of rows) {
    if (row.kind !== "income" || !row.invoiceNumber) continue;
    const number = row.invoiceNumber.trim();
    byNumber.set(number, [...(byNumber.get(number) ?? []), row]);
  }

  for (const [number, list] of byNumber) {
    if (list.length > 1) {
      findings.push({
        key: `inv-dup:${number}`,
        level: "error",
        message: `Faktura ${number} je v příjmech zapsaná ${list.length}× (${list.map((row) => `${czDate(row.entryDate)} ${kc(row.amountHal)}`).join("; ")}).`,
        href: economyHref(list[0]),
      });
    }
    if (!INVOICE_NUMBER_FORMAT.test(number)) {
      findings.push({
        key: `inv-format:${number}`,
        level: "warning",
        message: `Číslo faktury „${number}“ (${entryLabel(list[0])}) nemá obvyklý tvar 2026xxxx ani 926xxxx.`,
        href: economyHref(list[0]),
      });
    }
  }

  // mezery: řada = vše kromě posledních 4 číslic, pořadí = poslední 4 číslice
  const series = new Map<string, number[]>();
  for (const number of byNumber.keys()) {
    if (!INVOICE_NUMBER_FORMAT.test(number)) continue;
    const prefix = number.slice(0, -4);
    series.set(prefix, [...(series.get(prefix) ?? []), Number(number.slice(-4))]);
  }
  for (const [prefix, serials] of series) {
    const sorted = [...new Set(serials)].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      const from = sorted[i - 1] + 1;
      const to = sorted[i] - 1;
      if (from > to) continue;
      const name = (serial: number) => `${prefix}${String(serial).padStart(4, "0")}`;
      const range = from === to ? name(from) : `${name(from)} až ${name(to)}`;
      const count = to - from + 1;
      findings.push({
        key: `inv-gap:${name(from)}-${name(to)}`,
        level: "warning",
        message:
          count === 1
            ? `V příjmech chybí faktura ${range} (mezi ${name(from - 1)} a ${name(to + 1)}). Nezapsaná, nebo stornovaná?`
            : `V příjmech chybí ${count} faktur: ${range}. Nezapsané, nebo stornované?`,
      });
    }
  }
  return findings;
}

/** Způsoby úhrady, které Ekonomika zná (včetně souhrnných z importu). */
export const KNOWN_PAYMENT_FORMS = ["převodem", "hotově", "kartou", "hotově, QR, kartou", "kartou eshop", "QR"];

/** Faktura bez čísla, náklad bez prodávajícího, úhrada, datum v budoucnosti. */
export function checkCompleteness(rows: EconomyCheckRow[], today: string): Finding[] {
  const known = new Set(KNOWN_PAYMENT_FORMS.map(normalize));
  const findings: Finding[] = [];
  for (const row of rows) {
    const href = economyHref(row);
    if (row.entryDate > today) {
      findings.push({ key: `future:${row.id}`, level: "error", message: `Datum v budoucnosti: ${kindLabel(row.kind)} ${entryLabel(row)}.`, href });
    }
    if (row.kind === "cost" && !row.counterparty?.trim()) {
      findings.push({ key: `no-seller:${row.id}`, level: "warning", message: `Náklad bez prodávajícího: ${entryLabel(row)}.`, href });
    }
    if (row.kind !== "income") continue;
    if (normalize(row.title).startsWith("faktura") && !row.invoiceNumber?.trim()) {
      findings.push({ key: `no-invoice-number:${row.id}`, level: "warning", message: `Příjem „Faktura“ bez čísla faktury: ${entryLabel(row)}.`, href });
    }
    if (normalize(row.title).startsWith("faktura") && !row.counterparty?.trim()) {
      findings.push({ key: `no-client:${row.id}`, level: "warning", message: `Faktura bez klienta: ${entryLabel(row)}.`, href });
    }
    if (!row.paymentForm?.trim()) {
      findings.push({ key: `no-payment-form:${row.id}`, level: "warning", message: `Příjem bez způsobu úhrady: ${entryLabel(row)}.`, href });
    } else if (!known.has(normalize(row.paymentForm))) {
      findings.push({ key: `payment-form:${row.id}`, level: "info", message: `Neobvyklý způsob úhrady „${row.paymentForm}“: ${entryLabel(row)}.`, href });
    }
  }
  return findings;
}

export const HIGH_AMOUNT_MIN_HAL = 5_000 * 100;

/** Hranice horního 1 % (nejbližší vyšší hodnota, ne interpolace). */
function percentile99(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.99) - 1)];
}

/** Horní 1 % částek každého druhu, nejméně 5 000 Kč. */
export function checkHighAmounts(rows: EconomyCheckRow[]): Finding[] {
  const findings: Finding[] = [];
  for (const kind of ["cost", "income"] as const) {
    const list = rows.filter((row) => row.kind === kind);
    if (list.length === 0) continue;
    // u malého počtu zápisů percentil nic neříká — platí jen pevná hranice
    const threshold = Math.max(HIGH_AMOUNT_MIN_HAL, list.length >= 20 ? percentile99(list.map((row) => row.amountHal)) : HIGH_AMOUNT_MIN_HAL);
    for (const row of list) {
      if (row.amountHal < threshold) continue;
      findings.push({
        key: `high:${row.id}`,
        level: "info",
        message: `Vysoký ${kindLabel(kind)} (hranice ${kc(threshold)}): ${entryLabel(row)}. Ověřit doklad.`,
        href: economyHref(row),
      });
    }
  }
  return findings.sort((a, b) => a.message.localeCompare(b.message, "cs"));
}

export const COST_GAP_DAYS = 21;
const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];

/**
 * Uplynulé měsíce bez příjmu / nákladu a období ≥ 21 dní bez nákladu.
 * Kontroluje se jen od prvního zápisu roku do dneška.
 */
export function checkGaps(rows: EconomyCheckRow[], year: number, today: string): Finding[] {
  const findings: Finding[] = [];
  const yearRows = rows.filter((row) => Number(row.entryDate.slice(0, 4)) === year);
  if (yearRows.length === 0) return findings;
  const firstDate = yearRows.reduce((min, row) => (row.entryDate < min ? row.entryDate : min), yearRows[0].entryDate);
  const end = `${year}-12-31` < today ? `${year}-12-31` : today;

  // celé uplynulé měsíce od měsíce prvního zápisu
  const firstMonth = Number(firstDate.slice(5, 7));
  const todayYear = Number(today.slice(0, 4));
  const lastFullMonth = year < todayYear ? 12 : year === todayYear ? Number(today.slice(5, 7)) - 1 : 0;
  for (let month = firstMonth; month <= lastFullMonth; month += 1) {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    for (const kind of ["income", "cost"] as const) {
      if (yearRows.some((row) => row.kind === kind && row.entryDate.startsWith(prefix))) continue;
      findings.push({
        key: `month-empty:${kind}:${prefix}`,
        level: "warning",
        message: `${MONTHS[month - 1][0].toUpperCase()}${MONTHS[month - 1].slice(1)} ${year}: není zapsaný žádný ${kindLabel(kind)}.`,
        href: `/rizeni-firmy/ekonomika?rok=${year}&mesic=${month}&zobrazit=${kind === "income" ? "prijmy" : "naklady"}`,
      });
    }
  }

  // dlouhá období bez nákladu
  const costDates = [...new Set(yearRows.filter((row) => row.kind === "cost").map((row) => row.entryDate))].sort();
  const points = [firstDate, ...costDates.filter((d) => d > firstDate), end];
  for (let i = 1; i < points.length; i += 1) {
    const gap = daysBetween(points[i - 1], points[i]);
    if (gap <= COST_GAP_DAYS) continue;
    const from = addDays(points[i - 1], 1);
    const to = i === points.length - 1 ? points[i] : addDays(points[i], -1);
    findings.push({
      key: `cost-gap:${from}`,
      level: "warning",
      message: `${czDate(from)} – ${czDate(to)}: ${daysBetween(from, to) + 1} dní bez zapsaného nákladu.`,
    });
  }
  return findings;
}

// ------------------------------------------------------------------ objednávky, faktury, platby

const isCancelled = (order: OrderCheckRow) => order.fulfillmentStatus === "cancelled";

/** Doručené nebo zaplacené (ne stornované) objednávky bez vystavené faktury. */
export function checkOrdersWithoutInvoice(orders: OrderCheckRow[]): Finding[] {
  return orders
    .filter((order) => !isCancelled(order) && !order.issuedInvoiceNumber && (order.fulfillmentStatus === "delivered" || order.paymentStatus === "paid"))
    .map((order) => ({
      key: `order-no-invoice:${order.id}`,
      level: "warning" as const,
      message: `${orderLabel(order)}: ${order.fulfillmentStatus === "delivered" ? "doručená" : "zaplacená"}, ale v MojeBegina k ní není vystavená faktura. Vystavená jinde (iDoklad ručně), nebo chybí?`,
      href: orderHref(order.id),
    }));
}

export const UNPAID_DELIVERED_DAYS = 14;

/** Rozpory mezi stavem objednávky a zapsanými platbami. */
export function checkOrderPayments(orders: OrderCheckRow[], payments: PaymentCheckRow[], today: string): Finding[] {
  const findings: Finding[] = [];
  for (const order of orders) {
    const href = orderHref(order.id);
    const label = orderLabel(order);
    const balance = order.balanceState ?? "unpaid";
    if (order.paymentStatus === "paid" && (balance === "unpaid" || balance === "partially_paid") && !isCancelled(order)) {
      findings.push({
        key: `paid-no-payment:${order.id}`,
        level: "error",
        message: `${label}: vedená jako zaplacená, ale zapsané platby pokrývají jen ${kc(order.receivedHal)} z ${kc(order.requiredHal)}. Chybí zápis platby?`,
        href,
      });
    } else if (balance === "partially_paid" && !isCancelled(order)) {
      findings.push({ key: `partial:${order.id}`, level: "warning", message: `${label}: zaplaceno jen ${kc(order.receivedHal)} z ${kc(order.requiredHal)}.`, href });
    }
    if (balance === "overpaid") {
      findings.push({ key: `overpaid:${order.id}`, level: "error", message: `${label}: přeplaceno — přijato ${kc(order.receivedHal)}, má být ${kc(order.requiredHal)}. Vrátit rozdíl?`, href });
    }
    if (isCancelled(order) && (balance === "paid" || balance === "overpaid" || balance === "partially_paid")) {
      findings.push({ key: `cancelled-paid:${order.id}`, level: "error", message: `${label}: stornovaná, ale peníze nejsou vrácené (přijato ${kc(order.receivedHal)}).`, href });
    }
    if (order.paymentStatus !== "paid" && balance === "paid" && !isCancelled(order)) {
      findings.push({ key: `payment-status:${order.id}`, level: "warning", message: `${label}: platby jsou úplné, ale objednávka není označená jako zaplacená.`, href });
    }
    if (order.fulfillmentStatus === "delivered" && order.paymentStatus !== "paid" && balance !== "paid" && daysBetween(order.orderedAt, today) > UNPAID_DELIVERED_DAYS) {
      findings.push({
        key: `delivered-unpaid:${order.id}`,
        level: "warning",
        message: `${label}: doručená a ${daysBetween(order.orderedAt, today)} dní od objednání stále neuhrazená.`,
        href,
      });
    }
  }
  for (const payment of payments) {
    if (payment.matchStatus === "matched") continue;
    const when = payment.occurredAt ? czDate(payment.occurredAt) : "bez data";
    findings.push({
      key: `payment-unmatched:${payment.id}`,
      level: "error",
      message: `Platba ${kc(payment.amountHal)} (${when}${payment.vs ? `, VS ${payment.vs}` : ""}) není přiřazená k objednávce${payment.matchStatus === "needs_review" ? " — čeká na prověření" : ""}.`,
    });
  }
  return findings;
}

/** Faktury vystavené v MojeBegina vs. příjmy v Ekonomice (podle čísla faktury). */
export function checkInvoicesInEconomy(invoices: IssuedInvoiceRow[], economy: EconomyCheckRow[]): Finding[] {
  const incomeByNumber = new Map<string, EconomyCheckRow[]>();
  for (const row of economy) {
    if (row.kind !== "income" || !row.invoiceNumber) continue;
    const number = row.invoiceNumber.trim();
    incomeByNumber.set(number, [...(incomeByNumber.get(number) ?? []), row]);
  }
  const findings: Finding[] = [];
  for (const invoice of invoices) {
    const rows = incomeByNumber.get(invoice.number) ?? [];
    if (rows.length === 0) {
      findings.push({
        key: `invoice-missing:${invoice.number}`,
        level: "warning",
        message: `Faktura ${invoice.number} z ${czDate(invoice.issuedAt)} (${invoice.totalKc.toLocaleString("cs-CZ")} Kč) není zapsaná v příjmech Ekonomiky.`,
        href: orderHref(invoice.orderId),
      });
      continue;
    }
    const recordedHal = rows.reduce((sum, row) => sum + row.amountHal, 0);
    if (recordedHal !== invoice.totalKc * 100) {
      findings.push({
        key: `invoice-amount:${invoice.number}`,
        level: "error",
        message: `Faktura ${invoice.number}: v MojeBegina ${invoice.totalKc.toLocaleString("cs-CZ")} Kč, v Ekonomice ${kc(recordedHal)}.`,
        href: economyHref(rows[0]),
      });
    }
  }
  return findings;
}

// ------------------------------------------------------------------ stav nálezů podle deníku

export type LogAction = "run" | "ok" | "fixed" | "note";

export const LOG_ACTION_LABELS: Record<LogAction, string> = {
  run: "Zápis o provedení kontroly",
  ok: "Prověřeno – v pořádku",
  fixed: "Opraveno",
  note: "Poznámka",
};

export type LogEntry = {
  id: string;
  checkKey: string;
  findingKey: string | null;
  action: LogAction;
  note: string | null;
  snapshot: unknown;
  authorName: string | null;
  createdAt: string; // ISO
};

export type FindingState = "open" | "ok" | "fixed_still_present";

/**
 * Stav nálezu podle posledního rozhodnutí v deníku (poznámky stav nemění):
 * „ok“ = prověřeno, nález se dál ukazuje mezi vyřízenými; „fixed“ u nálezu,
 * který kontrola pořád najde = oprava se neprojevila (zůstává otevřený).
 */
export function findingStates(findings: Finding[], log: LogEntry[]): Map<string, FindingState> {
  const latest = new Map<string, LogEntry>();
  for (const entry of [...log].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!entry.findingKey || (entry.action !== "ok" && entry.action !== "fixed")) continue;
    latest.set(entry.findingKey, entry);
  }
  const states = new Map<string, FindingState>();
  for (const finding of findings) {
    const decision = latest.get(finding.key);
    states.set(finding.key, !decision ? "open" : decision.action === "ok" ? "ok" : "fixed_still_present");
  }
  return states;
}

export type CheckSummary = { errors: number; warnings: number; infos: number; open: number; resolved: number };

export function summarizeFindings(findings: Finding[], states: Map<string, FindingState>): CheckSummary {
  const summary: CheckSummary = { errors: 0, warnings: 0, infos: 0, open: 0, resolved: 0 };
  for (const finding of findings) {
    if (states.get(finding.key) === "ok") {
      summary.resolved += 1;
      continue;
    }
    summary.open += 1;
    if (finding.level === "error") summary.errors += 1;
    else if (finding.level === "warning") summary.warnings += 1;
    else summary.infos += 1;
  }
  return summary;
}
