// Partnerský program — měsíční vyhodnocení: čtení objednávek, stav měsíce,
// zakládání kódů a rozesílka. Pravidla viz partnerMonthly.ts.
//
// Průběh (cron app/api/cron/partner-program):
//   1. poslední den měsíce večer → report na info@begina.cz (reportToBegina),
//   2. Lucie v MojeBegina schválí (approvePartnerMonth) — klientům nic neodchází,
//   3. první den měsíce po půlnoci → finalizePartnerMonth: přepočet podle
//      konečného stavu, zapnutí slev (vnitřní řádky „partner-RRRR-MM-procento“
//      jen pro e-maily klientů — pokladna podle nich slevu odečte automaticky)
//      a rozeslání e-mailů. Pevné úrovně bez schválení (Lucie 20. 11. 2026),
//      individuální sleva nad 20 000 Kč jen s procentem od Lucie.
//
// Stav se drží v tabulce eshop_coupons (žádná nová tabulka):
//   • „partner-program-RRRR-MM“ — neaktivní řádek se stavem měsíce platnosti
//     (schválení, individuální procenta, oslovení, komu už e-mail odešel),
//   • „partner-program-odhlaseni“ — neaktivní řádek se seznamem e-mailů, které
//     si nepřejí obchodní sdělení (zákon č. 480/2004 Sb., § 7).
// Neaktivní řádky nejdou v pokladně uplatnit.
import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { eshopCoupons, orders } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";
import { pragueMonthStart } from "./couponsServer";
import { suggestSalutation } from "./salutation";
import { emailConfig, resolveRecipients, type EmailConfig } from "./email/config";
import { resendTransport, type EmailTransport } from "./email/resend";
import {
  addMonths,
  buildPartnerEmail,
  buildPartnerReport,
  crossedIndividualLimit,
  evaluatePartnerMonth,
  monthKey,
  monthName,
  partnerEntitlementCode,
  type PartnerClient,
  type PartnerOrderRow,
  type YearMonth,
} from "./partnerMonthly";

type AnyDb<T extends PgQueryResultHKT = PgQueryResultHKT> = PgDatabase<T, typeof schema>;

export const PARTNER_APPROVAL_URL = "https://moje.begina.cz/rizeni-firmy/partnersky-program";
const OPT_OUT_CODE = "partner-program-odhlaseni";
const PLACEHOLDER_EMAIL = "nikdo@partner-program.invalid";

export type PartnerMonthState = {
  approvedAt: string | null;
  approvedBy: string | null;
  /** klient (key) → procento individuální slevy (nad 20 000 Kč) */
  individual: Record<string, number>;
  /** klient (key) → oslovení za „Dobrý den,“ */
  salutations: Record<string, string>;
  /** e-maily, kterým už sdělení odešlo */
  sent: string[];
  finalizedAt: string | null;
  /** stav v reportu (poslední den v 18:00): klient (key) → procento (0 = bez slevy, -1 = individuální) */
  reported?: Record<string, number>;
};

const EMPTY_STATE: PartnerMonthState = { approvedAt: null, approvedBy: null, individual: {}, salutations: {}, sent: [], finalizedAt: null };

function stateCode(validMonth: YearMonth): string {
  return `partner-program-${monthKey(validMonth)}`;
}

function monthRange(ym: YearMonth): { from: Date; to: Date } {
  const inside = new Date(Date.UTC(ym.year, ym.month - 1, 15, 12));
  return { from: pragueMonthStart(inside, 0), to: pragueMonthStart(inside, 1) };
}

/** Rok a měsíc v Praze pro daný okamžik. */
export function pragueYearMonth(now: Date): YearMonth & { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") };
}

