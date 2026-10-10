// Security Phase 19 (Denní volání 1.0) — čistá validace + čistá logika
// výběru, bez "server-only", stejný princip jako leadValidation.ts:
// testovatelné bez databáze, kontrola a dotaz se skládají až v
// dailyCalls.ts.
import { sql } from "drizzle-orm";
import { validateStageInput, type LeadStage } from "./leadValidation";
import { pragueDateString, pragueDateTimeToUtc } from "./pragueTime";

// Výsledek hovoru je ZÁMĚRNĚ oddělený od LEAD_STAGES (obchodní fáze) —
// schváleno explicitně: "výsledek hovoru není obchodní fáze". Fáze zůstává
// samostatné, nepovinné pole s výchozí hodnotou "neměnit".
export const CALL_RESULTS = [
  "reached_interested",
  "reached_not_interested",
  "no_answer",
  "call_back_later",
  "invalid_contact",
] as const;
export type CallResult = (typeof CALL_RESULTS)[number];

export type DailyCallOutcomeInput = {
  result: string;
  note: string;
  stageChange: string;
  nextFollowUpAtDate: string;
  nextFollowUpAtTime: string;
};

export type ValidatedDailyCallOutcomeInput = {
  result: CallResult;
  note: string;
  stageChange: LeadStage | null;
  nextFollowUpAt: Date | null;
};

// Výsledek a poznámka POVINNÉ, fáze a datum nepovinné — s jednou vázanou
// výjimkou: "zavolat později" bez termínu dalšího kontaktu by byl
// nedohledatelný slib, proto je u něj datum vynucené (schváleno explicitně).
export function validateDailyCallOutcomeInput(
  input: DailyCallOutcomeInput
): { ok: true; value: ValidatedDailyCallOutcomeInput } | { ok: false; error: string } {
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

  const stageChangeRaw = input.stageChange.trim();
  let stageChange: LeadStage | null = null;
  if (stageChangeRaw) {
    const validatedStage = validateStageInput(stageChangeRaw);
    if (!validatedStage.ok) {
      return validatedStage;
    }
    stageChange = validatedStage.value;
  }

  // Security Phase 20 (Google Kalendář 1.0) — datum i čas, ne jen datum
  // (schváleno explicitně: appka má z termínu vytvořit kalendářovou
  // událost na konkrétní čas, ne jen den). Obě pole se musí vyplnit
  // společně — jedno bez druhého je neúplný termín.
  const dateRaw = input.nextFollowUpAtDate.trim();
  const timeRaw = input.nextFollowUpAtTime.trim();
  let nextFollowUpAt: Date | null = null;
  if (dateRaw || timeRaw) {
    if (!dateRaw || !timeRaw) {
      return { ok: false, error: "Vyplňte datum i čas dalšího kontaktu, nebo žádné z nich." };
    }
    const parsed = pragueDateTimeToUtc(dateRaw, timeRaw);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    nextFollowUpAt = parsed.value;
  }

  if ((result as CallResult) === "call_back_later" && !nextFollowUpAt) {
    return { ok: false, error: "U výsledku „Zavolat později“ je datum i čas dalšího kontaktu povinné." };
  }

  return { ok: true, value: { result: result as CallResult, note, stageChange, nextFollowUpAt } };
}

// Maximální počet SOUČASNĚ nevyřízených položek fronty (staré nedokončené
// + drafty + zveřejněné dohromady) — schváleno explicitně.
export const MAX_QUEUE_SIZE = 10;

// Security Phase 19.2 — třívrstvé pravidlo automatického výběru, schválené
// explicitně po auditu Preview dat. Dřívější kontakt leada NEVYLUČUJE
// (pořád potenciální zákazník, může se oslovit znovu) — kandidátský pool
// je zpátky celé ACTIVE_LEAD_STAGES (filtrováno v SQL v dailyCalls.ts),
// tahle funkce jen rozřazuje do vrstev a stanovuje pořadí uvnitř nich.
//
// Závazné pořadí vyhodnocení (schváleno explicitně, NESMÍ se přeházet):
//   1. nextFollowUpAt existuje a je v BUDOUCNU → excluded (respektuje
//      domluvený termín, nenabízí se dřív — i kdyby lastContactedAt bylo
//      NULL, tzn. tahle podmínka se testuje PŘED tier2).
//   2. nextFollowUpAt existuje a je dnes nebo po termínu → tier1.
//   3. nextFollowUpAt není nastaven a lastContactedAt IS NULL → tier2.
//   4. nextFollowUpAt není nastaven, lastContactedAt IS NOT NULL a od
//      posledního kontaktu uplynulo >= FOLLOW_UP_COOLDOWN_DAYS → tier3.
//   5. jinak (nedávno kontaktován, bez termínu, lhůta ještě neuplynula)
//      → excluded (dočasně, ne trvale — příští den může projít).
export const FOLLOW_UP_COOLDOWN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AutoCandidateLeadRow = {
  id: string;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
  createdAt: Date;
};

