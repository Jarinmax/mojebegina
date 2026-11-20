import "server-only";

// Ochutnávka do provozu — serverová část (viz cafeTasting.ts):
//   - viditelnost (před spuštěním jen náhled s cookie),
//   - kontrola „jedna ochutnávka na jedno IČO“ (nestornované objednávky s balením ochutnávky),
//   - po uložení objednávky lead v MojeBegina (zdroj web_ochutnavka) navázaný na
//     objednávku a upozornění na info@begina.cz.
import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { CAFE_TASTING_LAUNCHED, CAFE_TASTING_LEAD_SOURCE, CAFE_TASTING_PREVIEW_COOKIE, CAFE_TASTING_PREVIEW_VALUE, CAFE_TASTING_SKU_PREFIX, isCafeTastingSku } from "./cafeTasting";
import { emailMatchKey, phoneMatchKey } from "./cafePage";
import { emailConfig, resolveRecipients, type EmailConfig } from "./email/config";
import { resendTransport, type EmailTransport } from "./email/resend";

type Db = NeonHttpDatabase<typeof schema>;

export const TASTING_AUTHOR_ID = "system:web-ochutnavka";
export const TASTING_AUTHOR_NAME = "Web – ochutnávka do provozu (objednávka)";

/** Je ochutnávka vidět? Po spuštění všem, před ním jen náhledu s cookie. */
export async function cafeTastingVisible(): Promise<boolean> {
  if (CAFE_TASTING_LAUNCHED) return true;
  try {
    return (await cookies()).get(CAFE_TASTING_PREVIEW_COOKIE)?.value === CAFE_TASTING_PREVIEW_VALUE;
  } catch {
    return false;
  }
}

/** Objednal už provoz s tímto IČO ochutnávku? null = nepodařilo se zjistit. */
export async function cafeTastingOrdered(db: Db, ico: string): Promise<boolean | null> {
  try {
    const result = await db.execute(sql`
      SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
      WHERE o.billing_ico = ${ico}
        AND o.fulfillment_status <> 'cancelled'
        AND oi.sku_snapshot LIKE ${`${CAFE_TASTING_SKU_PREFIX}%`}
      LIMIT 1`);
    return (result.rows?.length ?? 0) > 0;
  } catch (error) {
    console.error("Ochutnávka do provozu: kontrolu IČO se nepodařilo provést", String(error).slice(0, 200));
    return null;
  }
}

export type TastingOrderInfo = {
  orderId: string;
  orderNumber: number | null;
  venue: string;
  company: string;
  ico: string;
  name: string;
  email: string;
  phone: string;
  city: string | null;
  items: { sku: string; name: string }[];
  shippingLabel: string;
  totalKc: number;
};

function pragueLabel(date: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function describeTastingOrder(info: TastingOrderInfo, submittedLabel: string): string {
  const items = info.items.filter((item) => isCafeTastingSku(item.sku)).map((item) => `- ${item.name}`);
  return [
    `Objednávka ochutnávky do provozu${info.orderNumber ? ` č. ${info.orderNumber}` : ""} z webu begina.cz, ${submittedLabel}.`,
    `Provoz: ${info.venue || info.company}`,
    `Firma: ${info.company}, IČO ${info.ico}`,
    `Jméno: ${info.name}`,
    `Telefon: ${info.phone}`,
    `E-mail: ${info.email}`,
    info.city ? `Město: ${info.city}` : null,
    `Doprava: ${info.shippingLabel}`,
    `Celkem: ${info.totalKc} Kč`,
    "Vybrané položky:",
    ...items,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Lead k objednávce ochutnávky. Kdo už v CRM je (shoda telefonu nebo e-mailu),
 * nezakládá se znovu — zapíše se mu poznámka. Objednávka dostane odkaz na lead
 * (orders.source_lead_id). Selhání nikdy neshodí objednávku (je už uložená).
 */
export async function recordCafeTastingLead(
  db: Db,
  info: TastingOrderInfo,
  options: { baseUrl: string; now?: Date; config?: EmailConfig | null; transport?: EmailTransport }
): Promise<{ leadId: string | null; notified: boolean }> {
  const now = options.now ?? new Date();
  const body = describeTastingOrder(info, pragueLabel(now));
  const meta = JSON.stringify({ source: CAFE_TASTING_LEAD_SOURCE, orderId: info.orderId, ico: info.ico, venue: info.venue });
  let leadId: string | null = null;
  let created = false;
  try {
    const phone = phoneMatchKey(info.phone);
    const email = emailMatchKey(info.email);
    const contacts = (await db.execute(sql`SELECT id, contact_phone, contact_email FROM leads WHERE contact_phone IS NOT NULL OR contact_email IS NOT NULL`)).rows as {
      id: string;
      contact_phone: string | null;
      contact_email: string | null;
    }[];
    const hit = contacts.find((c) => (phone !== null && phoneMatchKey(c.contact_phone) === phone) || (email !== null && emailMatchKey(c.contact_email) === email));
    if (hit) {
      leadId = hit.id;
      await db.execute(sql`
        INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata)
        VALUES (${leadId}::uuid, ${TASTING_AUTHOR_ID}, ${TASTING_AUTHOR_NAME}, 'note_added', ${body}, ${meta}::jsonb)`);
    } else {
      leadId = randomUUID();
      created = true;
      await db.execute(sql`
        WITH ins AS (
          INSERT INTO leads (id, company_name, contact_name, contact_phone, contact_email, city, source, stage, owner_user_id)
          VALUES (${leadId}::uuid, ${info.venue || info.company}, ${info.name}, ${info.phone}, ${info.email}, ${info.city}, ${CAFE_TASTING_LEAD_SOURCE}, 'new', NULL)
          RETURNING id
        )
        INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata)
        SELECT id, ${TASTING_AUTHOR_ID}, ${TASTING_AUTHOR_NAME}, 'created', ${body}, ${meta}::jsonb FROM ins`);
    }
    await db.execute(sql`UPDATE orders SET source_lead_id = ${leadId}::uuid WHERE id = ${info.orderId}::uuid AND source_lead_id IS NULL`);
  } catch (error) {
    console.error("Ochutnávka do provozu: lead se nepodařilo uložit", error instanceof Error ? error.message.slice(0, 200) : error);
  }

  let notified = false;
  const config = options.config === undefined ? emailConfig() : options.config;
  if (config) {
    const internal = resolveRecipients(config.internalTo, config);
    const leadLine = leadId ? `\n\nKontakt v MojeBegina: ${options.baseUrl}/rizeni-firmy/obchod/leady/${leadId}${created ? " (nový lead)" : " (kontakt už v CRM byl)"}` : "\n\nLead se nepodařilo uložit – zapište ho prosím ručně.";
    const text = `Nová objednávka ochutnávky do provozu.\n\n${body}${leadLine}`;
    if (internal.to.length > 0) {
      const key = createHash("sha256").update(`${info.orderId}|ochutnavka`).digest("hex").slice(0, 40);
      const sent = await (options.transport ?? resendTransport(config.apiKey))(
        {
          from: config.from,
          to: internal.to,
          replyTo: info.email,
          subject: `Ochutnávka do provozu – ${info.venue || info.company}${info.city ? ` (${info.city})` : ""}`,
          text,
          html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`,
        },
        `ochutnavka-${key}`
      );
      notified = sent.ok;
      if (!sent.ok) console.error("Ochutnávka do provozu: upozornění se nepodařilo odeslat", sent.error.slice(0, 200));
    }
  }
  return { leadId, notified };
}
