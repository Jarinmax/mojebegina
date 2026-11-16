// Import leadů z formuláře Meta — čistá logika bez databáze (testovatelná).
// Meta zapisuje leady do Google tabulky („Bekinka Beginka“, Josef) v podobě
// svého exportu: první řádek hlavička (id, created_time, …, full name, email,
// phone_number, city, lead_status), další řádky jednotlivé leady. Sloupce se
// hledají podle názvu v hlavičce, ne podle pořadí — Meta je při úpravě
// formuláře přeskupuje a přidává otázky.
import type { VenueType } from "./leadValidation";

export type MetaLeadRow = {
  /** Řádek v tabulce (1 = hlavička), jen pro hlášení. */
  rowNumber: number;
  metaLeadId: string;
  submittedAt: Date | null;
  campaignName: string | null;
  formName: string | null;
  platform: string | null;
  venueTypeRaw: string | null;
  venueType: VenueType;
  capacity: string | null;
  fullName: string | null;
  email: string | null;
  /** Zobrazovaný tvar jako u ostatních kontaktů: „+420 725 156 602“. */
  phone: string | null;
  city: string | null;
};

export type MetaSkip = { rowNumber: number; reason: "no_id" | "test_lead" | "no_contact" };

/** Klíč hlavičky: malá písmena bez diakritiky, vše ostatní „_“. */
export function headerKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

/** Meta píše hodnoty s předponou („p:+420…“, „l:318…“, „f:…“) — pro text ji odstraní. */
const stripPrefix = (v: string | null): string | null => (v ? v.replace(/^[a-z]{1,2}:/, "") : null);

/** „p:+420725156602“ / „p:775111265“ / „420773191271“ → „+420 725 156 602“. Jiné tvary beze změny. */
export function formatMetaPhone(raw: string | null): string | null {
  const value = stripPrefix(clean(raw));
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = `420${digits}`;
  if (digits.length === 12 && (digits.startsWith("420") || digits.startsWith("421"))) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return value;
}

/** Porovnávací tvar telefonu: posledních 9 číslic (bez předvolby). */
export function phoneMatchKey(raw: string | null): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

export const emailMatchKey = (raw: string | null): string | null => {
  const t = (raw ?? "").trim().toLowerCase();
  return t.includes("@") ? t : null;
};

/** Volný text z formuláře („kavárna“, „Kavarna“, „bistro bar“…) → typ provozovny v CRM. */
export function mapVenueType(raw: string | null): VenueType {
  const key = headerKey(raw ?? "");
  if (/kavar|kafe|cafe|coffee/.test(key)) return "kavarna";
  if (/bistr/.test(key)) return "bistro";
  if (/restaura|hospod|hospud|hostin|pivnic|pizz/.test(key)) return "restaurace";
  if (/hotel|penzion/.test(key)) return "hotel";
  return "jine";
}

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Testovací lead z nástroje Mety („<test lead: dummy data for …>“) se neimportuje. */
const isTestLead = (values: (string | null)[]) => values.some((v) => v !== null && /test lead|dummy data/i.test(v));

export function parseMetaSheet(values: unknown[][]): { rows: MetaLeadRow[]; skipped: MetaSkip[]; missingColumns: string[] } {
  const [header, ...data] = values;
  const keys = (header ?? []).map((h) => headerKey(String(h ?? "")));
  const col = (...candidates: string[]) => keys.findIndex((k) => candidates.includes(k));
  const colContaining = (part: string) => keys.findIndex((k) => k.includes(part));

  const idx = {
    id: col("id"),
    created: col("created_time"),
    campaign: col("campaign_name"),
    form: col("form_name"),
    platform: col("platform"),
    venue: colContaining("typ_provozovny"),
    capacity: colContaining("kapacita"),
    name: col("full_name", "jmeno", "jmeno_a_prijmeni"),
    email: col("email", "e_mail"),
    phone: col("phone_number", "telefon", "phone"),
    city: col("city", "mesto"),
  };
  const missingColumns = (["id", "name", "email", "phone"] as const).filter((k) => idx[k] < 0);
  if (missingColumns.length > 0) return { rows: [], skipped: [], missingColumns };

  const rows: MetaLeadRow[] = [];
  const skipped: MetaSkip[] = [];
  data.forEach((raw, i) => {
    const rowNumber = i + 2;
    const at = (j: number) => (j >= 0 ? clean(raw[j]) : null);
    if (raw.every((v) => clean(v) === null)) return; // prázdný řádek
    const metaLeadId = at(idx.id);
    if (!metaLeadId) return skipped.push({ rowNumber, reason: "no_id" });
    const cells = raw.map(clean);
    if (isTestLead(cells)) return skipped.push({ rowNumber, reason: "test_lead" });
    const phone = formatMetaPhone(at(idx.phone));
    const email = clean(stripPrefix(at(idx.email)))?.toLowerCase() ?? null;
    if (!phone && !email) return skipped.push({ rowNumber, reason: "no_contact" });
    const venueTypeRaw = at(idx.venue);
    rows.push({
      rowNumber,
      metaLeadId,
      submittedAt: parseDate(at(idx.created)),
      campaignName: at(idx.campaign),
      formName: at(idx.form),
      platform: at(idx.platform),
      venueTypeRaw,
      venueType: mapVenueType(venueTypeRaw),
      capacity: at(idx.capacity),
      fullName: at(idx.name),
      email,
      phone,
      city: at(idx.city),
    });
  });
  return { rows, skipped, missingColumns: [] };
}

export type ExistingContact = { id: string; contactPhone: string | null; contactEmail: string | null };

/** Stávající kontakt se shodným telefonem (posledních 9 číslic) nebo e-mailem. */
export function findExistingLead(row: Pick<MetaLeadRow, "phone" | "email">, existing: readonly ExistingContact[]): string | null {
  const phone = phoneMatchKey(row.phone);
  const email = emailMatchKey(row.email);
  const hit = existing.find(
    (e) => (phone !== null && phoneMatchKey(e.contactPhone) === phone) || (email !== null && emailMatchKey(e.contactEmail) === email)
  );
  return hit?.id ?? null;
}

const PLATFORM_LABEL: Record<string, string> = { fb: "Facebook", ig: "Instagram" };

/** Text do historie kontaktu — co člověk vyplnil a z jaké kampaně. */
export function describeMetaLead(row: MetaLeadRow, submittedLabel: string): string {
  const parts = [
    `Formulář z Mety vyplněn ${submittedLabel}`,
    row.platform ? `(${PLATFORM_LABEL[row.platform] ?? row.platform})` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const details = [
    row.venueTypeRaw ? `provozovna: ${row.venueTypeRaw}` : null,
    row.capacity ? `kapacita: ${row.capacity}` : null,
    row.city ? `město: ${row.city}` : null,
    row.campaignName ? `kampaň: ${row.campaignName}` : null,
    row.formName ? `formulář: ${row.formName}` : null,
  ].filter(Boolean);
  return `${parts}. ${details.join(", ")}.`.replace(/\.\s*\.$/, ".");
}
