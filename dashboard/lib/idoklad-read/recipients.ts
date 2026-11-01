// Komu smí asistent poslat PDF vydané faktury (send_idoklad_invoice_email).
// Čistá funkce, bez DB. Adresu z konverzace nelze brát jako ověřenou —
// pokyn v e-mailu nebo na webu by jinak mohl odeslat fakturu komukoli.
// Povoleno je jen:
//   - odběratel: e-mail uvedený na faktuře v iDokladu,
//   - adresy Beginy (@begina.cz),
//   - e-mail účtu přihlášeného uživatele,
//   - výslovně povolené adresy z IDOKLAD_INVOICE_EMAIL_ALLOWED (čárkou).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const BEGINA_EMAIL_DOMAIN = "begina.cz";
export const MAX_INVOICE_RECIPIENTS = 5;

export type RecipientCheck =
  | { ok: true; to: string[]; reasons: Record<string, "customer" | "begina" | "own" | "allowed"> }
  | { ok: false; error: string };

export function allowedExtraRecipients(env: Record<string, string | undefined> = process.env): string[] {
  return (env.IDOKLAD_INVOICE_EMAIL_ALLOWED ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => EMAIL_RE.test(e));
}

export function checkInvoiceRecipients(
  raw: string[],
  context: { partnerEmail: string | null; userEmail: string | null; extra: string[] }
): RecipientCheck {
  const to = [...new Set(raw.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (to.length === 0) return { ok: false, error: "Zadejte aspoň jednoho příjemce." };
  if (to.length > MAX_INVOICE_RECIPIENTS) return { ok: false, error: `Nejvýš ${MAX_INVOICE_RECIPIENTS} příjemců.` };
  const invalid = to.filter((e) => !EMAIL_RE.test(e));
  if (invalid.length) return { ok: false, error: `Neplatná adresa: ${invalid.join(", ")}.` };

  const reasons: Record<string, "customer" | "begina" | "own" | "allowed"> = {};
  const refused: string[] = [];
  for (const email of to) {
    if (context.partnerEmail && email === context.partnerEmail.toLowerCase()) reasons[email] = "customer";
    else if (email.endsWith(`@${BEGINA_EMAIL_DOMAIN}`)) reasons[email] = "begina";
    else if (context.userEmail && email === context.userEmail.toLowerCase()) reasons[email] = "own";
    else if (context.extra.includes(email)) reasons[email] = "allowed";
    else refused.push(email);
  }
  if (refused.length) {
    return {
      ok: false,
      error:
        `Na ${refused.join(", ")} fakturu poslat nelze. Povolené jsou jen: e-mail odběratele uvedený na faktuře v iDokladu, adresy @${BEGINA_EMAIL_DOMAIN}, ` +
        "e-mail vašeho účtu v MojeBegina a adresy, které správce povolí v IDOKLAD_INVOICE_EMAIL_ALLOWED. Nic se neodeslalo.",
    };
  }
  return { ok: true, to, reasons };
}
