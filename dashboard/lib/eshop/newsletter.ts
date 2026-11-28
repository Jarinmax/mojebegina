// Newsletter – souhlasy s odběrem (Jarin 28. 11. 2026, vlákno Newsletter
// a e-mail marketing). Čisté funkce bez I/O: kontrola vstupu, texty souhlasu
// a potvrzovací e-mail. Práce s DB a odeslání je v newsletterServer.ts.
//
// Pravidla (zákon č. 480/2004 Sb., § 7 a GDPR):
//   • Newsletter dostane jen adresa se stavem „confirmed“ – souhlas platí až
//     po kliknutí na tlačítko v potvrzovacím e-mailu (double opt-in), takže
//     ho jde doložit (datum, text souhlasu, odkud přišel).
//   • Souhlas po telefonu (CRM) se taky potvrzuje e-mailem – obchodník jen
//     odešle potvrzovací e-mail, sám souhlas „nezaškrtne“.
//   • Odhlášení (odkaz v e-mailu) přepne adresu na „unsubscribed“ a zapíše ji
//     mezi odhlášené ze všech obchodních sdělení.
import { OPERATOR } from "./operator";

export const NEWSLETTER_SEGMENTS = ["kavarna", "domacnost"] as const;
export type NewsletterSegment = (typeof NEWSLETTER_SEGMENTS)[number];
export const SEGMENT_LABELS: Record<NewsletterSegment, string> = { kavarna: "Kavárna / bistro", domacnost: "Domácnost" };

export const NEWSLETTER_SOURCES = ["web", "pro-kavarny", "crm"] as const;
export type NewsletterSource = (typeof NEWSLETTER_SOURCES)[number];
export const SOURCE_LABELS: Record<NewsletterSource, string> = { web: "web (patička)", "pro-kavarny": "stránka Pro kavárny a bistra", crm: "souhlas po telefonu (CRM)" };

export type NewsletterStatus = "pending" | "confirmed" | "unsubscribed";

/** Text, se kterým zákazník souhlasí – ukládá se ke každému souhlasu. */
export const CONSENT_TEXT =
  `Souhlasím se zasíláním newsletteru Begina (novinky, recepty, tipy a nabídky) na tento e-mail. ` +
  `Odesílatel: ${OPERATOR.name}, IČO ${OPERATOR.ico}. Odhlásit se jde kdykoli odkazem v každém e-mailu.`;

/** Krátká verze pod formulářem na webu. */
export const CONSENT_NOTE =
  "Max. 2× měsíčně: recepty, tipy na podávání a novinky. Pošleme vám e-mail k potvrzení. Odhlásit se jde kdykoli jedním kliknutím.";

/** Otázka pro obchodníka při hovoru (Taháček). */
export const CALL_QUESTION = "Můžu vám posílat e-mailem novinky a recepty? Je to max. 2× měsíčně a jde se kdykoli odhlásit.";

const EMAIL = /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]{2,}$/;