/** Uhrazené objednávky z e-shopu zaplacené v daném měsíci (pražský čas). */
export async function loadPartnerMonthRows<T extends PgQueryResultHKT>(db: AnyDb<T>, month: YearMonth): Promise<PartnerOrderRow[]> {
  const { from, to } = monthRange(month);
  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      paidAt: orders.paidAt,
      subtotalKc: orders.subtotalKc,
      discountKc: orders.discountKc,
      totalKc: orders.totalKc,
      email: orders.contactEmail,
      ico: orders.billingIco,
      company: orders.billingCompany,
      billingName: orders.billingName,
      contactName: orders.contactName,
    })
    .from(orders)
    .where(and(eq(orders.channel, "eshop"), eq(orders.paymentStatus, "paid"), ne(orders.fulfillmentStatus, "cancelled"), gte(orders.paidAt, from), lt(orders.paidAt, to)));
  return rows.flatMap((row) =>
    row.paidAt
      ? [
          {
            orderNumber: row.orderNumber,
            paidAt: row.paidAt,
            goodsKc: Number(row.subtotalKc) - Number(row.discountKc),
            totalKc: Number(row.totalKc),
            email: row.email,
            ico: row.ico,
            company: row.company,
            name: row.billingName ?? row.contactName,
            personName: row.contactName ?? row.billingName,
          },
        ]
      : []
  );
}

async function readNote<T extends PgQueryResultHKT>(db: AnyDb<T>, code: string): Promise<string | null> {
  const [row] = await db.select({ note: eshopCoupons.note }).from(eshopCoupons).where(eq(eshopCoupons.code, code)).limit(1);
  return row?.note ?? null;
}

async function writeNote<T extends PgQueryResultHKT>(db: AnyDb<T>, code: string, note: string): Promise<void> {
  await db
    .insert(eshopCoupons)
    .values({ code, discountType: "percent", amount: "0", isActive: false, emailRestrictions: [PLACEHOLDER_EMAIL], note })
    .onConflictDoUpdate({ target: eshopCoupons.code, set: { note, isActive: false, updatedAt: new Date() } });
}

export async function loadPartnerMonthState<T extends PgQueryResultHKT>(db: AnyDb<T>, validMonth: YearMonth): Promise<PartnerMonthState> {
  const note = await readNote(db, stateCode(validMonth));
  if (!note) return { ...EMPTY_STATE };
  try {
    return { ...EMPTY_STATE, ...(JSON.parse(note) as Partial<PartnerMonthState>) };
  } catch {
    return { ...EMPTY_STATE };
  }
}

async function savePartnerMonthState<T extends PgQueryResultHKT>(db: AnyDb<T>, validMonth: YearMonth, state: PartnerMonthState): Promise<void> {
  await writeNote(db, stateCode(validMonth), JSON.stringify(state));
}

export async function loadPartnerOptOuts<T extends PgQueryResultHKT>(db: AnyDb<T>): Promise<string[]> {
  const note = await readNote(db, OPT_OUT_CODE);
  if (!note) return [];
  try {
    const parsed = JSON.parse(note) as { emails?: unknown };
    return Array.isArray(parsed.emails) ? parsed.emails.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

/** Zákazník si nepřeje obchodní sdělení (pokladna, nebo ručně po odpovědi „NE“). */
export async function addPartnerOptOut<T extends PgQueryResultHKT>(db: AnyDb<T>, rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@")) return;
  const emails = await loadPartnerOptOuts(db);
  if (emails.includes(email)) return;
  await writeNote(db, OPT_OUT_CODE, JSON.stringify({ emails: [...emails, email].sort() }));
}

export type PartnerMonthOverview = {
  evaluatedMonth: YearMonth;
  validMonth: YearMonth;
  clients: PartnerClient[];
  state: PartnerMonthState;
  optOuts: string[];
  /** Naposledy schválené oslovení klienta z předchozích měsíců (19. 11. 2026, Lucie). */
  rememberedSalutations: Record<string, string>;
};

/** Projde stavy až 12 předchozích měsíců; novější schválené oslovení má přednost. */
export async function loadRememberedSalutations<T extends PgQueryResultHKT>(db: AnyDb<T>, validMonth: YearMonth, months = 12): Promise<Record<string, string>> {
  const earlier = await Promise.all(Array.from({ length: months }, (_, i) => loadPartnerMonthState(db, addMonths(validMonth, -(i + 1)))));
  const remembered: Record<string, string> = {};
  for (const state of earlier) {
    for (const [key, value] of Object.entries(state.salutations ?? {})) {
      if (value && !(key in remembered)) remembered[key] = value;
    }
  }
  return remembered;
}

export async function loadPartnerMonthOverview<T extends PgQueryResultHKT>(db: AnyDb<T>, evaluatedMonth: YearMonth): Promise<PartnerMonthOverview> {
  const validMonth = addMonths(evaluatedMonth, 1);
  const [rows, state, optOuts, rememberedSalutations] = await Promise.all([
    loadPartnerMonthRows(db, evaluatedMonth),
    loadPartnerMonthState(db, validMonth),
    loadPartnerOptOuts(db),
    loadRememberedSalutations(db, validMonth),
  ]);
  return { evaluatedMonth, validMonth, clients: evaluatePartnerMonth(rows), state, optOuts, rememberedSalutations };
}

/** Schválení (Lucie): uloží individuální procenta a oslovení. Klientům nic neodchází. */
export async function approvePartnerMonth<T extends PgQueryResultHKT>(
  db: AnyDb<T>,
  input: { evaluatedMonth: YearMonth; approvedBy: string; individual: Record<string, number>; salutations: Record<string, string>; now: Date }
): Promise<PartnerMonthState> {
  const validMonth = addMonths(input.evaluatedMonth, 1);
  const previous = await loadPartnerMonthState(db, validMonth);
  const individual: Record<string, number> = {};
  for (const [key, percent] of Object.entries(input.individual)) {
    if (Number.isFinite(percent) && percent > 0 && percent <= 100) individual[key] = Math.round(percent * 100) / 100;
  }
  const salutations: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.salutations)) {
    const text = value.trim().slice(0, 80);
    if (text) salutations[key] = text;
  }
  const state: PartnerMonthState = { ...previous, approvedAt: input.now.toISOString(), approvedBy: input.approvedBy, individual, salutations };
  await savePartnerMonthState(db, validMonth, state);
  return state;
}

