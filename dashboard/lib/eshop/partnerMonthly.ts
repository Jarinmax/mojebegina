// Partnerský program — měsíční vyhodnocení (čistá logika, bez DB a bez sítě).
//
// Pravidla (Lucie, 14.–15. 11. 2026, stránka begina.cz/partnersky-program):
//   • počítají se JEN objednávky z e-shopu uhrazené v daném kalendářním měsíci,
//     hodnota zboží po slevě, bez dopravy; faktury mimo e-shop se nepočítají,
//   • jeden klient = firma podle IČO z objednávky; kde IČO není, podle e-mailu,
//   • sleva platí celý následující měsíc; klient žádný kód nepíše — v pokladně
//     zadá svůj e-mail a klikne na „Uplatnit“ (Lucie 15. 11. 2026). Nárok se
//     drží ve vnitřním řádku eshop_coupons „partner-RRRR-MM-procento“,
//   • nad 20 000 Kč je sleva individuální — procento určuje Lucie při schválení,
//   • klientům nic neodejde bez schválení (viz partnerMonthlyServer.ts).
import { partnerTiers } from "@/mock/partnerProgram";

export type PartnerOrderRow = {
  orderNumber: number | null;
  paidAt: Date;
  /** zboží po slevě, bez dopravy */
  goodsKc: number;
  /** celkem včetně dopravy */
  totalKc: number;
  email: string | null;
  ico: string | null;
  company: string | null;
  name: string | null;
  /** jméno člověka (kontakt, jinak fakturační) — pro návrh oslovení */
  personName?: string | null;
};

export type PartnerClient = {
  /** "ico:12345678" nebo "email:a@b.cz" */
  key: string;
  name: string;
  emails: string[];
  orders: number;
  goodsKc: number;
  totalKc: number;
  tierLabel: string;
  /** 0 = bez slevy, null = individuální dohoda (nad 20 000 Kč) */
  percent: number | null;
  /** jméno člověka z objednávky (i u firmy) — pro návrh oslovení */
  personName?: string;
};

const MONTH_NOMINATIVE = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
const MONTH_GENITIVE = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
const MONTH_LOCATIVE = ["lednu", "únoru", "březnu", "dubnu", "květnu", "červnu", "červenci", "srpnu", "září", "říjnu", "listopadu", "prosinci"];

export type YearMonth = { year: number; month: number }; // month 1–12

