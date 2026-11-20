// Upozornění obchodníkovi na přiřazený lead (20. 11. 2026, Lucie): když
// Lucie (nebo kdokoli) přiřadí lead Jarinovi nebo Jardovi Blahoutovi,
// přiřazený dostane e-mail, komu má volat — s kontaktem a odkazem do
// MojeBegina. Skrytá kopie jde na info@begina.cz. Čisté sestavení textu.

export type LeadAssignmentInput = {
  ownerName: string;
  assignedBy: string;
  displayName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  sourceLabel: string | null;
  formNote: string | null;
  leadUrl: string;
  /** Lead z webu/Mety — slíbili jsme ozvat se do 2 pracovních dnů. */
  promisedReply: boolean;
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildLeadAssignmentEmail(input: LeadAssignmentInput): { subject: string; text: string; html: string } {
  const firstName = input.ownerName.split(" ")[0] || input.ownerName;
  const place = input.city ? ` (${input.city})` : "";
  const subject = `Nový lead pro tebe: ${input.displayName}${place} – zavolej`;
  const lines = [
    `Ahoj ${firstName},`,
    "",
    `${input.assignedBy} ti v MojeBegina přiřadil(a) nový lead — prosím zavolej.`,
    "",
    `Provoz: ${input.displayName}`,
    input.contactName && input.contactName !== input.displayName ? `Kontakt: ${input.contactName}` : null,
    input.phone ? `Telefon: ${input.phone}` : null,
    input.email ? `E-mail: ${input.email}` : null,
    input.city ? `Město: ${input.city}` : null,
    input.sourceLabel ? `Odkud: ${input.sourceLabel}` : null,
    input.formNote ? `\n${input.formNote}` : null,
    "",
    input.promisedReply ? "Slíbili jsme, že se ozveme do 2 pracovních dnů." : null,
    `Lead v MojeBegina (tam zapiš hovor a další krok): ${input.leadUrl}`,
  ].filter((line): line is string => line !== null);
  const text = lines.join("\n");
  const html = `<p>${escapeHtml(text).replace(/\n/g, "<br>").replace(escapeHtml(input.leadUrl), `<a href="${escapeHtml(input.leadUrl)}">${escapeHtml(input.leadUrl)}</a>`)}</p>`;
  return { subject, text, html };
}
