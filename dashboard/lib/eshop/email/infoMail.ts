// E-MAIL Z INFO@ 1.0 (16. 11. 2026) — obyčejný e-mail zákazníkovi ze
// společné schránky info@begina.cz, který na pokyn Jaroslava nebo Lucie
// odesílá asistent (nástroj send_email_from_info). Čisté funkce: kontrola
// příjemců a sestavení textu s podpisem; samotné odeslání je v nástroji.
import { PARTNER_EMAIL_SIGNATURE } from "../partnerMonthly";

export const MAX_INFO_MAIL_RECIPIENTS = 5;

export const INFO_MAIL_SIGNERS = {
  lucie: ["Lucie Königsbergová", "Begina", "+420 604 168 146", "info@begina.cz", "www.begina.cz"],
  jaroslav: ["Jaroslav Viner", "Begina", "+420 774 199 975", "info@begina.cz", "www.begina.cz"],
  tym: PARTNER_EMAIL_SIGNATURE,
} as const;

export type InfoMailSigner = keyof typeof INFO_MAIL_SIGNERS;

const EMAIL_RE = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[a-z]{2,}$/i;

/** Platné, jedinečné adresy malými písmeny; chyba = text pro uživatele. */
export function checkInfoMailRecipients(raw: unknown): { ok: true; to: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Zadejte aspoň jednoho příjemce (to)." };
  const to: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !EMAIL_RE.test(item.trim())) return { ok: false, error: `Neplatná e-mailová adresa: ${String(item)}` };
    const email = item.trim().toLowerCase();
    if (!to.includes(email)) to.push(email);
  }
  if (to.length > MAX_INFO_MAIL_RECIPIENTS) return { ok: false, error: `Nejvýš ${MAX_INFO_MAIL_RECIPIENTS} příjemců.` };
  return { ok: true, to };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Tělo e-mailu (odstavce oddělené prázdným řádkem) + podpis jako v poště info@. */
export function buildInfoMail(body: string, signer: InfoMailSigner, testNote = ""): { text: string; html: string } {
  const [name, ...contacts] = INFO_MAIL_SIGNERS[signer];
  const clean = body.replace(/\r\n/g, "\n").trim();
  const text = `${clean}\n\nS přátelským pozdravem\n${[name, ...contacts].join("\n")}${testNote ? `\n\n${testNote}` : ""}`;
  const paragraphs = clean
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const html = `${paragraphs}<p><em>S přátelským pozdravem</em><br><strong>${escapeHtml(name)}</strong><br>${contacts.map(escapeHtml).join("<br>")}</p>${testNote ? `<p><small>${escapeHtml(testNote)}</small></p>` : ""}`;
  return { text, html };
}
