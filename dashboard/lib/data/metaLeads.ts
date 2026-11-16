// Import leadů z formuláře Meta (Facebook/Instagram) do CRM — zadání Jaroslava
// Vinera 16. 11. 2026:
//   • Meta zapisuje leady do Google tabulky „Bekinka Beginka“ (Josef);
//     MojeBegina ji několikrát denně přečte (Vercel Cron) a nové leady založí.
//   • Nový kontakt je NEUTRÁLNÍ — bez vlastníka, mezi všemi leady. Přiřadí se
//     tomu, kdo mu zavolá a dovolá se (lib/data/leadClaim.ts), nebo ho přiřadí
//     vedení ručně.
//   • Kdo už v CRM je (shoda telefonu nebo e-mailu), nezakládá se znovu —
//     k jeho kontaktu se jen zapíše, že formulář vyplnil znovu.
//   • Každý lead z Mety (id „l:…“) se zpracuje právě jednou (meta_lead_imports,
//     primární klíč) — i při souběhu cronu a ručního načtení.
import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { DateTime } from "luxon";
import type * as schema from "@/lib/db/schema";
import { leads, metaLeadImports } from "@/lib/db/schema";
import { readSheetValues, serviceAccountKey } from "./googleSheetsRead";
import { describeMetaLead, findExistingLead, parseMetaSheet, type ExistingContact, type MetaSkip } from "./metaLeadsValidation";

type Db = NeonHttpDatabase<typeof schema>;

/** Tabulka „Bekinka Beginka“ (vlastník Josef, nasdílená 16. 11. 2026). Lze přepsat proměnnou META_LEADS_SHEET_ID. */
export const DEFAULT_META_LEADS_SHEET_ID = "1i2qTO1w7Ai_SNUr6KfQQ2M4ixZJ-if-OEzrKtFSktao";
export const META_AUTHOR_ID = "system:meta-leady";
export const META_AUTHOR_NAME = "Formulář Meta (automatický import)";

export type MetaImportResult =
  | { status: "not_configured" }
  | { status: "error"; error: string }
  | {
      status: "ok";
      rowsRead: number;
      created: { leadId: string; name: string | null }[];
      matched: { leadId: string; name: string | null }[];
      alreadyImported: number;
      skipped: MetaSkip[];
    };

const label = (d: Date | null) => (d ? DateTime.fromJSDate(d, { zone: "Europe/Prague" }).toFormat("d. M. yyyy 'v' H:mm") : "(čas neuveden)");

/** Zpracuje hodnoty tabulky (oddělené od čtení z Googlu kvůli testům). */
export async function importMetaLeadValues(db: Db, values: unknown[][]): Promise<MetaImportResult> {
  const { rows, skipped, missingColumns } = parseMetaSheet(values);
  if (missingColumns.length > 0) {
    return { status: "error", error: `V hlavičce tabulky chybí sloupce: ${missingColumns.join(", ")}.` };
  }

  const done = new Set((await db.select({ id: metaLeadImports.metaLeadId }).from(metaLeadImports)).map((r) => r.id));
  const existing: ExistingContact[] = await db
    .select({ id: leads.id, contactPhone: leads.contactPhone, contactEmail: leads.contactEmail })
    .from(leads);

  const created: { leadId: string; name: string | null }[] = [];
  const matched: { leadId: string; name: string | null }[] = [];
  let alreadyImported = 0;

  for (const row of rows) {
    if (done.has(row.metaLeadId)) {
      alreadyImported++;
      continue;
    }
    const existingId = findExistingLead(row, existing);
    const meta = sql`jsonb_build_object('metaLeadId', ${row.metaLeadId}::text, 'source', 'meta', 'campaign', ${row.campaignName}::text, 'form', ${row.formName}::text)`;

    if (existingId) {
      const body = `Znovu se ozval/a přes formulář z Mety. ${describeMetaLead(row, label(row.submittedAt))}`;
      const res = await db.execute<{ lead_id: string }>(sql`
        WITH claim AS (
          INSERT INTO meta_lead_imports (meta_lead_id, lead_id, outcome, submitted_at, campaign_name, form_name)
          VALUES (${row.metaLeadId}, ${existingId}::uuid, 'matched', ${row.submittedAt}, ${row.campaignName}, ${row.formName})
          ON CONFLICT (meta_lead_id) DO NOTHING
          RETURNING lead_id
        )
        INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata)
        SELECT lead_id, ${META_AUTHOR_ID}, ${META_AUTHOR_NAME}, 'note_added', ${body}, ${meta} FROM claim
        RETURNING lead_id`);
      if (res.rows.length > 0) matched.push({ leadId: existingId, name: row.fullName });
      else alreadyImported++;
      continue;
    }

    const leadId = randomUUID();
    const body = describeMetaLead(row, label(row.submittedAt));
    const res = await db.execute<{ lead_id: string }>(sql`
      WITH claim AS (
        INSERT INTO meta_lead_imports (meta_lead_id, lead_id, outcome, submitted_at, campaign_name, form_name)
        VALUES (${row.metaLeadId}, ${leadId}::uuid, 'created', ${row.submittedAt}, ${row.campaignName}, ${row.formName})
        ON CONFLICT (meta_lead_id) DO NOTHING
        RETURNING lead_id
      ), ins AS (
        INSERT INTO leads (id, contact_name, contact_phone, contact_email, city, venue_type, source, stage, owner_user_id)
        SELECT lead_id, ${row.fullName}, ${row.phone}, ${row.email}, ${row.city}, ${row.venueType}, 'meta', 'new', NULL FROM claim
        RETURNING id
      )
      INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata)
      SELECT id, ${META_AUTHOR_ID}, ${META_AUTHOR_NAME}, 'created', ${body}, ${meta} FROM ins
      RETURNING lead_id`);
    if (res.rows.length > 0) {
      created.push({ leadId, name: row.fullName });
      // Stejný člověk dvakrát v jedné dávce → podruhé už jen poznámka.
      existing.push({ id: leadId, contactPhone: row.phone, contactEmail: row.email });
    } else {
      alreadyImported++;
    }
  }

  return { status: "ok", rowsRead: rows.length + skipped.length, created, matched, alreadyImported, skipped };
}

/** Přečte tabulku z Googlu a naimportuje nové leady. Bez klíče servisního účtu = „nenastaveno“. */
export async function importMetaLeads(db: Db, env: NodeJS.ProcessEnv = process.env): Promise<MetaImportResult> {
  let key;
  try {
    key = serviceAccountKey();
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : "Neplatný klíč servisního účtu." };
  }
  if (!key) return { status: "not_configured" };
  const sheetId = env.META_LEADS_SHEET_ID?.trim() || DEFAULT_META_LEADS_SHEET_ID;
  try {
    const values = await readSheetValues(key, sheetId, "A:Z");
    return await importMetaLeadValues(db, values);
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : "Import selhal." };
  }
}
