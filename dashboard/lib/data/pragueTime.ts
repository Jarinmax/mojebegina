// Sdílený neutrální modul — čistá práce s časovou zónou Europe/Prague,
// bez "server-only", používaná z více nezávislých domén (Denní volání,
// obecné CRM, Google Kalendář), aby žádná z nich nemusela záviset na
// druhé jen kvůli datu/času. Žádná z funkcí tu nic nezapisuje ani nečte
// z databáze.
import { DateTime, IANAZone } from "luxon";

const PRAGUE_ZONE = "Europe/Prague";

// Europe/Prague datum jako "YYYY-MM-DD" (Intl.DateTimeFormat s en-CA
// locale dává přímo ISO tvar, DST-aware). Používá se pro `added_for_date`
// a pro hranici "dnes" v progress ukazateli Denního volání a rozdělení
// "Nedokončeno z minula"/"Dnešní volání".
export function pragueDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PRAGUE_ZONE }).format(date);
}

// --- Datum + čas v Europe/Prague, bez ručního offsetu ----------------------
//
// Luxon u neexistujícího lokálního času (jarní přechod, "díra" např.
// 2:00–3:00) hodnotu TIŠE POSUNE na jiný platný čas místo toho, aby ji
// označil jako neplatnou (DateTime.isValid by tohle nezachytilo) — proto
// se existence ověřuje ROUND-TRIPEM: spočítaný UTC instant se převede
// zpátky do Europe/Prague a porovná se vstupem. Neshoda = čas neexistuje.
//
// Dvojznačnost (podzimní přechod, stejný lokální čas dvakrát) round-trip
// sám o sobě nezachytí (vybraná varianta je sama o sobě platná a projde).
// Europe/Prague má historicky vždy jen DVA možné offsety (60 nebo 120
// minut) — proto se zkusí i ten DRUHÝ offset a pokud i on dá round-tripem
// stejný vstup, jde o dvojznačný čas. Žádné spoléhání na to, kterou
// variantu by si Luxon vybral sám (schváleno explicitně — bezpečné
// pravidlo pro V1: dvojznačný čas se vždy odmítne).
export type PragueDateTimeResult = { ok: true; value: Date } | { ok: false; error: string };

function roundTripMatches(ms: number, y: number, mo: number, d: number, h: number, mi: number): boolean {
  const dt = DateTime.fromMillis(ms, { zone: PRAGUE_ZONE });
  return dt.year === y && dt.month === mo && dt.day === d && dt.hour === h && dt.minute === mi;
}

export function pragueDateTimeToUtc(dateRaw: string, timeRaw: string): PragueDateTimeResult {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateRaw.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeRaw.trim());
  if (!dateMatch || !timeMatch) {
    return { ok: false, error: "Neplatné datum nebo čas." };
  }
  const y = Number(dateMatch[1]);
  const mo = Number(dateMatch[2]);
  const d = Number(dateMatch[3]);
  const h = Number(timeMatch[1]);
  const mi = Number(timeMatch[2]);

  const zone = IANAZone.create(PRAGUE_ZONE);

  // 1) Hrubý odhad: vstupní čísla jako kdyby byla UTC, jen abychom měli
  // bod, ve kterém se zeptáme zóny na offset.
  const naiveUtcMs = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAtNaive = zone.offset(naiveUtcMs);
  const candidateMsA = naiveUtcMs - offsetAtNaive * 60000;
  // 2) Offset se může těsně u hranice přechodu lišit mezi "hrubým" bodem a
  // skutečným kandidátem — ověřit znovu PŘÍMO v kandidátovi.
  const offsetAtCandidateA = zone.offset(candidateMsA);
  const candidateMsB = naiveUtcMs - offsetAtCandidateA * 60000;

  if (!roundTripMatches(candidateMsB, y, mo, d, h, mi)) {
    return { ok: false, error: "Tento čas během přechodu na letní čas neexistuje. Zvol jiný čas." };
  }

  // Dvojznačnost: zkusit i druhý z pouze dvou možných offsetů Europe/Prague.
  const offsetAtCandidateB = zone.offset(candidateMsB);
  const otherOffset = offsetAtCandidateB === 60 ? 120 : 60;
  const altMs = naiveUtcMs - otherOffset * 60000;
  if (altMs !== candidateMsB && roundTripMatches(altMs, y, mo, d, h, mi)) {
    return { ok: false, error: "Tento čas je kvůli změně času nejednoznačný. Zvol jiný čas." };
  }

  return { ok: true, value: new Date(candidateMsB) };
}