type Mailer = { config: EmailConfig; transport: EmailTransport };

function defaultMailer(): Mailer | null {
  const config = emailConfig();
  return config ? { config, transport: resendTransport(config.apiKey) } : null;
}

async function sendInternal(mailer: Mailer, message: { subject: string; text: string; html: string }, idempotencyKey: string): Promise<boolean> {
  if (mailer.config.internalTo.length === 0) return false;
  const result = await mailer.transport({ from: mailer.config.from, to: mailer.config.internalTo, replyTo: mailer.config.replyTo, ...message }, idempotencyKey);
  if (!result.ok) console.error("Partnerský program: interní e-mail se nepodařilo odeslat", result.error.slice(0, 200));
  return result.ok;
}

/** Report na info@begina.cz (poslední den měsíce večer). Klientům nic neposílá. */
export async function reportPartnerMonth<T extends PgQueryResultHKT>(db: AnyDb<T>, now: Date, mailer: Mailer | null = defaultMailer()): Promise<{ clients: number; sent: boolean }> {
  const today = pragueYearMonth(now);
  const evaluatedMonth = { year: today.year, month: today.month };
  const clients = evaluatePartnerMonth(await loadPartnerMonthRows(db, evaluatedMonth));
  // snímek reportu — po půlnoci se podle něj hlásí, co se do půlnoci změnilo
  const validMonth = addMonths(evaluatedMonth, 1);
  const reported: Record<string, number> = {};
  for (const client of clients) reported[client.key] = client.percent ?? -1;
  await savePartnerMonthState(db, validMonth, { ...(await loadPartnerMonthState(db, validMonth)), reported });
  if (!mailer) return { clients: clients.length, sent: false };
  const report = buildPartnerReport({ evaluatedMonth, clients, preliminary: true, approvalUrl: PARTNER_APPROVAL_URL });
  const sent = await sendInternal(mailer, report, `partner-report-${monthKey(evaluatedMonth)}`);
  return { clients: clients.length, sent };
}

