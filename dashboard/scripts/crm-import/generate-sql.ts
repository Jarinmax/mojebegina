// Security Phase 16.1 (Obchod/CRM 1.0) — jednorázový importer historických
// leadů z Google Sheets (Begina_CRM_import_priprava.xlsx, list
// CRM_IMPORT_PREP). NEBĚŽÍ proti DB přímo (tenhle sandbox nemá zápisový
// přístup k Neon) — generuje SQL soubor, který se pak spustí ručně v Neon
// Console SQL Editoru na Preview branchi, stejným postupem jako migrace.
//
// Spuštění:
//   npx tsx scripts/crm-import/generate-sql.ts <cesta-k-xlsx>
//
// Výstup:
//   scripts/crm-import/out/crm-import-<datum>.sql   — SQL k vložení do Console
//   scripts/crm-import/out/crm-import-<datum>.json  — report (counts, odmítnuté řádky)
//
// Bezpečnostní/idempotenční model (schváleno explicitně):
//   1. Každý INSERT do `leads` je obalený WHERE NOT EXISTS — pokud už v DB
//      existuje lead se stejným normalizovaným e-mailem NEBO stejným
//      normalizovaným telefonem (mezi source='existing_database' leady),
//      řádek se PŘESKOČÍ (žádná duplicita při druhém spuštění stejného
//      importu).
//   2. Navazující INSERT do `lead_activity` je obalený WHERE EXISTS na
//      právě vložené id — pokud lead insert přeskočil, aktivita se taky
//      nevloží (žádné osiřelé aktivity).
//   3. Generovaný SQL soubor navíc na začátku obsahuje kontrolní SELECT,
//      který spočítá, kolik řádků z TOHOTO importu (podle
//      metadata->>'importBatch') už v DB je — spustit PRVNÍ, než se pustí
//      zbytek souboru.
//
// Dedup uvnitř souboru (Lucy už udělala ruční dedup na 222 unikátních
// kontaktů) — tady se navíc jen KONTROLUJE, jestli náhodou nezůstala
// zbytková shoda podle normalizovaného e-mailu/telefonu, a hlásí se jako
// varování v reportu. Nic se automaticky nezahazuje (schváleno: "ostatní
// podobnosti pouze upozornění, nikoli automatické sloučení").
//
// companyName smí být prázdné (Security Phase 16.1 — schema.ts). Řádek se
// odmítne JEN pokud nemá vůbec žádný identifikátor (companyName,
// contactName, e-mail i telefon všechno prázdné) — to samé pravidlo jako
// validateCreateLeadInput.

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { resolve } from "path";
import * as XLSX from "xlsx";
import { LEAD_STAGES, type LeadStage, type VenueType } from "../../lib/data/leadValidation";

const SHEET_NAME = "CRM_IMPORT_PREP";
// Jaroslav Blahout — ověřeno read-only proti Production DB (user_roles,
// EXECUTIVE). Schváleno explicitně jako ownerUserId pro celý import.
const OWNER_USER_ID = "06240ac4-c050-47ea-998c-6c81389edf9f";
const OWNER_NAME = "Jaroslav Blahout";
const IMPORT_BATCH = "gsheet-2026-09-25";
const SOURCE = "existing_database";

type SourceRow = {
  companyName?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  city?: string;
  venueTypeRaw?: string;
  ico?: string;
  source?: string;
  stageSuggested?: string;
  owner?: string;
  acquiredBy?: string;
  nextFollowUpAt?: string | number | Date;
  nextStepNote?: string;
  originalNotes?: string;
  originalPurchaseInfo?: string;
  originalPlatform?: string;
  sourceRows?: string;
  reviewFlags?: string;
};

type PreparedLead = {
  id: string;
  companyName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  city: string | null;
  venueType: VenueType | null;
  ico: string | null;
  stage: LeadStage;
  nextFollowUpAt: Date | null;
  nextStepNote: string | null;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
  activityBody: string | null;
  activityMetadata: Record<string, unknown>;
  rowNumber: number;
};

type Rejected = { rowNumber: number; reason: string; raw: SourceRow };

function s(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeEmail(email: string | null): string | null {
  return email ? email.trim().toLowerCase() : null;
}

// Konzervativní normalizace pro české telefony: ponechá jen číslice, a
// pokud výsledek začíná předvolbou 420 a má 12 číslic, předvolbu odstraní
// — "+420 111 222 333" i "111222333" tak vyjdou na stejný klíč.
function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("420")) {
    return digits.slice(3);
  }
  return digits === "" ? null : digits;
}

const VENUE_TYPE_MAP: Record<string, VenueType> = {
  "kavárna": "kavarna",
  "kavarna": "kavarna",
  "bistro": "bistro",
  "restaurace": "restaurace",
  "hotel": "hotel",
};

function mapVenueType(raw: string | null): { value: VenueType | null; unmapped: string | null } {
  if (!raw) return { value: null, unmapped: null };
  const key = raw.trim().toLowerCase();
  const mapped = VENUE_TYPE_MAP[key];
  if (mapped) return { value: mapped, unmapped: null };
  // Neznámá hodnota (např. "Kancelář") → "jine", ale zaznamená se do
  // reportu, ať je vidět, kolik a jakých surových hodnot se takhle smáplo.
  return { value: "jine", unmapped: raw };
}

