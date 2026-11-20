// Odeslání formuláře „Chci ochutnávku do provozu“ (begina.cz/pro-kavarny):
//   1. nový kontakt v CRM MojeBegina (leads, zdroj „web_kavarny“, bez vlastníka —
//      přiřadí se tomu, kdo zavolá, stejně jako leady z Mety);
//      kdo už v CRM je (shoda telefonu nebo e-mailu), nezakládá se znovu,
//      k jeho kontaktu se jen zapíše poznámka,
//   2. upozornění na info@begina.cz (odpověď jde rovnou zájemci).
// Zájemci žádný e-mail neodchází — potvrzení vidí na stránce.
import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { CAFE_FORM_PLACES, describeCafeInquiry, emailMatchKey, phoneMatchKey, validateCafeInquiry, type CafeField, type CafeFormPlace, type CafeInquiry, type CafeInquiryRaw } from "./cafePage";
import { emailConfig, resolveRecipients, type EmailConfig } from "./email/config";
import { resendTransport, type EmailTransport } from "./email/resend";
import { OPERATOR } from "./operator";

type Db = NeonHttpDatabase<typeof schema>;

export const CAFE_AUTHOR_ID = "system:web-kavarny";
export const CAFE_AUTHOR_NAME = "Web – Pro kavárny a bistra (formulář)";
export const CAFE_LEAD_SOURCE = "web_kavarny";

export type CafeSubmitResult =
  | { ok: true; leadId: string; outcome: "created" | "matched"; notified: boolean }
  | { ok: false; error: string; field?: CafeField };

export type CafeSubmitOptions = {
  baseUrl: string;
  now?: Date;
  config?: EmailConfig | null;
  transport?: EmailTransport;
  /** kde byl formulář vyplněn — určuje zdroj leadu (web_kavarny / web_uvod) */
  place?: CafeFormPlace;
};

function pragueLabel(date: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function submitCafeInquiry(db: Db, raw: CafeInquiryRaw, options: CafeSubmitOptions): Promise<CafeSubmitResult> {
  const validated = validateCafeInquiry(raw);
  if (!validated.ok) return validated;
  const inquiry: CafeInquiry = validated.value;
  const now = options.now ?? new Date();
  const place = options.place ?? "kavarny";
  const leadSource = CAFE_FORM_PLACES[place].leadSource;
  const body = describeCafeInquiry(inquiry, pragueLabel(now), place);
  const meta = JSON.stringify({ source: leadSource, venue: inquiry.venue, city: inquiry.city });

  let leadId: string;
  let outcome: "created" | "matched";
  try {
    const phone = phoneMatchKey(inquiry.phone);
    const email = emailMatchKey(inquiry.email);
    const contacts = (await db.execute(sql`SELECT id, contact_phone, contact_email FROM leads WHERE contact_phone IS NOT NULL OR contact_email IS NOT NULL`)).rows as {
      id: string;
      contact_phone: string | null;
      contact_email: string | null;
    }[];
    const hit = contacts.find((c) => (phone !== null && phoneMatchKey(c.contact_phone) === phone) || (email !== null && emailMatchKey(c.contact_email) === email));
    if (hit) {
      leadId = hit.id;
      outcome = "matched";
      await db.execute(sql`
        INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata)
        VALUES (${leadId}::uuid, ${CAFE_AUTHOR_ID}, ${CAFE_AUTHOR_NAME}, 'note_added', ${body}, ${meta}::jsonb)`);
    } else {
      leadId = randomUUID();
      outcome = "created";
      await db.execute(sql`
        WITH ins AS (
          INSERT INTO leads (id, company_name, contact_name, contact_phone, contact_email, city, source, stage, owner_user_id)
          VALUES (${leadId}::uuid, ${inquiry.venue}, ${inquiry.name}, ${inquiry.phone}, ${inquiry.email}, ${inquiry.city}, ${leadSource}, 'new', NULL)
          RETURNING id
        )
        INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata)
        SELECT id, ${CAFE_AUTHOR_ID}, ${CAFE_AUTHOR_NAME}, 'created', ${body}, ${meta}::jsonb FROM ins`);
    }
  } catch (error) {
    console.error("Pro kavárny: poptávku se nepodařilo uložit", error instanceof Error ? error.message.slice(0, 200) : error);
    return { ok: false, error: `Formulář se teď nepodařilo odeslat. Zkuste to prosím za chvíli znovu, nebo nám napište na ${OPERATOR.email}.` };
  }

  // Upozornění pro Beginu — selhání e-mailu poptávku neztratí (je v CRM).
  let notified = false;
  const config = options.config === undefined ? emailConfig() : options.config;
  if (config) {
    const internal = resolveRecipients(config.internalTo, config);
    const leadUrl = `${options.baseUrl}/rizeni-firmy/obchod/leady/${leadId}`;
    const where = place === "uvod" ? "úvodní stránka" : "stránka Pro kavárny a bistra";
    const intro = outcome === "created" ? `Nový zájemce z webu – ${where}.` : `Zájemce z webu (${where}), který už v CRM je – formulář vyplnil znovu.`;
    const text = `${intro}\n\n${body}\n\nKontakt v MojeBegina: ${leadUrl}\n\nSlíbili jsme odpověď do 2 pracovních dnů.`;
    if (internal.to.length > 0) {
      const key = createHash("sha256").update(`${leadId}|${now.toISOString()}`).digest("hex").slice(0, 40);
      const sent = await (options.transport ?? resendTransport(config.apiKey))(
        {
          from: config.from,
          to: internal.to,
          replyTo: inquiry.email,
          subject: `Zájem o ochutnávku do provozu – ${inquiry.venue}${inquiry.city ? ` (${inquiry.city})` : ""}`,
          text,
          html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`,
        },
        `kavarny-${key}`
      );
      notified = sent.ok;
      if (!sent.ok) console.error("Pro kavárny: upozornění se nepodařilo odeslat", sent.error.slice(0, 200));
    }
  }
  return { ok: true, leadId, outcome, notified };
}