/** Upozornění na info@begina.cz, když někdo za poslední den přesáhl 20 000 Kč. */
export async function alertIndividualLimit<T extends PgQueryResultHKT>(db: AnyDb<T>, now: Date, mailer: Mailer | null = defaultMailer()): Promise<{ crossed: number }> {
  const today = pragueYearMonth(now);
  const month = { year: today.year, month: today.month };
  const rows = await loadPartnerMonthRows(db, month);
  const crossed = crossedIndividualLimit(rows, new Date(now.getTime() - 24 * 60 * 60 * 1000));
  if (crossed.length === 0 || !mailer) return { crossed: crossed.length };
  const lines = crossed.map((c) => `${c.name} (${c.emails.join(", ")}) — zboží za ${Math.round(c.goodsKc).toLocaleString("cs-CZ")} Kč v ${monthName(month, "locative")}`);
  const subject = `Partnerský program: klient přesáhl 20 000 Kč (${crossed.map((c) => c.name).join(", ")})`;
  const text = ["Tito klienti přesáhli v tomto měsíci 20 000 Kč za zboží v e-shopu (individuální dohoda):", "", ...lines, "", `Procento slevy určíte při schválení: ${PARTNER_APPROVAL_URL}`].join("\n");
  const html = `<p>Tito klienti přesáhli v tomto měsíci 20 000 Kč za zboží v e-shopu (individuální dohoda):</p><ul>${lines.map((l) => `<li>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</li>`).join("")}</ul><p>Procento slevy určíte při schválení: <a href="${PARTNER_APPROVAL_URL}">MojeBegina</a></p>`;
  await sendInternal(mailer, { subject, text, html }, `partner-20k-${monthKey(month)}-${crossed.map((c) => c.key).join("+").slice(0, 120)}`);
  return { crossed: crossed.length };
}

export type FinalizeResult = {
  status: "done";
  codes: string[];
  emailed: string[];
  failed: string[];
  /** klienti nad 20 000 Kč bez určeného procenta — čekají na Lucii */
  waiting: string[];
};

/**
 * První den měsíce po půlnoci: přepočet podle konečného stavu minulého měsíce,
 * založení kódů a rozeslání e-mailů. Pevné úrovně automaticky, individuální jen s procentem od Lucie.
 * Dá se spustit opakovaně — komu už e-mail odešel, tomu znovu neodejde.
 */