export function monthKey(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, "0")}`;
}

export function parseMonthKey(key: string): YearMonth | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year: Number(match[1]), month } : null;
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const index = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function daysInMonth(ym: YearMonth): number {
  return new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
}

export function monthName(ym: YearMonth, form: "nominative" | "genitive" | "locative" = "nominative"): string {
  const table = form === "genitive" ? MONTH_GENITIVE : form === "locative" ? MONTH_LOCATIVE : MONTH_NOMINATIVE;
  return table[ym.month - 1];
}

/** Začátek vnitřních řádků s nárokem na partnerskou slevu — v pokladně je nejde zadat jako kód. */
export const PARTNER_ENTITLEMENT_PREFIX = "partner-20";

/** Vnitřní řádek s nárokem: partner-2026-12-5 (měsíc platnosti a procento). */
export function partnerEntitlementCode(validMonth: YearMonth, percent: number): string {
  return `partner-${monthKey(validMonth)}-${formatPercent(percent).replace(",", "_")}`;
}

function formatPercent(percent: number): string {
  return String(Math.round(percent * 100) / 100).replace(".", ",");
}

function formatKc(amount: number): string {
  return `${Math.round(amount).toLocaleString("cs-CZ").replace(/ | /g, " ")} Kč`;
}

/** Úroveň podle nákupů zboží: „nad 5 000 do 8 000“ = 5 000,01 až 8 000. */
export function tierFor(goodsKc: number): { label: string; percent: number | null } {
  const tier = [...partnerTiers].reverse().find((t) => goodsKc > t.minAmount - 1) ?? partnerTiers[0];
  return { label: tier.discountLabel, percent: tier.discountPercent };
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** Seskupí uhrazené e-shopové objednávky měsíce podle klienta (IČO, jinak e-mail). */
export function evaluatePartnerMonth(rows: PartnerOrderRow[]): PartnerClient[] {
  const clients = new Map<string, PartnerClient>();
  for (const row of rows) {
    const email = clean(row.email).toLowerCase();
    const ico = clean(row.ico);
    const key = ico ? `ico:${ico}` : email ? `email:${email}` : "";
    if (!key) continue;
    let client = clients.get(key);
    if (!client) {
      client = { key, name: "", emails: [], orders: 0, goodsKc: 0, totalKc: 0, tierLabel: "", percent: 0 };
      clients.set(key, client);
    }
    const name = clean(row.company) || clean(row.name);
    if (name && !client.name) client.name = name;
    const person = clean(row.personName ?? row.name);
    if (person && !client.personName) client.personName = person;
    if (email && !client.emails.includes(email)) client.emails.push(email);
    client.orders += 1;
    client.goodsKc += row.goodsKc;
    client.totalKc += row.totalKc;
  }
  const list = [...clients.values()];
  for (const client of list) {
    const tier = tierFor(client.goodsKc);
    client.tierLabel = tier.label;
    client.percent = tier.percent;
    if (!client.name) client.name = client.emails[0] ?? client.key;
  }
  return list.sort((a, b) => b.goodsKc - a.goodsKc || a.key.localeCompare(b.key));
}

/**
 * Podpis podle Luciina podpisu v poště info@begina.cz (15. 11. 2026). Telefon
 * je číslo z patičky webu (+420 774 199 975). Řádek s IČO je povinné označení
 * odesílatele obchodního sdělení (zákon č. 480/2004 Sb., § 7 odst. 4).
 */
export const PARTNER_EMAIL_SIGNATURE = ["tým Begina", "+420 774 199 975", "info@begina.cz", "www.begina.cz"];
export const PARTNER_EMAIL_SENDER = "Odesílatel: Jaroslav Viner, IČO 74337297";

export const PARTNER_PROGRAM_URL = "https://begina.cz/partnersky-program";

export type PartnerEmail = { subject: string; text: string; html: string };

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * E-mail klientovi se slevou na další měsíc (znění schválila Lucie 15. 11. 2026).
 * salutation = oslovení za „Dobrý den,“ (např. „paní Průchová“) — vyplňuje
 * Lucie při schválení; prázdné = jen „Dobrý den,“ (5. pád nejde spolehlivě
 * odvodit strojově). Označeno jako obchodní sdělení, s možností odmítnout
 * (zákon č. 480/2004 Sb., § 7).
 */
export function buildPartnerEmail(input: {
  salutation?: string | null;
  evaluatedMonth: YearMonth;
  goodsKc: number;
  percent: number;
}): PartnerEmail {
  const valid = addMonths(input.evaluatedMonth, 1);
  const salutation = clean(input.salutation);
  const greeting = salutation ? `Dobrý den, ${salutation},` : "Dobrý den,";
  const percent = `${formatPercent(input.percent)} %`;
  const paragraphs = [
    `děkujeme za Vaše objednávky v e-shopu Begina v ${monthName(input.evaluatedMonth, "locative")}. Za zboží jste nakoupili celkem ${formatKc(input.goodsKc)}, a tím jste dosáhli partnerské úrovně se slevou ${percent}.`,
    `Sleva platí na všechny objednávky v e-shopu od 1. do ${daysInMonth(valid)}. ${monthName(valid, "genitive")}. Žádný kód nepotřebujete: v pokladně zadejte tento e-mail a u partnerské slevy klikněte na „Uplatnit“.`,
    `Jak partnerský program funguje: ${PARTNER_PROGRAM_URL}`,
  ];
  const optOut = "Pokud si nepřejete dostávat informace o partnerském programu, odpovězte na tento e-mail slovem NE.";
  const subject = `Vaše partnerská sleva na ${monthName(valid)} (obchodní sdělení)`;
  const text = [greeting, "", ...paragraphs.flatMap((p) => [p, ""]), "S přátelským pozdravem", ...PARTNER_EMAIL_SIGNATURE, "", PARTNER_EMAIL_SENDER, optOut].join("\n");
  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(paragraphs[0]).replace(escapeHtml(percent), `<strong>${escapeHtml(percent)}</strong>`)}</p>`,
    `<p>${escapeHtml(paragraphs[1])}</p>`,
    `<p>Jak partnerský program funguje: <a href="${PARTNER_PROGRAM_URL}">begina.cz/partnersky-program</a></p>`,
    `<p><em>S přátelským pozdravem</em><br><strong>${escapeHtml(PARTNER_EMAIL_SIGNATURE[0])}</strong><br>${PARTNER_EMAIL_SIGNATURE.slice(1).map(escapeHtml).join("<br>")}</p>`,
    `<p style="color:#666;font-size:13px">${escapeHtml(PARTNER_EMAIL_SENDER)}<br>${escapeHtml(optOut)}</p>`,
  ].join("\n");
  return { subject, text, html };
}

