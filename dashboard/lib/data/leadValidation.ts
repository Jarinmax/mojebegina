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

// Jarda – volání a provize, část 1 — doplnění e-mailu přímo z karty kontaktu
// (Dnešní volání). Na rozdíl od validateCompanyNameInput je tohle výhradně
// "přidat" tok (prázdné pole v UI se zobrazí až po kliknutí na "Přidat
// e-mail", nikdy předvyplněné) — prázdný/chybějící vstup je tu proto chyba,
// ne platné "smazat zpátky na neznámé".
export function validateContactEmailInput(
  raw: string
): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (!value) {
    return { ok: false, error: "Zadejte e-mail." };
  }
  if (!EMAIL_RE.test(value)) {
    return { ok: false, error: "Zadejte platný e-mail, např. jmeno@domena.cz." };
  }
  return { ok: true, value };
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

// Jarda – volání a provize, část 1, bod 2 doplňku ("Jednotný zápis výsledku
// hovoru") — JEDINÁ validace pro obě obrazovky (dřív CallLogInput/
// validateCallLogInput tady a DailyCallOutcomeInput/
// validateDailyCallOutcomeInput v dailyCallsValidation.ts, dvě nezávislé
// kopie stejného pravidla, co se časem mohly rozejít). "Dnešní volání"
// (dailyCalls.ts:logDailyCallOutcome) i "Všechny leady"/detail leadu
// (leads.ts:logCallOutcome) teď volají přesně tuhle funkci — stejná
// pravidla, stejná chybová hlášení, stejný tvar výstupu.
//
// Výsledek hovoru byl dřív jen na "Dnešní volání" (CALL_RESULTS žil v
// dailyCallsValidation.ts) — tady je teď kanonicky, protože
// dailyCallsValidation.ts už beztak importuje z tohohle souboru
// (validateStageInput), ne naopak (žádný cyklus).
export const CALL_RESULTS = [
  "reached_interested",
  "reached_not_interested",
  "no_answer",
  "call_back_later",
  "invalid_contact",
] as const;
export type CallResult = (typeof CALL_RESULTS)[number];

export type CallOutcomeInput = {
  result: string;
  note: string;
  nextStage: string;
  nextFollowUpAt: string;
  nextStepNote: string;
};

export type ValidatedCallOutcomeInput = {
  result: CallResult;
  note: string;
  nextStage: LeadStage | null;
  nextFollowUpAt: Date | null;
  nextStepNote: string | null;
};

// Výsledek a poznámka POVINNÉ (stejné pravidlo, jaké dřív platilo jen na
// "Dnešní volání") — fáze, další kontakt a další krok zůstávají nepovinné.
// U výsledku "Zavolat později" je datum dalšího kontaktu vynucené (bez něj
// by to byl nedohledatelný slib).
export function validateCallOutcomeInput(
  input: CallOutcomeInput
): { ok: true; value: ValidatedCallOutcomeInput } | { ok: false; error: string } {
  const result = input.result.trim();
  if (!CALL_RESULTS.includes(result as CallResult)) {
    return { ok: false, error: "Vyberte výsledek hovoru." };
  }

  const note = input.note.trim();
  if (!note) {
    return { ok: false, error: "Poznámka je povinná." };
  }
  if (note.length > 2000) {
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

  if ((result as CallResult) === "call_back_later" && !nextFollowUpAt) {
    return { ok: false, error: "U výsledku „Zavolat později“ je datum dalšího kontaktu povinné." };
  }

  const nextStepNote = trimOrNull(input.nextStepNote);
  if (nextStepNote && nextStepNote.length > 500) {
    return { ok: false, error: "Popis dalšího kroku je příliš dlouhý (max. 500 znaků)." };
  }

  return { ok: true, value: { result: result as CallResult, note, nextStage, nextFollowUpAt, nextStepNote } };
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

export type LeadSortRow = {
  id: string;
  stage: LeadStage;
  nextFollowUpAt: Date | null;
  createdAt: Date;
};

// Security Phase 16.4 — deterministické řazení seznamu leadů. Dřív se
// řadilo jen podle followUpOverdue/nextFollowUpAt a leady beze shody
// zůstávaly ve vzájemně nedefinovaném pořadí = pořadí, v jakém je vrátil
// SQL dotaz bez ORDER BY. To se u PostgreSQL může po jakémkoliv UPDATE
// řádku (přesně to dělá "Uložit zápis" i změna fáze) reálně změnit, takže
// lead bez varování "skočil" jinam v seznamu — nahlášeno na reálném leadu
// (Josef Huňáček), potvrzeno diagnostikou v Preview DB.
//
// Tiebreak musí být stabilní vůči UPDATE, takže NESMÍ použít updatedAt/
// lastContactedAt (ty se update-em právě mění) — použit createdAt (pořadí
// importu/vzniku, update ho nemění) a jako definitivní rozhodčí id.
export function compareLeadsForList(a: LeadSortRow, b: LeadSortRow): number {
  const aOverdue = isFollowUpOverdue(a.stage, a.nextFollowUpAt);
  const bOverdue = isFollowUpOverdue(b.stage, b.nextFollowUpAt);
  if (aOverdue !== bOverdue) {
    return aOverdue ? -1 : 1;
  }

  const aHasFollowUp = a.nextFollowUpAt !== null;
  const bHasFollowUp = b.nextFollowUpAt !== null;
  if (aHasFollowUp !== bHasFollowUp) {
    return aHasFollowUp ? -1 : 1;
  }
  if (aHasFollowUp && bHasFollowUp) {
    const diff = a.nextFollowUpAt!.getTime() - b.nextFollowUpAt!.getTime();
    if (diff !== 0) return diff;
  }

  const createdDiff = a.createdAt.getTime() - b.createdAt.getTime();
  if (createdDiff !== 0) return createdDiff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
