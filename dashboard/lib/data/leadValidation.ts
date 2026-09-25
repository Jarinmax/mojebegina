// Security Phase 16 (Obchod/CRM 1.0) — čistá validace, bez "server-only",
// stejný princip jako orderValidation.ts: testovatelná bez databáze,
// kontrola a dotaz se skládají až v leads.ts.

export const LEAD_STAGES = [
  "new",
  "contacted",
  "interested",
  "sample_offer",
  "negotiating",
  "converted",
  "callback_later",
  "not_interested",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_SOURCES = [
  "existing_database",
  "bistro",
  "eshop",
  "akce",
  "doporuceni",
  "inbound",
  "vlastni_akvizice",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const VENUE_TYPES = ["kavarna", "bistro", "restaurace", "hotel", "jine"] as const;
export type VenueType = (typeof VENUE_TYPES)[number];

// Security Phase 16.1 — companyName je nullable (viz schema.ts), takže lead
// potřebuje jednotné pravidlo, jak se identifikuje v UI, dokud Jarda
// nezjistí a nedoplní skutečný název firmy/provozovny. Priorita schválená
// explicitně: companyName → contactName → e-mail → telefon.
export function leadDisplayName(input: {
  companyName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}): string {
  return input.companyName ?? input.contactName ?? input.contactEmail ?? input.contactPhone ?? "Neznámý kontakt";
}

// Aktivní fáze pipeline — pro dlaždice kokpitu (Rozjednané, K vyřízení…).
// "converted" (proběhlá konverze) a vedlejší stavy (callback_later,
// not_interested) do "aktivní pipeline" nepatří — konvertovaný lead žije
// dál přes organizations/orders, ne skrz leads.stage.
export const ACTIVE_LEAD_STAGES: LeadStage[] = [
  "new",
  "contacted",
  "interested",
  "sample_offer",
  "negotiating",
  "callback_later",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export type CreateLeadInput = {
  companyName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  city: string;
  address: string;
  venueType: string;
  ico: string;
  source: string;
};

export type ValidatedCreateLeadInput = {
  companyName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  city: string | null;
  address: string | null;
  venueType: VenueType | null;
  ico: string | null;
  source: LeadSource;
};

// Security Phase 16.1 — companyName už není povinný (viz schema.ts komentář
// u `leads`): reálná historická data ho většinou nemají. Vynucuje se jen,
// aby lead měl ALESPOŇ JEDEN identifikující údaj — jinak by šlo založit
// úplně prázdný, nedohledatelný záznam. Priorita zobrazení pak řeší
// leadLabels.ts:leadDisplayName.
export function validateCreateLeadInput(
  input: CreateLeadInput
): { ok: true; value: ValidatedCreateLeadInput } | { ok: false; error: string } {
  const companyName = trimOrNull(input.companyName);
  const contactName = trimOrNull(input.contactName);
  const contactPhone = trimOrNull(input.contactPhone);

  const contactEmail = trimOrNull(input.contactEmail);
  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    return { ok: false, error: "Zadejte platný e-mail, nebo pole nechte prázdné." };
  }

  if (!companyName && !contactName && !contactPhone && !contactEmail) {
    return {
      ok: false,
      error: "Vyplňte alespoň jeden identifikující údaj (firma, kontaktní osoba, telefon nebo e-mail).",
    };
  }

  const venueTypeRaw = trimOrNull(input.venueType);
  if (venueTypeRaw && !VENUE_TYPES.includes(venueTypeRaw as VenueType)) {
    return { ok: false, error: "Neplatný typ provozu." };
  }

  const source = input.source.trim();
  if (!LEAD_SOURCES.includes(source as LeadSource)) {
    return { ok: false, error: "Neplatný zdroj leadu." };
  }

  const icoRaw = trimOrNull(input.ico);
  if (icoRaw && !/^\d{1,8}$/.test(icoRaw)) {
    return { ok: false, error: "IČO smí obsahovat jen číslice (max. 8 znaků)." };
  }

  return {
    ok: true,
    value: {
      companyName,
      contactName,
      contactPhone,
      contactEmail,
      city: trimOrNull(input.city),
      address: trimOrNull(input.address),
      venueType: (venueTypeRaw as VenueType) ?? null,
      ico: icoRaw,
      source: source as LeadSource,
    },
  };
}

// Security Phase 16.1 — doplnění názvu firmy/provozovny poté, co ho Jarda
// zjistí při hovoru (viz schema.ts komentář). Na rozdíl od
// validateCreateLeadInput tady prázdná hodnota znamená "zase to smaž zpátky
// na neznámé" — povolené, žádná ochrana proti smazání jediného
// identifikátoru (lead má pořád contactName/telefon/e-mail, jinak by
// nemohl vůbec vzniknout).
export function validateCompanyNameInput(
  raw: string
): { ok: true; value: string | null } | { ok: false; error: string } {
  const value = raw.trim();
  if (value.length > 200) {
    return { ok: false, error: "Název je příliš dlouhý (max. 200 znaků)." };
  }
  return { ok: true, value: value === "" ? null : value };
}

export function validateStageInput(
  rawStage: string
): { ok: true; value: LeadStage } | { ok: false; error: string } {
  const stage = rawStage.trim();
  if (!LEAD_STAGES.includes(stage as LeadStage)) {
    return { ok: false, error: "Neplatný obchodní stav." };
  }
  return { ok: true, value: stage as LeadStage };
}

export type CallLogInput = {
  note: string;
  nextStage: string;
  nextFollowUpAt: string;
  nextStepNote: string;
};

export type ValidatedCallLogInput = {
  note: string | null;
  nextStage: LeadStage | null;
  nextFollowUpAt: Date | null;
  nextStepNote: string | null;
};

// Rychlý zápis výsledku hovoru — jediný formulář, co Jarda vyplní po
// telefonátu. Všechna pole jsou nepovinná (může jen posunout fázi bez
// poznámky, nebo jen napsat poznámku beze změny fáze), aby zápis šel
// opravdu za pár vteřin.
export function validateCallLogInput(
  input: CallLogInput
): { ok: true; value: ValidatedCallLogInput } | { ok: false; error: string } {
  const note = trimOrNull(input.note);
  if (note && note.length > 2000) {
    return { ok: false, error: "Poznámka je příliš dlouhá (max. 2000 znaků)." };
  }

  const nextStageRaw = trimOrNull(input.nextStage);
  let nextStage: LeadStage | null = null;
  if (nextStageRaw) {
    const validated = validateStageInput(nextStageRaw);
    if (!validated.ok) {
      return validated;
    }
    nextStage = validated.value;
  }

  const nextFollowUpAtRaw = trimOrNull(input.nextFollowUpAt);
  let nextFollowUpAt: Date | null = null;
  if (nextFollowUpAtRaw) {
    // Stejná konvence jako orderValidation.ts — datum bez času se ukládá
    // na 12:00 UTC, aby zobrazení bylo nezávislé na časové zóně serveru.
    const parsed = new Date(`${nextFollowUpAtRaw}T12:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "Neplatné datum dalšího kontaktu." };
    }
    nextFollowUpAt = parsed;
  }

  const nextStepNote = trimOrNull(input.nextStepNote);
  if (nextStepNote && nextStepNote.length > 500) {
    return { ok: false, error: "Popis dalšího kroku je příliš dlouhý (max. 500 znaků)." };
  }

  return { ok: true, value: { note, nextStage, nextFollowUpAt, nextStepNote } };
}

// Počítáno, ne uložené — stejný princip jako isPaymentOverdue
// (orderValidation.ts). Follow-up je "po termínu" jen u aktivní pipeline;
// konvertovaný/nezájmový lead žádný follow-up needs.
export function isFollowUpOverdue(stage: LeadStage, nextFollowUpAt: Date | null): boolean {
  if (!nextFollowUpAt || !ACTIVE_LEAD_STAGES.includes(stage)) {
    return false;
  }
  return nextFollowUpAt.getTime() < Date.now();
}
