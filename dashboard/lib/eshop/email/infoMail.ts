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

// PŘÍLOHY (Lucie 21. 11. 2026): z info@ musí jít poslat i fotky, PDF apod.
export const MAX_INFO_MAIL_ATTACHMENTS = 10;
export const MAX_INFO_MAIL_ATTACHMENT_BYTES = 15 * 1024 * 1024; // celkem (Resend bere až 40 MB)
const ALLOWED_ATTACHMENT_TYPES = /^(application\/pdf|image\/(png|jpe?g|webp|gif|heic)|text\/(plain|csv)|application\/(vnd\.openxmlformats-officedocument\.[a-z.]+|msword|vnd\.ms-excel|zip))$/i;

export type InfoMailAttachment = { filename: string; contentBase64: string; contentType: string; bytes: number };

/** Kontrola příloh z argumentu attachments; chyba = text pro uživatele. */
export function checkInfoMailAttachments(raw: unknown): { ok: true; attachments: InfoMailAttachment[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, attachments: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Argument attachments musí být seznam příloh." };
  if (raw.length > MAX_INFO_MAIL_ATTACHMENTS) return { ok: false, error: `Nejvýš ${MAX_INFO_MAIL_ATTACHMENTS} příloh.` };
  const attachments: InfoMailAttachment[] = [];
  let total = 0;
  for (const item of raw) {
    const a = (item ?? {}) as Record<string, unknown>;
    const filename = typeof a.filename === "string" ? a.filename.trim() : "";
    if (!filename || filename.length > 200 || /[\\/\r\n]/.test(filename)) return { ok: false, error: "Každá příloha potřebuje platný název souboru (filename)." };
    const contentType = typeof a.mime_type === "string" ? a.mime_type.trim().toLowerCase() : "";
    if (!ALLOWED_ATTACHMENT_TYPES.test(contentType)) return { ok: false, error: `Typ přílohy ${filename} (${contentType || "neuveden"}) nejde poslat — povolené jsou PDF, obrázky, dokumenty Office, CSV/TXT a ZIP.` };
    const content = typeof a.content_base64 === "string" ? a.content_base64.replace(/\s+/g, "") : "";
    if (!content || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) return { ok: false, error: `Příloha ${filename}: obsah musí být v base64 (content_base64).` };
    const bytes = Math.floor((content.length * 3) / 4) - (content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0);
    total += bytes;
    if (total > MAX_INFO_MAIL_ATTACHMENT_BYTES) return { ok: false, error: "Přílohy jsou dohromady větší než 15 MB." };
    attachments.push({ filename, contentBase64: content, contentType, bytes });
  }
  return { ok: true, attachments };
}
