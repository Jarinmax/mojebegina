// Kampaň „Ochutnávkový set sirupů“ (zadání Lucie 17. 11. 2026) — čistá
// pravidla bez DB: e-mail se slevovým kódem, provize pro Josefa a přehledy.
//
//   Kód OCHUTNAVKA50: 50 Kč na další nákup zboží od 199 Kč (bez dopravy,
//   set se nezapočítá a sleva se na něj nevztahuje), jednou na zákazníka,
//   do 31. 3. 2027, nelze kombinovat. Chodí e-mailem 5 dní po odeslání setu,
//   jednou na objednávku.
//   Provize: 3 Kč za každý set prodaný za akční cenu + 5 % ze zboží
//   (po slevě, bez dopravy) dalších objednávek zákazníků, pro které byl
//   akční set první nákup — 6 měsíců od první objednávky. Počítá se na
//   haléře, měsíční součet se zaokrouhlí na celé koruny.
import { customerGreeting } from "./email/greeting";
import { OPERATOR } from "./operator";
import { SET_CAMPAIGN_LIMIT, SET_COUPON_CODE } from "./tastingSet";

/** Zapne se až po schválení textu e-mailu (Lucie řekne „ano“). */
export const SET_COUPON_EMAILS_ENABLED = false;
export const COUPON_EMAIL_AFTER_DAYS = 5;
export const COUPON_EMAIL_MAX_AGE_DAYS = 30;
export const COUPON_AMOUNT_KC = 50;
export const COUPON_MINIMUM_KC = 199;
export const COUPON_VALID_UNTIL_TEXT = "31. 3. 2027";
export const COMMISSION_PER_SET_KC = 3;
export const COMMISSION_PERCENT = 5;
export const COMMISSION_MONTHS = 6;

const CODE = SET_COUPON_CODE.toUpperCase();
export const COUPON_EMAIL_SUBJECT = `Sleva ${COUPON_AMOUNT_KC} Kč na váš další nákup`;
export const COUPON_EMAIL_PARAGRAPHS = [
  `jak vám chutnal ochutnávkový set? Až si vyberete svůj oblíbený sirup nebo cokoli dalšího z naší nabídky, máme pro vás slevu ${COUPON_AMOUNT_KC} Kč.`,
  `Stačí v košíku zadat kód ${CODE}.`,
  `Kód platí jednou, při nákupu zboží od ${COUPON_MINIMUM_KC} Kč (bez dopravy a bez ochutnávkového setu), do ${COUPON_VALID_UNTIL_TEXT}. Nelze ho kombinovat s jinou slevou.`,
] as const;
export const COUPON_EMAIL_BUTTON = "Vybrat si na begina.cz";
export const COUPON_EMAIL_SIGNATURE = ["S přátelským pozdravem", "tým Begina", "+420 774 199 975", "info@begina.cz", "www.begina.cz"] as const;
/** Patička podle § 7 odst. 4 zák. č. 480/2004 Sb. a § 435 občanského zákoníku. */
export const COUPON_EMAIL_LEGAL = `Obchodní sdělení. Odesílatel: ${OPERATOR.name} – Begina, ${OPERATOR.address}, IČO ${OPERATOR.ico}. Tento e-mail jste dostali, protože jste nakoupili na begina.cz.`;

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

export function couponEmail(input: { customerName: string | null; shopUrl: string; optoutUrl: string; test?: boolean }): { subject: string; html: string; text: string } {
  const greeting = customerGreeting(input.customerName);
  const p = (content: string) => `<tr><td style="font-size:15px;line-height:22px;color:#1A1A1A;padding-bottom:14px;">${content}</td></tr>`;
  const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F7F7;${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F7;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px;padding:24px;${FONT}">
<tr><td style="font-size:20px;font-weight:700;letter-spacing:0.5px;color:#000000;padding-bottom:16px;">BEGINA.CZ</td></tr>
${p(escapeHtml(greeting))}
${p(escapeHtml(COUPON_EMAIL_PARAGRAPHS[0]))}
${p(escapeHtml(COUPON_EMAIL_PARAGRAPHS[1]))}
<tr><td style="padding:0 0 16px;"><span style="display:inline-block;border:2px dashed #000000;border-radius:8px;padding:10px 18px;font-size:20px;font-weight:700;letter-spacing:1px;color:#000000;">${CODE}</span></td></tr>
${p(escapeHtml(COUPON_EMAIL_PARAGRAPHS[2]))}
<tr><td style="padding:4px 0 18px;"><a href="${escapeHtml(input.shopUrl)}" style="display:inline-block;background:#000000;color:#FFFFFF;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:15px;font-weight:600;">${escapeHtml(COUPON_EMAIL_BUTTON)}</a></td></tr>
${p(COUPON_EMAIL_SIGNATURE.map(escapeHtml).join("<br>"))}
<tr><td style="font-size:12px;line-height:18px;color:#737373;border-top:1px solid #EDEDED;padding-top:14px;">${escapeHtml(COUPON_EMAIL_LEGAL)} Nechcete podobné e-maily dostávat? <a href="${escapeHtml(input.optoutUrl)}" style="color:#737373;">Odhlásit se</a>.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    greeting,
    "",
    ...COUPON_EMAIL_PARAGRAPHS,
    "",
    `${COUPON_EMAIL_BUTTON}: ${input.shopUrl}`,
    "",
    ...COUPON_EMAIL_SIGNATURE,
    "",
    `${COUPON_EMAIL_LEGAL} Odhlášení z podobných e-mailů: ${input.optoutUrl}`,
  ].join("\n");
  return { subject: `${input.test ? "[TEST] " : ""}${COUPON_EMAIL_SUBJECT}`, html, text };
}

