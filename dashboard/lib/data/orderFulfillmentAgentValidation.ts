// MCP objednávky 1.1 (plánování rozvozů) — čistá validace pro
// update_order_fulfillment: POVOLENÉ přechody stavu a vstup zápisu. Bez
// "server-only", testovatelné stejně jako orderValidation.ts.
//
// Lidská stránka (FulfillmentStatusForm) zůstává záměrně bez týhle kontroly
// — admin smí opravit chybu skokem (viz orders.ts updateFulfillmentStatus).
// Asistent ale nesmí "přeskakovat kroky" ani přepisovat libovolně, proto
// má VLASTNÍ, přísnější pravidlo jen pro svůj zápisový nástroj.
import { FULFILLMENT_STATUSES, type FulfillmentStatus } from "./orderValidation";

// new/confirmed/preparing/ready = příprava; cancelled = opravdu konec (storno
// má vlastní vedlejší účinky — e-mail zákazníkovi, držené peníze, viz
// lib/eshop/cancellation.ts — vracet ho tímhle nástrojem nedává smysl).
// cancelled jde nastavit z kteréhokoli nedokončeného stavu.
const CANCELLABLE_FROM: readonly FulfillmentStatus[] = ["new", "confirmed", "preparing", "ready", "out_for_delivery", "handed_to_carrier"];

// delivered NENÍ přísně koncové: skutečný případ, kvůli kterému tenhle
// nástroj vzniká (objednávka 70000004, 6. 11. 2026) je přesně OPRAVA
// předčasně/chybně označeného "doručeno", když kurýr jen převzal zásilku
// (handed_to_carrier) a ještě ji zákazníkovi nepředal. Proto delivered smí
// couvnout zpátky o POSLEDNÍ krok rozvozu (na handed_to_carrier nebo
// out_for_delivery) — ne dál (ne na ready/preparing/…, to by znamenalo
// úplné přepsání historie, ne opravu jednoho chybného kroku).
export const ALLOWED_FULFILLMENT_TRANSITIONS: Readonly<Record<FulfillmentStatus, readonly FulfillmentStatus[]>> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "handed_to_carrier", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  handed_to_carrier: ["delivered", "cancelled"],
  delivered: ["handed_to_carrier", "out_for_delivery"],
  cancelled: [],
};

export function isAllowedFulfillmentTransition(from: FulfillmentStatus, to: FulfillmentStatus): boolean {
  return ALLOWED_FULFILLMENT_TRANSITIONS[from].includes(to);
}

export function isTerminalFulfillmentStatus(status: FulfillmentStatus): boolean {
  return ALLOWED_FULFILLMENT_TRANSITIONS[status].length === 0;
}

export { CANCELLABLE_FROM };

const MAX_CARRIER_LENGTH = 200;
const MAX_TRACKING_LENGTH = 200;
const MAX_NOTE_LENGTH = 2000;

export type UpdateOrderFulfillmentInput = {
  orderId: string;
  targetStatus: FulfillmentStatus;
  eventAt: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  note: string | null;
};

export type ValidatedUpdateOrderFulfillment = {
  orderId: string;
  targetStatus: FulfillmentStatus;
  /** null = teď (now()) */
  eventAt: Date | null;
  carrier: string | null;
  trackingNumber: string | null;
  note: string | null;
};

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function trimmedOrNull(value: string | null, max: number, field: string): ValidationResult<string | null> {
  if (value === null) return { ok: true, value: null };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > max) return { ok: false, error: `${field} je příliš dlouhý(á) (max. ${max} znaků).` };
  return { ok: true, value: trimmed };
}

// Trochu tolerance do budoucna (hodiny psaní zprávy vs. skutečná událost),
// ale ne OBRÁCENĚ o víc než pár minut — "čas události" se nesmí splést
// s budoucím plánem (to je planned_delivery_at, jiné pole).
const MAX_FUTURE_EVENT_MINUTES = 15;

function parseEventAt(raw: string | null, now: Date): ValidationResult<Date | null> {
  if (raw === null || raw.trim() === "") return { ok: true, value: null };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "event_at musí být platné datum/čas (např. RRRR-MM-DD nebo RRRR-MM-DDTHH:mm)." };
  }
  if (parsed.getTime() - now.getTime() > MAX_FUTURE_EVENT_MINUTES * 60_000) {
    return { ok: false, error: "event_at je v budoucnosti — čas události je okamžik, kdy se to STALO, ne plán." };
  }
  return { ok: true, value: parsed };
}

export function validateUpdateOrderFulfillmentInput(
  input: UpdateOrderFulfillmentInput,
  now: Date = new Date()
): ValidationResult<ValidatedUpdateOrderFulfillment> {
  if (!FULFILLMENT_STATUSES.includes(input.targetStatus)) {
    return { ok: false, error: `Neznámý cílový stav „${input.targetStatus}“.` };
  }
  const eventAt = parseEventAt(input.eventAt, now);
  if (!eventAt.ok) return eventAt;
  const carrier = trimmedOrNull(input.carrier, MAX_CARRIER_LENGTH, "carrier");
  if (!carrier.ok) return carrier;
  const trackingNumber = trimmedOrNull(input.trackingNumber, MAX_TRACKING_LENGTH, "tracking_number");
  if (!trackingNumber.ok) return trackingNumber;
  const note = trimmedOrNull(input.note, MAX_NOTE_LENGTH, "note");
  if (!note.ok) return note;

  return {
    ok: true,
    value: {
      orderId: input.orderId,
      targetStatus: input.targetStatus,
      eventAt: eventAt.value,
      carrier: carrier.value,
      trackingNumber: trackingNumber.value,
      note: note.value,
    },
  };
}