/** Tabulka klientů pro interní report (info@begina.cz) — prostý text i HTML. */
export function buildPartnerReport(input: {
  evaluatedMonth: YearMonth;
  clients: PartnerClient[];
  preliminary: boolean;
  approvalUrl: string;
}): PartnerEmail {
  const valid = addMonths(input.evaluatedMonth, 1);
  const title = `Partnerský program: ${monthName(input.evaluatedMonth)} ${input.evaluatedMonth.year}${input.preliminary ? " (průběžný stav)" : ""}`;
  const describe = (client: PartnerClient): string =>
    client.percent === null ? "individuální dohoda — určete procento" : client.percent > 0 ? `sleva ${formatPercent(client.percent)} %` : "bez slevy";
  const lines = input.clients.map(
    (c, i) => `${i + 1}. ${c.name} (${c.emails.join(", ") || "bez e-mailu"}) — objednávek ${c.orders}, s dopravou ${formatKc(c.totalKc)}, zboží ${formatKc(c.goodsKc)} → ${describe(c)}`
  );
  const withDiscount = input.clients.filter((c) => c.percent === null || c.percent > 0).length;
  const intro = [
    `Nákupy přes e-shop uhrazené v ${monthName(input.evaluatedMonth, "locative")} ${input.evaluatedMonth.year}. Klientů: ${input.clients.length}, z toho se slevou na ${monthName(valid)}: ${withDiscount}.`,
    `Klientům zatím nic neodešlo. Slevy se zapnou a e-maily odejdou po půlnoci jen po schválení: ${input.approvalUrl}`,
  ];
  const text = [title, "", ...intro, "", ...(lines.length ? lines : ["Žádné uhrazené objednávky z e-shopu."])].join("\n");
  const rows = input.clients
    .map(
      (c, i) =>
        `<tr><td>${i + 1}</td><td>${escapeHtml(c.name)}<br><small>${escapeHtml(c.emails.join(", "))}</small></td><td align="right">${c.orders}</td><td align="right">${formatKc(c.totalKc)}</td><td align="right">${formatKc(c.goodsKc)}</td><td>${escapeHtml(describe(c))}</td></tr>`
    )
    .join("");
  const html = [
    `<h2>${escapeHtml(title)}</h2>`,
    `<p>${escapeHtml(intro[0])}</p>`,
    `<p>Klientům zatím nic neodešlo. Slevy se zapnou a e-maily odejdou po půlnoci jen po schválení: <a href="${input.approvalUrl}">schválit v MojeBegina</a></p>`,
    lines.length
      ? `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse"><tr><th>#</th><th>Zákazník</th><th>Objednávek</th><th>S dopravou</th><th>Zboží bez dopravy</th><th>Úroveň na ${escapeHtml(monthName(valid))}</th></tr>${rows}</table>`
      : "<p>Žádné uhrazené objednávky z e-shopu.</p>",
  ].join("\n");
  return { subject: title, text, html };
}

/** Kdo během posledního dne přesáhl 20 000 Kč (pro upozornění na info@begina.cz). */
export function crossedIndividualLimit(rows: PartnerOrderRow[], since: Date): PartnerClient[] {
  const before = new Map(evaluatePartnerMonth(rows.filter((r) => r.paidAt < since)).map((c) => [c.key, c]));
  return evaluatePartnerMonth(rows).filter((c) => c.percent === null && before.get(c.key)?.percent !== null);
}
