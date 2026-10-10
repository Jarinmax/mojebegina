// Security Phase 20 (Google Kalendář 1.0) — čistá validace a logika, bez
// "server-only", stejný princip jako dailyCallsValidation.ts: testovatelné
// bez databáze i bez Google API, kontrola a volání Googlu se skládají až
// v googleCalendar.ts.
//
// pragueDateTimeToUtc žije v neutrálním pragueTime.ts (sdíleno i s
// dailyCallsValidation.ts/leadValidation.ts) — reexportováno odsud, aby
// stávající importy z téhle domény zůstaly beze změny.
import { DateTime } from "luxon";
import { ACTIVE_LEAD_STAGES, type LeadStage } from "./leadValidation";
import { pragueDateTimeToUtc, type PragueDateTimeResult } from "./pragueTime";

const PRAGUE_ZONE = "Europe/Prague";

export { pragueDateTimeToUtc, type PragueDateTimeResult };

// --- Efektivní cílový termín (schváleno explicitně) -------------------------
//
// Lead mimo ACTIVE_LEAD_STAGES (converted/not_interested) má efektivní
// termín VŽDY null, i kdyby leads.next_follow_up_at zůstalo historicky
// vyplněné — uzavření/konverze leadu musí smazat kalendářovou událost.
export function effectiveNextFollowUpAt(stage: LeadStage, nextFollowUpAt: Date | null): Date | null {
  return ACTIVE_LEAD_STAGES.includes(stage) ? nextFollowUpAt : null;
}

// --- Reconcile rozhodnutí ----------------------------------------------------
//
// Pořadí je závazné (schváleno explicitně, oprava pořadí priorit — mazání
// musí mít nejvyšší prioritu, jinak by kombinace "termín null + existující
// event + pending/failed" chybně skončila jako update):
//   1. cíl je null → delete (má-li event), jinak noop
//   2. event neexistuje → create
//   3. sync_status pending/failed → update (i beze změny času — mohl se
//      změnit telefon/poznámka/jméno, nebo jde o retry)
//   4. čas se liší od naposledy synchronizovaného → update
//   5. jinak noop
export type ReconcileAction = "create" | "update" | "delete" | "noop";
export type SyncStatus = "pending" | "synced" | "failed";

export function resolveReconcileAction(input: {
  currentNextFollowUpAt: Date | null;
  syncedNextFollowUpAt: Date | null;
  googleEventId: string | null;
  syncStatus: SyncStatus;
}): ReconcileAction {
  const { currentNextFollowUpAt, syncedNextFollowUpAt, googleEventId, syncStatus } = input;

  if (currentNextFollowUpAt === null) {
    return googleEventId ? "delete" : "noop";
  }
  if (googleEventId === null) {
    return "create";
  }
  if (syncStatus === "pending" || syncStatus === "failed") {
    return "update";
  }
  if (currentNextFollowUpAt.getTime() !== syncedNextFollowUpAt?.getTime()) {
    return "update";
  }
  return "noop";
}

// --- Deterministické Google event ID ----------------------------------------
//
// NENÍ přidělené Googlem — odvozené čistě z leadId, aby šlo bezpečně
// opakovat vytvoření po pádu mezi úspěchem v Googlu a zápisem do DB (viz
// googleCalendar.ts: 409 při events.insert → events.get + events.patch na
// stejném id, žádná duplicita). Google vyžaduje znaky z base32hex alfabetu
// (0-9, a-v), délku 5–1024 — hex znaky UUID (0-9a-f) jsou validní
// podmnožinou (a-f jsou první písmena base32hex abecedy).
export function buildGoogleEventId(leadId: string): string {
  return `mb${leadId.replace(/-/g, "")}`;
}

// --- Obsah události ----------------------------------------------------------

export const EVENT_DURATION_MINUTES = 15;

export function buildEventTitle(displayName: string): string {
  return `Zavolat: ${displayName}`;
}

export function buildEventDescription(input: {
  contactPhone: string | null;
  note: string | null;
  leadUrl: string;
}): string {
  const lines: string[] = [];
  if (input.contactPhone) lines.push(`Telefon: ${input.contactPhone}`);
  if (input.note) lines.push(`Poznámka: ${input.note}`);
  lines.push(input.leadUrl);
  return lines.join("\n");
}

// Tři kandidátní upozornění (minuty před začátkem): 20 min, 2 h, a do 9:00
// téhož dne — poslední JEN pokud je hovor v 9:00 nebo později (schváleno
// explicitně). Shodné hodnoty se deduplikují, aby Google nedostal dvě
// identická upozornění (např. hovor v 11:00: "9:00" i "2h před" vychází
// na stejných 120 minut).
export function buildReminderMinutes(startAt: Date): number[] {
  const startPrague = DateTime.fromJSDate(startAt, { zone: PRAGUE_ZONE });
  const candidates: number[] = [20, 120];

  if (startPrague.hour >= 9) {
    const nineAm = startPrague.set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
    const minutesUntilNine = Math.round(startPrague.diff(nineAm, "minutes").minutes);
    if (minutesUntilNine >= 0) {
      candidates.push(minutesUntilNine);
    }
  }

  return [...new Set(candidates)].sort((a, b) => a - b);
}

// --- Vytvoření/aktualizace události, injektovaný klient (testovatelné) -----
//
// googleCalendar.ts (server-only) dodává skutečný klient volající Google
// API a překládá HTTP 409 na GoogleConflictError PŘED voláním tyhle
// funkce — tahle vrstva sama žádné HTTP nedělá, jen rozhoduje. Díky tomu
// jde otestovat scénář "Google událost už vytvořil, DB o tom neví" beze
// zbytku serveru/DB/sítě: mock klient, co na první insertEvent hodí
// GoogleConflictError, musí vyvolat přesně jeden patchEvent, nikdy druhý
// insertEvent.
export class GoogleConflictError extends Error {}

export type CalendarEventInput = {
  summary: string;
  description: string;
  startUtc: Date;
  durationMinutes: number;
  reminderMinutes: number[];
};

export type GoogleCalendarClient = {
  insertEvent(calendarId: string, eventId: string, event: CalendarEventInput): Promise<void>;
  getEvent(calendarId: string, eventId: string): Promise<void>;
  patchEvent(calendarId: string, eventId: string, event: CalendarEventInput): Promise<void>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
};

export async function createOrPatchEvent(
  client: GoogleCalendarClient,
  calendarId: string,
  eventId: string,
  event: CalendarEventInput
): Promise<"created" | "patched"> {
  try {
    await client.insertEvent(calendarId, eventId, event);
    return "created";
  } catch (err) {
    if (err instanceof GoogleConflictError) {
      // Google událost s tímhle deterministickým id už má — typicky proto,
      // že minulý pokus u Googlu uspěl, ale zápis do lead_calendar_sync
      // spadl dřív, než se to stihlo zaznamenat, NEBO proto, že dřívější
      // smazání (events.delete) nechalo událost v Googlu ve stavu
      // "cancelled" po dobu retenční lhůty — insert se stejným id na ni
      // narazí na 409, i když je "smazaná". Schválený postup: nejdřív
      // events.get (potvrdí, že událost existuje, byť třeba cancelled),
      // potom events.patch na stejném id (nikdy druhý insert) — a
      // toCalendarResource vždy nastavuje status "confirmed", takže patch
      // cancelled událost i "vzkřísí".
      await client.getEvent(calendarId, eventId);
      await client.patchEvent(calendarId, eventId, event);
      return "patched";
    }
    throw err;
  }
}