export type AutoCandidateTier = "tier1" | "tier2" | "tier3" | "excluded";

// `now` jako parametr (ne Date.now() uvnitř) — čistá funkce, testovatelná
// bez systémového času. Termín "dnes nebo po termínu" se porovnává přes
// pragueDateString (kalendářní den v Europe/Prague), ne přes syrový
// timestamp — nextFollowUpAt je uložený na 12:00 UTC (viz
// validateDailyCallOutcomeInput), takže datumové porovnání je spolehlivé
// bez ohledu na to, v kolik hodin kurátor spustí návrh.
export function classifyAutoCandidate(
  lead: Pick<AutoCandidateLeadRow, "lastContactedAt" | "nextFollowUpAt">,
  now: Date
): AutoCandidateTier {
  if (lead.nextFollowUpAt !== null) {
    return pragueDateString(lead.nextFollowUpAt) <= pragueDateString(now) ? "tier1" : "excluded";
  }
  if (lead.lastContactedAt === null) {
    return "tier2";
  }
  const elapsedMs = now.getTime() - lead.lastContactedAt.getTime();
  return elapsedMs >= FOLLOW_UP_COOLDOWN_DAYS * DAY_MS ? "tier3" : "excluded";
}

function compareByDateThenId(dateA: Date, idA: string, dateB: Date, idB: string): number {
  const diff = dateA.getTime() - dateB.getTime();
  if (diff !== 0) return diff;
  return idA < idB ? -1 : idA > idB ? 1 : 0;
}

// Rozřadí kandidáty do vrstev a seřadí KAŽDOU vrstvu podle schváleného
// pravidla (tier1 od nejvíc prošlého termínu, tier2 od nejstaršího
// createdAt, tier3 od nejstaršího lastContactedAt, všude tiebreak na id),
// pak je spojí v pořadí tier1 → tier2 → tier3. "excluded" se nikam
// nezařadí. Výsledek je KOMPLETNÍ seřazený seznam — oříznutí na volnou
// kapacitu fronty dělá autoCandidatesToAdd níže.
export function orderAutoCandidates(candidates: AutoCandidateLeadRow[], now: Date): AutoCandidateLeadRow[] {
  const tier1: AutoCandidateLeadRow[] = [];
  const tier2: AutoCandidateLeadRow[] = [];
  const tier3: AutoCandidateLeadRow[] = [];

  for (const lead of candidates) {
    const tier = classifyAutoCandidate(lead, now);
    if (tier === "tier1") tier1.push(lead);
    else if (tier === "tier2") tier2.push(lead);
    else if (tier === "tier3") tier3.push(lead);
  }

  tier1.sort((a, b) => compareByDateThenId(a.nextFollowUpAt!, a.id, b.nextFollowUpAt!, b.id));
  tier2.sort((a, b) => compareByDateThenId(a.createdAt, a.id, b.createdAt, b.id));
  tier3.sort((a, b) => compareByDateThenId(a.lastContactedAt!, a.id, b.lastContactedAt!, b.id));

  return [...tier1, ...tier2, ...tier3];
}

// Čistá funkce: kolik a kterých kandidátů doplnit, aby součet se
// SOUČASNÝM počtem nevyřízených položek nepřekročil MAX_QUEUE_SIZE.
// `candidates` už musí být filtrovaní na DB úrovni (owner=Blahout, fáze
// v ACTIVE_LEAD_STAGES, telefon, ještě ne ve frontě) — tahle funkce
// rozřadí do vrstev, seřadí a ořízne.
export function autoCandidatesToAdd(
  currentPendingCount: number,
  candidates: AutoCandidateLeadRow[],
  now: Date
): AutoCandidateLeadRow[] {
  const remaining = Math.max(0, MAX_QUEUE_SIZE - currentPendingCount);
  if (remaining === 0) {
    return [];
  }
  return orderAutoCandidates(candidates, now).slice(0, remaining);
}

// Stejný limit vynucený i pro RUČNÍ přidání (bug nahlášený na Preview:
// automatický návrh limit respektoval přes candidatesToAdd výše, ruční
// přidání v dailyCalls.ts:addManualCandidate ho nekontrolovalo vůbec —
// fronta mohla přerůst 10/10). Vytčeno jako čistá funkce, aby šlo
// otestovat bez databáze; addManualCandidate ji volá PŘED insertem.
export function canAddManualCandidate(currentPendingCount: number): { ok: true } | { ok: false; error: string } {
  if (currentPendingCount >= MAX_QUEUE_SIZE) {
    return {
      ok: false,
      error: `Fronta už obsahuje maximálních ${MAX_QUEUE_SIZE} kontaktů. Nejdřív některý odeberte.`,
    };
  }
  return { ok: true };
}