// ── Provize ───────────────────────────────────────────────────────────────

export type LaterOrder = { number: string; paidAt: Date; goodsKc: number };
export type CommissionReport = {
  /** "2026-12" */
  month: string;
  sets: number;
  laterOrders: LaterOrder[];
  setsHalere: number;
  laterHalere: number;
  /** měsíční součet zaokrouhlený na celé koruny */
  totalKc: number;
};

/** 5 % ze zboží v haléřích (Kč × 5 = haléře, vychází přesně). */
export function laterCommissionHalere(goodsKc: number): number {
  return Math.max(0, goodsKc) * COMMISSION_PERCENT;
}

export function buildCommission(month: string, sets: number, laterOrders: LaterOrder[]): CommissionReport {
  const setsHalere = Math.max(0, sets) * COMMISSION_PER_SET_KC * 100;
  const laterHalere = laterOrders.reduce((sum, order) => sum + laterCommissionHalere(order.goodsKc), 0);
  return { month, sets, laterOrders, setsHalere, laterHalere, totalKc: Math.round((setsHalere + laterHalere) / 100) };
}

export function halereText(halere: number): string {
  return `${new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(halere / 100)} Kč`;
}
const kc = (value: number) => `${new Intl.NumberFormat("cs-CZ").format(value)} Kč`;
const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
export function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${year}`;
}
/** Předchozí měsíc k "YYYY-MM-DD" (pražské datum) → "YYYY-MM". */
export function previousMonth(pragueDay: string): string {
  const [year, month] = pragueDay.split("-").map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}
export function monthOf(pragueDay: string): string {
  return pragueDay.slice(0, 7);
}

type Mail = { subject: string; text: string; html: string };
const mail = (subject: string, lines: string[]): Mail => ({
  subject,
  text: lines.join("\n"),
  html: `<div style="${FONT}font-size:15px;line-height:22px;color:#1A1A1A;">${lines.map((line) => (line === "" ? "<br>" : `<div>${escapeHtml(line)}</div>`)).join("")}</div>`,
});

/** Měsíční přehled provize (1. den v měsíci v 11:00 na info@begina.cz). */
export function commissionEmail(report: CommissionReport): Mail {
  const lines = [
    `Provize Josef – kampaň Ochutnávkový set, ${monthLabel(report.month)}`,
    "",
    `Sety za akční cenu (zaplacené, nestornované): ${report.sets} ks × ${COMMISSION_PER_SET_KC} Kč = ${halereText(report.setsHalere)}`,
    `Další nákupy zákazníků z kampaně: ${report.laterOrders.length} objednávek, zboží po slevě bez dopravy ${kc(report.laterOrders.reduce((sum, order) => sum + order.goodsKc, 0))} × ${COMMISSION_PERCENT} % = ${halereText(report.laterHalere)}`,
    ...report.laterOrders.map((order) => `  · objednávka ${order.number}: ${kc(order.goodsKc)} → ${halereText(laterCommissionHalere(order.goodsKc))}`),
    "",
    `Provize celkem: ${kc(report.totalKc)} (součet ${halereText(report.setsHalere + report.laterHalere)} zaokrouhlený na celé koruny)`,
    "",
    "Počítají se objednávky zaplacené v daném měsíci. Stejný přehled je v MojeBegina → Řízení firmy → Kampaň set.",
  ];
  return mail(`Provize Josef za ${monthLabel(report.month)}: ${kc(report.totalKc)}`, lines);
}

export type CampaignStats = {
  setsTotal: number;
  setsWeek: number;
  campaignSold: number;
  couponUses: number;
  campaignCustomers: number;
  returningCustomers: number;
};

export function returningPercent(stats: Pick<CampaignStats, "campaignCustomers" | "returningCustomers">): number | null {
  return stats.campaignCustomers === 0 ? null : Math.round((stats.returningCustomers / stats.campaignCustomers) * 100);
}

/** Sobotní přehled kampaně (10:30 na info@begina.cz). */
export function saturdayEmail(stats: CampaignStats): Mail {
  const percent = returningPercent(stats);
  const lines = [
    "Kampaň Ochutnávkový set – týdenní přehled",
    "",
    `Prodané sety celkem: ${stats.setsTotal} ks, z toho za posledních 7 dní: ${stats.setsWeek} ks`,
    `Za akční cenu: ${stats.campaignSold} ze ${SET_CAMPAIGN_LIMIT}, zbývá ${Math.max(0, SET_CAMPAIGN_LIMIT - stats.campaignSold)}`,
    `Použití kódu ${CODE}: ${stats.couponUses}×`,
    `Zákazníci z kampaně: ${stats.campaignCustomers}, znovu nakoupilo ${stats.returningCustomers}${percent === null ? "" : ` (${percent} %)`}`,
  ];
  return mail(`Kampaň set: ${stats.setsWeek} setů za týden, zbývá ${Math.max(0, SET_CAMPAIGN_LIMIT - stats.campaignSold)} ze ${SET_CAMPAIGN_LIMIT}`, lines);
}