export async function finalizePartnerMonth<T extends PgQueryResultHKT>(db: AnyDb<T>, now: Date, mailer: Mailer | null = defaultMailer()): Promise<FinalizeResult> {
  const today = pragueYearMonth(now);
  const validMonth = { year: today.year, month: today.month };
  const evaluatedMonth = addMonths(validMonth, -1);
  const overview = await loadPartnerMonthOverview(db, evaluatedMonth);
  const state = overview.state;

  // Od 20. 11. 2026 (Lucie): pevné úrovně 3 / 5 / 7 % se zapnou a e-maily
  // odejdou bez schválení. Schvaluje se jen individuální sleva nad 20 000 Kč.
  // klient → procento (pevné úrovně podle konečného stavu, individuální podle schválení)
  const waiting: string[] = [];
  const entitled: { client: PartnerClient; percent: number }[] = [];
  for (const client of overview.clients) {
    if (client.emails.length === 0) continue;
    if (client.percent === null) {
      const percent = state.individual[client.key];
      if (percent) entitled.push({ client, percent });
      else waiting.push(client.name);
    } else if (client.percent > 0) {
      entitled.push({ client, percent: client.percent });
    }
  }

  // kódy: jeden na procento, jen pro e-maily daných klientů, do konce měsíce
  const byPercent = new Map<number, string[]>();
  for (const { client, percent } of entitled) byPercent.set(percent, [...(byPercent.get(percent) ?? []), ...client.emails]);
  const expiresAt = monthRange(validMonth).to;
  const note = `Partnerský program ${monthKey(validMonth)} (nákupy ${monthKey(evaluatedMonth)}), automaticky${state.approvedBy ? `, individuální slevy: ${state.approvedBy}` : ""}`;
  const codes: string[] = [];
  for (const [percent, emails] of byPercent) {
    const code = partnerEntitlementCode(validMonth, percent);
    const values = { discountType: "percent", amount: String(percent), emailRestrictions: [...new Set(emails)], expiresAt, isActive: true, note, usedBefore: 0, usedByBefore: [] as string[] };
    await db
      .insert(eshopCoupons)
      .values({ code, ...values })
      .onConflictDoUpdate({ target: eshopCoupons.code, set: { ...values, updatedAt: now } });
    codes.push(`${percent} %`);
  }

  // e-maily klientům (kromě odhlášených a těch, kterým už odešlo)
  const emailed: string[] = [];
  const failed: string[] = [];
  const sent = new Set(state.sent);
  const optOuts = new Set(overview.optOuts);
  if (mailer) {
    for (const { client, percent } of entitled) {
      const salutation = state.salutations[client.key] ?? overview.rememberedSalutations[client.key] ?? suggestSalutation(client.personName);
      const message = buildPartnerEmail({ salutation, evaluatedMonth, goodsKc: client.goodsKc, percent });
      for (const email of client.emails) {
        if (sent.has(email) || optOuts.has(email)) continue;
        const { to } = resolveRecipients([email], mailer.config);
        const result = await mailer.transport(
          { from: mailer.config.from, to, bcc: (mailer.config.invoiceCopyTo ?? []).filter((copy) => !to.includes(copy)), replyTo: mailer.config.replyTo, ...message },
          `partner-${monthKey(validMonth)}-${email}`
        );
        if (result.ok) {
          sent.add(email);
          emailed.push(email);
          await savePartnerMonthState(db, validMonth, { ...state, sent: [...sent].sort() });
        } else {
          failed.push(email);
          console.error("Partnerský program: e-mail klientovi se nepodařilo odeslat", result.error.slice(0, 200));
        }
      }
    }
  }
  await savePartnerMonthState(db, validMonth, { ...state, sent: [...sent].sort(), finalizedAt: now.toISOString() });

  // co se změnilo mezi reportem v 18:00 a půlnocí (nový klient / jiné procento)
  const describe = (p: number | undefined) => (p === undefined ? "v reportu nebyl" : p === -1 ? "individuální" : p === 0 ? "bez slevy" : `${p} %`);
  const changes: string[] = [];
  if (state.reported) {
    for (const client of overview.clients) {
      const now_ = client.percent ?? -1;
      const before = state.reported[client.key];
      if (before === now_) continue;
      changes.push(`${client.name} (${client.emails.join(", ")}) — zboží ${Math.round(client.goodsKc).toLocaleString("cs-CZ")} Kč: ${describe(before)} → ${describe(now_)}`);
    }
  }

  if (mailer) {
    const subject = `Partnerský program: slevy na ${monthName(validMonth)} zapnuty, e-mailů odesláno ${emailed.length}${changes.length ? `, změny po 18:00: ${changes.length}` : ""}`;
    const text = [
      `Zapnuté slevy (v pokladně se odečtou automaticky): ${codes.join(", ") || "žádné"}.`,
      `E-mail odešel: ${emailed.join(", ") || "nikomu"}.`,
      failed.length ? `NEPODAŘILO SE odeslat: ${failed.join(", ")}.` : "",
      changes.length ? `ZMĚNY PO REPORTU V 18:00 (nákupy do půlnoci, procento je už upravené):\n${changes.join("\n")}` : state.reported ? "Od reportu v 18:00 se nic nezměnilo." : "",
      waiting.length ? `Čekají na určení individuální slevy (nad 20 000 Kč): ${waiting.join(", ")} — ${PARTNER_APPROVAL_URL}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    await sendInternal(mailer, { subject, text, html: `<p>${text.replace(/\n/g, "<br>")}</p>` }, `partner-hotovo-${monthKey(validMonth)}-${emailed.length}-${failed.length}-${changes.length}`);
  }
  return { status: "done", codes, emailed, failed, waiting };
}

/**
 * Nový zákazník e-shopu: na tento e-mail neexistuje žádná jiná (nezrušená)
 * objednávka z e-shopu a zákazník si neodmítl obchodní sdělení. Podle toho se
 * do potvrzení objednávky přidá představení partnerského programu. Při chybě
 * raději nic nepřidává.
 */
export async function isNewEshopCustomer<T extends PgQueryResultHKT>(db: AnyDb<T>, orderId: string, rawEmail: string): Promise<boolean> {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@")) return false;
  try {
    const [other] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.channel, "eshop"), ne(orders.fulfillmentStatus, "cancelled"), ne(orders.id, orderId), sql`lower(${orders.contactEmail}) = ${email}`))
      .limit(1);
    if (other) return false;
    return !(await loadPartnerOptOuts(db)).includes(email);
  } catch (error) {
    console.error("Partnerský program: nepodařilo se ověřit nového zákazníka", error instanceof Error ? error.message.slice(0, 200) : error);
    return false;
  }
}