// pragueDateString žije v neutrálním pragueTime.ts (sdíleno i s
// googleCalendarValidation.ts/leadValidation.ts) — reexportováno odsud,
// aby stávající importy z téhle domény (dailyCalls.ts, testy) zůstaly
// beze změny.
export { pragueDateString };

// Čistá interpretace výsledku atomického CTE zápisu (dailyCalls.ts:
// logDailyCallOutcome). Skutečnou bezpečnost proti dvojímu/souběžnému
// zápisu zaručuje samotné SQL (WHERE status='pending' ... EXISTS(claimed),
// viz komentář tam) — 0 vrácených řádků znamená, že položka v mezičase
// přestala být `pending` (dvojklik, souběžný request, nebo už vyřízeno
// jinde). Tahle funkce jen převádí ten výsledek na odpověď pro uživatele —
// vytčeno zvlášť, aby šlo otestovat bez databáze.
export function interpretCallLogOutcome(insertedRowCount: number): { ok: true } | { ok: false; error: string } {
  if (insertedRowCount === 0) {
    return { ok: false, error: "Tento kontakt už byl mezitím vyřízen (souběžný nebo opakovaný zápis)." };
  }
  return { ok: true };
}

// Security Phase 21 (Denní volání 1.1) — "relevantní" aktivita pro přípravu
// na hovor NENÍ totéž jako "aktivita s nějakým textem" (schváleno
// explicitně: pouhé `body IS NOT NULL` by zahrnulo i budoucí systémové
// záznamy, kdyby jim někdy `body` začal nastavovat). Explicitní seznam
// druhů, ne odvozování z toho, co má/nemá text:
//   - "call_logged" — skutečný zápis výsledku hovoru (Denní volání i
//     CallLogForm na detailu leada obě zapisují tento druh).
//   - "created" — dnes v appce nikde nenastavuje `body` (viz
//     createLead/companyNodes.ts/orders.ts/ceoFocus.ts), ale schváleno
//     explicitně jako budoucí rozšiřovací bod pro importní poznámku bez
//     nutnosti měnit tenhle filtr.
// Ostatní druhy (stage_changed, owner_assigned, acquired_by_set,
// converted, company_name_set, follow_up_removed) jsou administrativní
// záznamy CRM, ne poznámky k přípravě na hovor — vyloučené i kdyby měly
// `body` vyplněné.
export const RELEVANT_ACTIVITY_KINDS = ["call_logged", "created"] as const;

export function isRelevantActivityEntry(entry: { kind: string; body: string | null }): boolean {
  return (RELEVANT_ACTIVITY_KINDS as readonly string[]).includes(entry.kind) && !!entry.body && entry.body.trim() !== "";
}

// Čistá kontrola denní hranice v Europe/Prague přes kalendářní den
// (pragueDateString), ne přes syrový timestamp — stejný princip jako
// classifyAutoCandidate výše. Použito pro testování "vyřízeno DNES" bez
// nutnosti sahat na databázové NOW().
export function isPragueSameDay(a: Date, b: Date): boolean {
  return pragueDateString(a) === pragueDateString(b);
}