function parseFollowUpDate(raw: string | number | Date | undefined): Date | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (raw instanceof Date) {
    return new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate(), 12, 0, 0));
  }
  const str = String(raw).trim();
  if (str === "") return null;
  // Český formát DD.MM.RRRR
  const czMatch = str.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (czMatch) {
    const [, d, m, y] = czMatch;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12, 0, 0));
  }
  // ISO RRRR-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12, 0, 0));
  }
  return null;
}

function sqlString(value: string | null): string {
  if (value === null) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlDate(value: Date | null): string {
  if (value === null) return "NULL";
  return `'${value.toISOString()}'`;
}

function sqlJsonb(value: Record<string, unknown>): string {
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Použití: npx tsx scripts/crm-import/generate-sql.ts <cesta-k-Begina_CRM_import_priprava.xlsx>");
    process.exit(1);
  }

  const workbook = XLSX.read(readFileSync(resolve(inputPath)), { cellDates: true });
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    console.error(`List "${SHEET_NAME}" nebyl v souboru nalezen. Dostupné listy: ${workbook.SheetNames.join(", ")}`);
    process.exit(1);
  }

  const rows: SourceRow[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const prepared: PreparedLead[] = [];
  const rejected: Rejected[] = [];
  const unmappedVenueTypes = new Map<string, number>();
  const stageCounts: Record<string, number> = {};
  const existingCustomerFlags: PreparedLead[] = [];
  const withinFileDuplicateWarnings: string[] = [];

  const seenEmails = new Map<string, number>();
  const seenPhones = new Map<string, number>();

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2; // +2: 1-indexed + header row

    const companyName = s(raw.companyName);
    const contactName = s(raw.contactName);
    const contactPhone = s(raw.contactPhone);
    const contactEmail = s(raw.contactEmail);

    if (!companyName && !contactName && !contactPhone && !contactEmail) {
      rejected.push({ rowNumber, reason: "Žádný identifikátor (firma/jméno/telefon/e-mail) — přeskočeno.", raw });
      return;
    }

    const rawStage = s(raw.stageSuggested);
    const stage = rawStage && (LEAD_STAGES as readonly string[]).includes(rawStage) ? (rawStage as LeadStage) : null;
    if (!stage) {
      rejected.push({ rowNumber, reason: `Neplatný/chybějící stageSuggested: "${rawStage}"`, raw });
      return;
    }

    const { value: venueType, unmapped } = mapVenueType(s(raw.venueTypeRaw));
    if (unmapped) {
      unmappedVenueTypes.set(unmapped, (unmappedVenueTypes.get(unmapped) ?? 0) + 1);
    }

    const normalizedEmail = normalizeEmail(contactEmail);
    const normalizedPhone = normalizePhone(contactPhone);

    if (normalizedEmail && seenEmails.has(normalizedEmail)) {
      withinFileDuplicateWarnings.push(
        `Řádek ${rowNumber}: e-mail "${contactEmail}" se shoduje s řádkem ${seenEmails.get(normalizedEmail)} (ponecháno, jen varování).`
      );
    } else if (normalizedEmail) {
      seenEmails.set(normalizedEmail, rowNumber);
    }
    if (normalizedPhone && seenPhones.has(normalizedPhone)) {
      withinFileDuplicateWarnings.push(
        `Řádek ${rowNumber}: telefon "${contactPhone}" se shoduje s řádkem ${seenPhones.get(normalizedPhone)} (ponecháno, jen varování).`
      );
    } else if (normalizedPhone) {
      seenPhones.set(normalizedPhone, rowNumber);
    }

    const reviewFlags = s(raw.reviewFlags);
    const isPossibleExistingCustomer = Boolean(reviewFlags && reviewFlags.includes("MOZNY_EXISTUJICI_ZAKAZNIK"));

    let nextStepNote = s(raw.nextStepNote);
    if (isPossibleExistingCustomer) {
      const flag = "⚠ Možný existující zákazník — zkontroluj před hovorem.";
      nextStepNote = nextStepNote ? `${flag} ${nextStepNote}` : flag;
    }

    const lead: PreparedLead = {
      id: randomUUID(),
      companyName,
      contactName,
      contactPhone,
      contactEmail,
      city: s(raw.city),
      venueType,
      ico: s(raw.ico),
      stage,
      nextFollowUpAt: parseFollowUpDate(raw.nextFollowUpAt),
      nextStepNote,
      normalizedEmail,
      normalizedPhone,
      activityBody: s(raw.originalNotes),
      activityMetadata: {
        importBatch: IMPORT_BATCH,
        sourceRows: s(raw.sourceRows),
        originalPurchaseInfo: s(raw.originalPurchaseInfo),
        originalPlatform: s(raw.originalPlatform),
        reviewFlags,
        originalOwnerRaw: s(raw.owner),
        originalAcquiredByRaw: s(raw.acquiredBy),
      },
      rowNumber,
    };

    prepared.push(lead);
    stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;
    if (isPossibleExistingCustomer) {
      existingCustomerFlags.push(lead);
    }
  });

  // --- SQL generování ------------------------------------------------------
  const sqlParts: string[] = [];
  sqlParts.push(`-- CRM import: ${IMPORT_BATCH} — vygenerováno scripts/crm-import/generate-sql.ts`);
  sqlParts.push(`-- PŘED spuštěním zbytku souboru spusť tenhle kontrolní dotaz:`);
  sqlParts.push(
    `--   SELECT count(*) FROM lead_activity WHERE metadata->>'importBatch' = '${IMPORT_BATCH}';`
  );
  sqlParts.push(`-- Pokud vrátí > 0, import už proběhl — NESPOUŠTĚJ znovu.\n`);

  for (const lead of prepared) {
    const activityId = randomUUID();

    sqlParts.push(
      [
        `INSERT INTO "leads" (`,
        `  "id", "company_name", "contact_name", "contact_phone", "contact_email",`,
        `  "city", "venue_type", "ico", "source", "stage", "owner_user_id", "acquired_by_user_id",`,
        `  "next_follow_up_at", "next_step_note", "created_at", "updated_at"`,
        `)`,
        `SELECT`,
        `  ${sqlString(lead.id)}, ${sqlString(lead.companyName)}, ${sqlString(lead.contactName)}, ${sqlString(lead.contactPhone)}, ${sqlString(lead.contactEmail)},`,
        `  ${sqlString(lead.city)}, ${sqlString(lead.venueType)}, ${sqlString(lead.ico)}, ${sqlString(SOURCE)}, ${sqlString(lead.stage)}, ${sqlString(OWNER_USER_ID)}, NULL,`,
        `  ${sqlDate(lead.nextFollowUpAt)}, ${sqlString(lead.nextStepNote)}, now(), now()`,
        `WHERE NOT EXISTS (`,
        `  SELECT 1 FROM "leads"`,
        `  WHERE "source" = ${sqlString(SOURCE)} AND (`,
        lead.normalizedEmail
          ? `    lower(trim("contact_email")) = ${sqlString(lead.normalizedEmail)}`
          : `    FALSE`,
        lead.normalizedPhone
          ? `    OR regexp_replace("contact_phone", '[^0-9]', '', 'g') = ${sqlString(lead.normalizedPhone)}`
          : ``,
        `  )`,
        `);`,
      ]
        .filter((l) => l !== "")
        .join("\n")
    );

    sqlParts.push(
      [
        `INSERT INTO "lead_activity" ("id", "lead_id", "author_user_id", "author_name", "kind", "body", "metadata", "created_at")`,
        `SELECT ${sqlString(activityId)}, ${sqlString(lead.id)}, ${sqlString(OWNER_USER_ID)}, ${sqlString(OWNER_NAME)}, 'created', ${sqlString(lead.activityBody)}, ${sqlJsonb(lead.activityMetadata)}, now()`,
        `WHERE EXISTS (SELECT 1 FROM "leads" WHERE "id" = ${sqlString(lead.id)});`,
      ].join("\n")
    );
    sqlParts.push("");
  }

  const outDir = resolve(__dirname, "out");
  mkdirSync(outDir, { recursive: true });
  const dateTag = new Date().toISOString().slice(0, 10);
  const sqlPath = resolve(outDir, `crm-import-${dateTag}.sql`);
  const reportPath = resolve(outDir, `crm-import-${dateTag}.json`);

  writeFileSync(sqlPath, sqlParts.join("\n"), "utf-8");

  const report = {
    importBatch: IMPORT_BATCH,
    sourceFile: inputPath,
    totalSourceRows: rows.length,
    preparedLeads: prepared.length,
    rejectedRows: rejected.length,
    stageCounts,
    unmappedVenueTypes: Object.fromEntries(unmappedVenueTypes),
    possibleExistingCustomerCount: existingCustomerFlags.length,
    possibleExistingCustomerRows: existingCustomerFlags.map((l) => l.rowNumber),
    withinFileDuplicateWarnings,
    rejected: rejected.map((r) => ({ rowNumber: r.rowNumber, reason: r.reason })),
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  console.log(`Zdrojových řádků: ${rows.length}`);
  console.log(`Připraveno k importu: ${prepared.length}`);
  console.log(`Odmítnuto: ${rejected.length}`);
  console.log(`Rozdělení podle stage:`, stageCounts);
  console.log(`Možný existující zákazník (nekonvertuje se automaticky): ${existingCustomerFlags.length}`);
  if (withinFileDuplicateWarnings.length > 0) {
    console.log(`Zbytková varování (normalizovaný e-mail/telefon shoda uvnitř souboru): ${withinFileDuplicateWarnings.length}`);
  }
  if (Object.keys(Object.fromEntries(unmappedVenueTypes)).length > 0) {
    console.log(`Nezmapované typy provozu (→ "jine"):`, Object.fromEntries(unmappedVenueTypes));
  }
  console.log(`\nSQL: ${sqlPath}`);
  console.log(`Report: ${reportPath}`);
}

main();
