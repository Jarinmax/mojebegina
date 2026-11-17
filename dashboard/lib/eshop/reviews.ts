// Hodnocení produktů (zadání Lucie 17. 11. 2026) — čisté funkce bez I/O:
// podepsaný odkaz na formulář, kontrola vstupu, průměr, podpis recenze
// a e-mail „Jak vám chutná begina?“. Práce s DB je v reviewsServer.ts.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { customerGreeting } from "./email/greeting";

export { REVIEW_MAX_LENGTH, REVIEW_NAME_MAX_LENGTH, REVIEW_VERIFICATION_NOTICE, VERIFIED_LABEL } from "./reviewsFormat";
import { REVIEW_MAX_LENGTH, REVIEW_NAME_MAX_LENGTH } from "./reviewsFormat";
/**
 * Automatické odesílání žádostí o hodnocení. Vypnuto, dokud Lucie neschválí
 * konečný text e-mailu — do té doby cron nic neposílá.
 */
export const REVIEW_EMAILS_ENABLED = false;
/** Žádost o hodnocení odchází 7 dní po doručení; starší než 30 dní už ne. */
export const REVIEW_REQUEST_AFTER_DAYS = 7;
export const REVIEW_REQUEST_MAX_AGE_DAYS = 30;

// ── Podepsané odkazy ───────────────────────────────────────────────────────

type Env = Record<string, string | undefined>;

/** Klíč odkazů: odvozený z tajemství aplikace (nic nového k nastavení). */
export function reviewSecret(env: Env = process.env): string | null {
  const base = env.ESHOP_REVIEW_SECRET?.trim() || env.NEON_AUTH_COOKIE_SECRET?.trim() || env.CRON_SECRET?.trim();
  if (!base) return null;
  return createHash("sha256").update(`begina-eshop-hodnoceni-v1|${base}`).digest("hex");
}

function sign(kind: "o" | "e", value: string, secret: string): string {
  return createHmac("sha256", secret).update(`${kind}|${value}`).digest("base64url").slice(0, 32);
}

function verify(kind: "o" | "e", token: string, secret: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  let value: string;
  try {
    value = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
  } catch {
    return null;
  }
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(kind, value, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return value;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Odkaz na formulář hodnocení jedné objednávky. */
export function reviewToken(orderId: string, secret: string): string {
  return `${Buffer.from(orderId).toString("base64url")}.${sign("o", orderId, secret)}`;
}
export function orderIdFromReviewToken(token: string, secret: string): string | null {
  const value = verify("o", token, secret);
  return value && UUID.test(value) ? value : null;
}

/** Odkaz na odhlášení jedné e-mailové adresy z obchodních sdělení. */
export function optoutToken(email: string, secret: string): string {
  const normalized = email.trim().toLowerCase();
  return `${Buffer.from(normalized).toString("base64url")}.${sign("e", normalized, secret)}`;
}
export function emailFromOptoutToken(token: string, secret: string): string | null {
  const value = verify("e", token, secret);
  return value && value.includes("@") ? value : null;
}

// ── Recenze ────────────────────────────────────────────────────────────────

export { countLabel, formatAverage, summarize, type ReviewSummary } from "./reviewsFormat";

/** Podpis u recenze: jen křestní jméno, bez příjmení („Jana“) — rozhodnutí Lucie 17. 11. 2026. */
export function defaultAuthorName(fullName: string | null | undefined): string {
  const words = (fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !/\.$/.test(word) && /^\p{L}[\p{L}'-]*$/u.test(word));
  return words.length >= 2 ? words[0] : "Zákazník";
}

export type ReviewInput = { productId: string; rating: number; body: string };

/** Vyčistí jednu recenzi z formuláře; null = produkt zákazník nehodnotil (bez hvězdiček). */
export function parseReview(productId: string, ratingRaw: string, bodyRaw: string): ReviewInput | null | { error: string } {
  const body = bodyRaw.replace(/\r\n/g, "\n").trim();
  if (!ratingRaw) return body ? { error: "U produktu s textem vyberte i počet hvězdiček." } : null;
  const rating = Number(ratingRaw);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Vyberte 1 až 5 hvězdiček." };
  if (body.length > REVIEW_MAX_LENGTH) return { error: `Text hodnocení může mít nejvýš ${REVIEW_MAX_LENGTH} znaků.` };
  return { productId, rating, body };
}

export function cleanAuthorName(raw: string, fallback: string): string {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, REVIEW_NAME_MAX_LENGTH);
  return name || fallback;
}

// ── E-mail „Jak vám chutná begina?“ ───────────────────────────────────────

export const REVIEW_EMAIL_SUBJECT = "Jak vám chutná begina?";
export const REVIEW_EMAIL_SIGNATURE = ["S přátelským pozdravem", "tým Begina", "+420 774 199 975", "info@begina.cz", "www.begina.cz"] as const;
/** Krátký text (Lucie 17. 11. 2026: dlouhý e-mail nikdo nečte). */
export const REVIEW_EMAIL_PARAGRAPHS = ["jak vám chutnalo? Budeme rádi za pár hvězdiček k vašemu nákupu. Zabere to minutu."] as const;
export const REVIEW_EMAIL_BUTTON = "Ohodnotit nákup";

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type ReviewEmailInput = { customerName: string | null; reviewUrl: string; optoutUrl: string; test?: boolean };

export function reviewRequestEmail(input: ReviewEmailInput): { subject: string; html: string; text: string; greeting: string } {
  const greeting = customerGreeting(input.customerName);
  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  const p = (content: string) => `<tr><td style="font-size:15px;line-height:22px;color:#1A1A1A;padding-bottom:14px;">${content}</td></tr>`;
  const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F7F7;${font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F7;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px;padding:24px;${font}">
<tr><td style="font-size:20px;font-weight:700;letter-spacing:0.5px;color:#000000;padding-bottom:16px;">BEGINA.CZ</td></tr>
${p(escapeHtml(greeting))}
${p(escapeHtml(REVIEW_EMAIL_PARAGRAPHS[0]))}
<tr><td style="padding:4px 0 18px;"><a href="${escapeHtml(input.reviewUrl)}" style="display:inline-block;background:#000000;color:#FFFFFF;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:15px;font-weight:600;">${escapeHtml(REVIEW_EMAIL_BUTTON)}</a></td></tr>
${p(REVIEW_EMAIL_SIGNATURE.map(escapeHtml).join("<br>"))}
<tr><td style="font-size:12px;line-height:18px;color:#737373;border-top:1px solid #EDEDED;padding-top:14px;">Hodnotit mohou jen zákazníci, kteří produkt zakoupili na begina.cz. Nechcete podobné e-maily dostávat? <a href="${escapeHtml(input.optoutUrl)}" style="color:#737373;">Odhlásit se</a>.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    greeting,
    "",
    REVIEW_EMAIL_PARAGRAPHS[0],
    "",
    `${REVIEW_EMAIL_BUTTON}: ${input.reviewUrl}`,
    "",
    ...REVIEW_EMAIL_SIGNATURE,
    "",
    `Hodnotit mohou jen zákazníci, kteří produkt zakoupili na begina.cz. Odhlášení z podobných e-mailů: ${input.optoutUrl}`,
  ].join("\n");
  return { subject: `${input.test ? "[TEST] " : ""}${REVIEW_EMAIL_SUBJECT}`, html, text, greeting };
}