export function normalizeEmail(raw: unknown): string | null {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

export function parseSegment(raw: unknown): NewsletterSegment | null {
  return NEWSLETTER_SEGMENTS.find((segment) => segment === raw) ?? null;
}

/** Typ podniku z CRM → segment (kavárny, bistra, restaurace a hotely = gastro). */
export function segmentForVenue(venueType: string | null | undefined): NewsletterSegment | null {
  if (!venueType) return null;
  return ["kavarna", "bistro", "restaurace", "hotel"].includes(venueType) ? "kavarna" : null;
}

export type SubscribeInput = { email: string; segment: NewsletterSegment | null; source: NewsletterSource };
export type SubscribeParse = { ok: true; value: SubscribeInput } | { ok: false; error: string };

/** Formulář z webu. Vyplněné skryté pole „web“ = robot → tváříme se, že je hotovo, nic se neuloží. */
export function parseSubscribeForm(form: { email: unknown; segment: unknown; source: unknown; trap?: unknown }): SubscribeParse | { ok: "bot" } {
  if (typeof form.trap === "string" && form.trap.trim() !== "") return { ok: "bot" };
  const email = normalizeEmail(form.email);
  if (!email) return { ok: false, error: "Zadejte prosím platný e-mail." };
  const segment = parseSegment(form.segment);
  if (!segment) return { ok: false, error: "Vyberte prosím, jestli jste kavárna/bistro, nebo domácnost." };
  const source: NewsletterSource = form.source === "pro-kavarny" ? "pro-kavarny" : "web";
  return { ok: true, value: { email, segment, source } };
}

/** Potvrzovací e-mail jde znovu nejdřív po 10 minutách (ochrana proti zahlcení). */
export const CONFIRM_RESEND_MINUTES = 10;

export function canResendConfirmation(lastSentAt: Date | null, now: Date = new Date()): boolean {
  return !lastSentAt || now.getTime() - lastSentAt.getTime() >= CONFIRM_RESEND_MINUTES * 60_000;
}

// ── Potvrzovací e-mail ──────────────────────────────────────────────────────

export const CONFIRM_EMAIL_SUBJECT = "Potvrďte prosím odběr novinek Begina";
export const CONFIRM_EMAIL_BUTTON = "Potvrdit odběr";
export const CONFIRM_EMAIL_LEGAL = `Odesílatel: ${OPERATOR.name} – Begina, ${OPERATOR.address}, IČO ${OPERATOR.ico}. Pokud jste o odběr nežádali, e-mail ignorujte – bez potvrzení vám nic posílat nebudeme.`;
const SIGNATURE = ["S přátelským pozdravem", "tým Begina", OPERATOR.phone, OPERATOR.email, "www.begina.cz"] as const;

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function confirmationParagraphs(segment: NewsletterSegment | null, source: NewsletterSource): string[] {
  const intro =
    source === "crm"
      ? "děkujeme za telefonát. Jak jsme se domluvili, rádi vám budeme posílat novinky Beginy."
      : "děkujeme za zájem o novinky Beginy.";
  const what =
    segment === "kavarna"
      ? "Pro kavárny a bistra posíláme max. 2× měsíčně: nové druhy, sezónní nabídku, tipy na podávání a jak na nich vydělat."
      : "Posíláme max. 2× měsíčně: recepty, tipy na podávání, sezónní novinky a občas nabídku.";
  return [intro, what, "Odběr prosím potvrďte jedním kliknutím:"];
}

export type ConfirmEmailInput = { segment: NewsletterSegment | null; source: NewsletterSource; confirmUrl: string; test?: boolean };

export function confirmationEmail(input: ConfirmEmailInput): { subject: string; html: string; text: string } {
  const paragraphs = confirmationParagraphs(input.segment, input.source);
  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  const p = (content: string) => `<tr><td style="font-size:15px;line-height:22px;color:#1A1A1A;padding-bottom:14px;">${content}</td></tr>`;
  const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F7F7;${font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F7;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px;padding:24px;${font}">
<tr><td style="font-size:20px;font-weight:700;letter-spacing:0.5px;color:#000000;padding-bottom:16px;">BEGINA.CZ</td></tr>
${p("Dobrý den,")}
${paragraphs.map((text) => p(escapeHtml(text))).join("\n")}
<tr><td style="padding:4px 0 18px;"><a href="${escapeHtml(input.confirmUrl)}" style="display:inline-block;background:#000000;color:#FFFFFF;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:15px;font-weight:600;">${escapeHtml(CONFIRM_EMAIL_BUTTON)}</a></td></tr>
${p(SIGNATURE.map(escapeHtml).join("<br>"))}
<tr><td style="font-size:12px;line-height:18px;color:#737373;border-top:1px solid #EDEDED;padding-top:14px;">${escapeHtml(CONFIRM_EMAIL_LEGAL)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = ["Dobrý den,", "", ...paragraphs, "", `${CONFIRM_EMAIL_BUTTON}: ${input.confirmUrl}`, "", ...SIGNATURE, "", CONFIRM_EMAIL_LEGAL].join("\n");
  return { subject: `${input.test ? "[TEST] " : ""}${CONFIRM_EMAIL_SUBJECT}`, html, text };
}