// Bug nahlášený na Preview (chyba 500 při "Fázi neměnit" + prázdné "další
// kontakt", tj. value.stageChange A value.nextFollowUpAt oba null
// zároveň): Postgres u polymorfních funkcí jako jsonb_build_object (bere
// VARIADIC "any") nedokáže odvodit typ netypovaného NULL parametru, pokud
// vedle něj není žádný jinak typovaný argument stejné pozice, na který by
// se mohl odvolat (na rozdíl od COALESCE, které typ odvodí ze sloupce
// vedle sebe) — skončí chybou "could not determine data type of
// parameter". Proto explicitní `::text`/`::timestamptz` cast u KAŽDÉHO
// parametru uvnitř jsonb_build_object, i tam, kde by za normálních
// okolností (nenulová hodnota) fungoval i bez castu.
//
// Security Phase 20 (Google Kalendář 1.0) — next_follow_up_at NENÍ přes
// COALESCE (na rozdíl od stage, kde "Fázi neměnit" správně znamená
// neměnit). V Denním volání je termín vždy BINÁRNÍ rozhodnutí: buď ho
// zápis explicitně nastaví (výsledek "Zavolat později"), nebo ho explicitně
// SMAŽE (jiný výsledek, žádný nový termín) — COALESCE by "smazání"
// proměnil zpátky na "ponechat starý termín", což byl přesně nahlášený
// bug (termín šel nastavit, ale nikdy doopravdy smazat). Proto přímé
// `SET next_follow_up_at = ...` bez COALESCE.
//
// Stejná operace rovnou upsertuje lead_calendar_sync na 'pending' — V TÉŽE
// atomické operaci jako zápis next_follow_up_at (schváleno explicitně) —
// skutečné volání Google Kalendáře proběhne až PO commitu, viz
// dailyCalls.ts:logDailyCallOutcome.
//
// Vytčeno jako samostatná exportovaná funkce, co jen SESTAVÍ dotaz (nic
// nespouští), aby šlo jeho přesné SQL ověřit testem bez databáze — viz
// __tests__/dailyCallsValidation.test.ts. Žije tady (ne v dailyCalls.ts),
// protože ten soubor má "import server-only", který se mimo Next.js build
// nedá resolvovat — vitest by test s hodnotovým importem z dailyCalls.ts
// nerozběhl (stejná konvence jako všude jinde v projektu: *.test.ts vždy
// jen `import type` ze server-only souborů, nikdy hodnotu).
// Security Phase 21 (Denní volání 1.1) — `resulting_activity_id` se
// nastavuje PŘÍMO v `claimed`, v tomtéž UPDATE, co je jediný gate celého
// příkazu (`WHERE status='pending'`). `activityId` je hotové UUID
// vygenerované v JS (`randomUUID()` v dailyCalls.ts) PŘED spuštěním
// dotazu, ne hodnota generovaná až INSERTem níž — proto ho lze zapsat do
// `claimed` bez ohledu na pořadí CTE. Když claim prohraje (0 řádků),
// `claimed` UPDATE se neprovede vůbec, takže `resulting_activity_id`
// nikdy neukáže na aktivitu, která by (kvůli prohranému claimu) nakonec
// nevznikla — INSERT do lead_activity níž je ostatně taky gatovaný
// `WHERE EXISTS (SELECT 1 FROM claimed)`, takže osiřelá aktivita nemůže
// vzniknout ani při souběhu.
export function buildLogDailyCallOutcomeQuery(params: {
  itemId: string;
  leadId: string;
  authorUserId: string;
  authorName: string | null;
  activityId: string;
  note: string;
  stageChange: string | null;
  nextFollowUpAt: Date | null;
  result: string;
}) {
  const { itemId, leadId, authorUserId, authorName, activityId, note, stageChange, nextFollowUpAt, result } = params;
  return sql`
    WITH old_lead AS (
      SELECT stage FROM leads WHERE id = ${leadId}
    ),
    claimed AS (
      UPDATE daily_call_queue
      SET status = 'done', done_at = now(), done_by = ${authorUserId}, updated_at = now(),
          resulting_activity_id = ${activityId}
      WHERE id = ${itemId} AND status = 'pending' AND lead_id = ${leadId}
      RETURNING id
    ),
    lead_upd AS (
      UPDATE leads
      SET last_contacted_at = now(),
          updated_at = now(),
          stage = COALESCE(${stageChange}::text, stage),
          next_follow_up_at = ${nextFollowUpAt}::timestamptz
      WHERE id = ${leadId} AND EXISTS (SELECT 1 FROM claimed)
      RETURNING id
    ),
    calendar_sync_upsert AS (
      INSERT INTO lead_calendar_sync (lead_id, sync_status, updated_at)
      SELECT ${leadId}, 'pending', now()
      WHERE EXISTS (SELECT 1 FROM claimed)
      ON CONFLICT (lead_id) DO UPDATE SET sync_status = 'pending', updated_at = now()
    )
    INSERT INTO lead_activity (id, lead_id, author_user_id, author_name, kind, body, metadata, created_at)
    SELECT ${activityId}, ${leadId}, ${authorUserId}, ${authorName}, 'call_logged', ${note},
      jsonb_build_object(
        'stageChangedTo', ${stageChange}::text,
        'nextFollowUpAt', ${nextFollowUpAt}::timestamptz,
        'from', (SELECT stage FROM old_lead),
        'callResult', ${result}::text
      ),
      now()
    WHERE EXISTS (SELECT 1 FROM claimed)
    RETURNING id
  `;
}

// Prohození sousední dvojice v poli id — čistá logika za "posunout
// nahoru/dolů" (dailyCalls.ts: moveQueueItemUp/Down). `null` = krok není
// možný (položka je už na kraji). Vytčeno zvlášť, aby šlo otestovat bez
// databáze — skutečné bezpečné zapsání nového pořadí (dvoufázové
// přečíslování) dělá až applyQueueReorder v dailyCalls.ts.
export function swapAdjacent<T>(ids: readonly T[], index: number, direction: "up" | "down"): T[] | null {
  if (index < 0 || index >= ids.length) {
    return null;
  }
  const otherIndex = direction === "up" ? index - 1 : index + 1;
  if (otherIndex < 0 || otherIndex >= ids.length) {
    return null;
  }
  const result = [...ids];
  [result[index], result[otherIndex]] = [result[otherIndex], result[index]];
  return result;
}
