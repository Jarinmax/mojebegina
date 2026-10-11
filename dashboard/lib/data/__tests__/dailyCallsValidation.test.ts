import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  validateDailyCallOutcomeInput,
  canAddManualCandidate,
  classifyAutoCandidate,
  orderAutoCandidates,
  autoCandidatesToAdd,
  interpretCallLogOutcome,
  buildLogDailyCallOutcomeQuery,
  swapAdjacent,
  pragueDateString,
  isPragueSameDay,
  isRelevantActivityEntry,
  RELEVANT_ACTIVITY_KINDS,
  MAX_QUEUE_SIZE,
  FOLLOW_UP_COOLDOWN_DAYS,
  type AutoCandidateLeadRow,
} from "../dailyCallsValidation";

function baseOutcome(overrides: Partial<Parameters<typeof validateDailyCallOutcomeInput>[0]> = {}) {
  return {
    result: "reached_interested",
    note: "Mluvili jsme, pošlu vzorek.",
    stageChange: "",
    nextFollowUpAtDate: "",
    nextFollowUpAtTime: "",
    ...overrides,
  };
}

// Security Phase 19 — výsledek hovoru NENÍ obchodní fáze (schváleno
// explicitně, revize návrhu bod 2): výsledek a poznámka povinné, fáze
// nepovinná s výchozí "neměnit", datum povinné jen pro "zavolat později".
describe("validateDailyCallOutcomeInput — Security Phase 19", () => {
  it("platný vstup s výsledkem a poznámkou projde, fáze zůstává null", () => {
    const result = validateDailyCallOutcomeInput(baseOutcome());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.result).toBe("reached_interested");
      expect(result.value.stageChange).toBeNull();
    }
  });

  it("chybějící výsledek je DENY", () => {
    expect(validateDailyCallOutcomeInput(baseOutcome({ result: "" })).ok).toBe(false);
  });

  it("neplatný výsledek je DENY (žádné 'beze změny' u výsledku)", () => {
    expect(validateDailyCallOutcomeInput(baseOutcome({ result: "beze_zmeny" })).ok).toBe(false);
  });

  it("chybějící poznámka je DENY, i když je výsledek vyplněný", () => {
    expect(validateDailyCallOutcomeInput(baseOutcome({ note: "   " })).ok).toBe(false);
  });

  it("volitelná fáze — platná hodnota projde a uloží se", () => {
    const result = validateDailyCallOutcomeInput(baseOutcome({ stageChange: "interested" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stageChange).toBe("interested");
    }
  });

  it("neplatná fáze je DENY", () => {
    expect(validateDailyCallOutcomeInput(baseOutcome({ stageChange: "nesmysl" })).ok).toBe(false);
  });

  it("výsledek 'call_back_later' BEZ data a času je DENY", () => {
    const result = validateDailyCallOutcomeInput(
      baseOutcome({ result: "call_back_later", nextFollowUpAtDate: "", nextFollowUpAtTime: "" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Zavolat později/);
    }
  });

  it("výsledek 'call_back_later' S datem i časem projde", () => {
    const result = validateDailyCallOutcomeInput(
      baseOutcome({ result: "call_back_later", nextFollowUpAtDate: "2026-10-05", nextFollowUpAtTime: "10:00" })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nextFollowUpAt).not.toBeNull();
    }
  });

  it("jiný výsledek než 'call_back_later' nevyžaduje datum ani čas", () => {
    expect(
      validateDailyCallOutcomeInput(
        baseOutcome({ result: "no_answer", nextFollowUpAtDate: "", nextFollowUpAtTime: "" })
      ).ok
    ).toBe(true);
  });

  it("Security Phase 20 — jen datum bez času je DENY (musí jít dohromady)", () => {
    const result = validateDailyCallOutcomeInput(
      baseOutcome({ result: "no_answer", nextFollowUpAtDate: "2026-10-05", nextFollowUpAtTime: "" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/datum i čas/);
    }
  });

  it("Security Phase 20 — jen čas bez data je DENY (musí jít dohromady)", () => {
    const result = validateDailyCallOutcomeInput(
      baseOutcome({ result: "no_answer", nextFollowUpAtDate: "", nextFollowUpAtTime: "10:00" })
    );
    expect(result.ok).toBe(false);
  });

  it("neplatné datum je DENY", () => {
    expect(
      validateDailyCallOutcomeInput(
        baseOutcome({ result: "call_back_later", nextFollowUpAtDate: "not-a-date", nextFollowUpAtTime: "10:00" })
      ).ok
    ).toBe(false);
  });
});

const NOW = new Date("2026-10-01T10:00:00.000Z"); // Europe/Prague: 2026-10-01 12:00 (CEST)

function autoCandidate(overrides: Partial<AutoCandidateLeadRow> = {}): AutoCandidateLeadRow {
  return {
    id: "lead-1",
    lastContactedAt: null,
    nextFollowUpAt: null,
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

// Security Phase 19.2 — třívrstvé pravidlo schválené po druhé revizi:
// dřívější kontakt leada NEVYLUČUJE (pořád potenciální zákazník), jen ho
// zařadí do jiné vrstvy a chrání 30denní lhůtou. Závazné pořadí
// vyhodnocení: budoucí nextFollowUpAt vyřazuje PŘED čímkoliv dalším.
describe("classifyAutoCandidate — Security Phase 19.2", () => {
  it("lead bez kontaktu, bez termínu → tier2", () => {
    expect(classifyAutoCandidate(autoCandidate(), NOW)).toBe("tier2");
  });

  it("nextFollowUpAt dnes → tier1", () => {
    const lead = autoCandidate({ nextFollowUpAt: new Date("2026-10-01T12:00:00.000Z") });
    expect(classifyAutoCandidate(lead, NOW)).toBe("tier1");
  });

  it("nextFollowUpAt v minulosti (po termínu) → tier1", () => {
    const lead = autoCandidate({ nextFollowUpAt: new Date("2026-09-20T12:00:00.000Z") });
    expect(classifyAutoCandidate(lead, NOW)).toBe("tier1");
  });

  it("DŮLEŽITÉ: lastContactedAt=NULL, ale nextFollowUpAt v budoucnu → excluded, NESMÍ spadnout do tier2", () => {
    const lead = autoCandidate({
      lastContactedAt: null,
      nextFollowUpAt: new Date("2026-10-15T12:00:00.000Z"),
    });
    expect(classifyAutoCandidate(lead, NOW)).toBe("excluded");
  });

  it("nextFollowUpAt v budoucnu i s vyplněným lastContactedAt → excluded (respektuje domluvený termín)", () => {
    const lead = autoCandidate({
      lastContactedAt: new Date("2026-08-01"),
      nextFollowUpAt: new Date("2026-10-15T12:00:00.000Z"),
    });
    expect(classifyAutoCandidate(lead, NOW)).toBe("excluded");
  });

  it("bez termínu, lastContactedAt přesně 30 dní zpátky → tier3 (lhůta uplynula)", () => {
    const lead = autoCandidate({ lastContactedAt: new Date(NOW.getTime() - FOLLOW_UP_COOLDOWN_DAYS * 86400000) });
    expect(classifyAutoCandidate(lead, NOW)).toBe("tier3");
  });

  it("bez termínu, lastContactedAt 29 dní zpátky → excluded (lhůta ještě neuplynula)", () => {
    const lead = autoCandidate({ lastContactedAt: new Date(NOW.getTime() - 29 * 86400000) });
    expect(classifyAutoCandidate(lead, NOW)).toBe("excluded");
  });

  it("bez termínu, lastContactedAt dávno v minulosti → tier3", () => {
    const lead = autoCandidate({ lastContactedAt: new Date("2026-01-01") });
    expect(classifyAutoCandidate(lead, NOW)).toBe("tier3");
  });
});

describe("orderAutoCandidates — Security Phase 19.2", () => {
  it("pořadí vrstev je vždy tier1 → tier2 → tier3, excluded se nikam nezařadí", () => {
    const t1 = autoCandidate({ id: "t1", nextFollowUpAt: new Date("2026-09-25T12:00:00.000Z") });
    const t2 = autoCandidate({ id: "t2" });
    const t3 = autoCandidate({ id: "t3", lastContactedAt: new Date("2026-01-01") });
    const excluded = autoCandidate({ id: "excluded", lastContactedAt: new Date(NOW.getTime() - 5 * 86400000) });

    const result = orderAutoCandidates([t3, excluded, t2, t1], NOW);
    expect(result.map((c) => c.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("tier1 se řadí od nejvíc prošlého termínu", () => {
    const soon = autoCandidate({ id: "soon", nextFollowUpAt: new Date("2026-10-01T12:00:00.000Z") });
    const overdue = autoCandidate({ id: "overdue", nextFollowUpAt: new Date("2026-09-01T12:00:00.000Z") });
    const result = orderAutoCandidates([soon, overdue], NOW);
    expect(result.map((c) => c.id)).toEqual(["overdue", "soon"]);
  });

  it("tier2 se řadí od nejstaršího createdAt", () => {
    const older = autoCandidate({ id: "older", createdAt: new Date("2026-01-01") });
    const newer = autoCandidate({ id: "newer", createdAt: new Date("2026-06-01") });
    expect(orderAutoCandidates([newer, older], NOW).map((c) => c.id)).toEqual(["older", "newer"]);
  });

  it("tier3 se řadí od nejstaršího lastContactedAt (nejdéle nekontaktovaný první)", () => {
    const longAgo = autoCandidate({ id: "long-ago", lastContactedAt: new Date("2026-01-01") });
    const lessLongAgo = autoCandidate({ id: "less-long-ago", lastContactedAt: new Date("2026-06-01") });
    expect(orderAutoCandidates([lessLongAgo, longAgo], NOW).map((c) => c.id)).toEqual(["long-ago", "less-long-ago"]);
  });

  it("stabilní tiebreak na id uvnitř každé vrstvy", () => {
    const sameCreatedAt = new Date("2026-01-01");
    const b = autoCandidate({ id: "bbbb", createdAt: sameCreatedAt });
    const a = autoCandidate({ id: "aaaa", createdAt: sameCreatedAt });
    expect(orderAutoCandidates([b, a], NOW).map((c) => c.id)).toEqual(["aaaa", "bbbb"]);
  });
});

describe("autoCandidatesToAdd — Security Phase 19.2", () => {
  it("doplní jen do MAX_QUEUE_SIZE, ne víc", () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      autoCandidate({ id: `id-${i}`, createdAt: new Date(`2026-01-${(i % 28) + 1}`) })
    );
    expect(autoCandidatesToAdd(0, candidates, NOW)).toHaveLength(MAX_QUEUE_SIZE);
  });

  it("respektuje počet už nevyřízených položek", () => {
    const candidates = Array.from({ length: 5 }, (_, i) => autoCandidate({ id: `id-${i}` }));
    expect(autoCandidatesToAdd(7, candidates, NOW)).toHaveLength(3);
  });

  it("fronta už plná (>= 10) → nic nepřidá", () => {
    const candidates = [autoCandidate()];
    expect(autoCandidatesToAdd(10, candidates, NOW)).toHaveLength(0);
    expect(autoCandidatesToAdd(12, candidates, NOW)).toHaveLength(0);
  });

  it("excluded kandidáti se nepočítají do doplnění, i kdyby byli jediní v poolu", () => {
    const excluded = autoCandidate({ lastContactedAt: new Date(NOW.getTime() - 5 * 86400000) });
    expect(autoCandidatesToAdd(0, [excluded], NOW)).toHaveLength(0);
  });
});

// Regrese na bug nahlášený na Preview: ruční přidání limit MAX_QUEUE_SIZE
// nekontrolovalo vůbec (na rozdíl od automatického návrhu přes
// candidatesToAdd výše), fronta mohla přerůst 10/10.
describe("canAddManualCandidate — Security Phase 19", () => {
  it("při 10 pending položkách (MAX_QUEUE_SIZE) nelze přidat jedenáctou", () => {
    const result = canAddManualCandidate(MAX_QUEUE_SIZE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Fronta už obsahuje maximálních 10 kontaktů. Nejdřív některý odeberte.");
    }
  });

  it("nad limitem (např. po souběžném zápisu) je také DENY", () => {
    expect(canAddManualCandidate(MAX_QUEUE_SIZE + 1).ok).toBe(false);
  });

  it("pod limitem je povoleno", () => {
    expect(canAddManualCandidate(MAX_QUEUE_SIZE - 1)).toEqual({ ok: true });
  });

  it("prázdná fronta je povolena", () => {
    expect(canAddManualCandidate(0)).toEqual({ ok: true });
  });
});

describe("interpretCallLogOutcome — Security Phase 19", () => {
  it("0 vrácených řádků = souběžný/opakovaný zápis, DENY", () => {
    const result = interpretCallLogOutcome(0);
    expect(result.ok).toBe(false);
  });

  it("1 vrácený řádek = úspěch", () => {
    expect(interpretCallLogOutcome(1)).toEqual({ ok: true });
  });
});

describe("swapAdjacent — Security Phase 19 (prohození sousedních položek)", () => {
  it("posun nahoru prohodí položku se sousedem před ní", () => {
    expect(swapAdjacent(["a", "b", "c"], 1, "up")).toEqual(["b", "a", "c"]);
  });

  it("posun dolů prohodí položku se sousedem za ní", () => {
    expect(swapAdjacent(["a", "b", "c"], 1, "down")).toEqual(["a", "c", "b"]);
  });

  it("první položku nelze posunout výš", () => {
    expect(swapAdjacent(["a", "b", "c"], 0, "up")).toBeNull();
  });

  it("poslední položku nelze posunout níž", () => {
    expect(swapAdjacent(["a", "b", "c"], 2, "down")).toBeNull();
  });

  it("neplatný index vrátí null", () => {
    expect(swapAdjacent(["a", "b"], -1, "up")).toBeNull();
    expect(swapAdjacent(["a", "b"], 5, "up")).toBeNull();
  });

  it("nemění původní pole (čistá funkce)", () => {
    const original = ["a", "b", "c"];
    swapAdjacent(original, 1, "up");
    expect(original).toEqual(["a", "b", "c"]);
  });
});

describe("pragueDateString — Security Phase 19", () => {
  it("vrací formát YYYY-MM-DD", () => {
    expect(pragueDateString(new Date("2026-06-15T10:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("respektuje Europe/Prague posun kolem půlnoci UTC (léto, UTC+2)", () => {
    // 23:30 UTC v létě = 01:30 následujícího dne v Praze
    expect(pragueDateString(new Date("2026-06-15T23:30:00Z"))).toBe("2026-06-16");
  });
});

// Regresní test na chybu nahlášenou na Preview (Vercel error 2923716426):
// zápis výsledku hovoru s "Fázi neměnit" (stageChange=null) a prázdným
// "další kontakt" (nextFollowUpAt=null) skončil serverovou chybou 500.
// Příčina: netypovaný NULL parametr předaný přímo do polymorfní funkce
// jsonb_build_object (VARIADIC "any") — Postgres u ní (na rozdíl od
// COALESCE, kde typ odvodí ze sloupce vedle sebe) nemá z čeho typ
// odvodit a skončí chybou "could not determine data type of parameter".
// Test sestaví dotaz přes buildLogDailyCallOutcomeQuery PŘESNĚ s touhle
// kombinací a zkompiluje ho přes PgDialect().sqlToQuery() (funguje bez
// databáze, viz drizzle-orm/pg-core) — ověřuje, že vygenerované SQL má
// explicitní `::text`/`::timestamptz` cast na KAŽDÉM parametru uvnitř
// jsonb_build_object, takže typová chyba nemůže nastat bez ohledu na to,
// jestli jsou stageChange/nextFollowUpAt null nebo ne.
describe("buildLogDailyCallOutcomeQuery — regrese Preview chyby 2923716426", () => {
  const dialect = new PgDialect();

  function compile(stageChange: string | null, nextFollowUpAt: Date | null) {
    const query = buildLogDailyCallOutcomeQuery({
      itemId: "11111111-1111-1111-1111-111111111111",
      leadId: "22222222-2222-2222-2222-222222222222",
      authorUserId: "06240ac4-c050-47ea-998c-6c81389edf9f",
      authorName: "Jaroslav Blahout",
      activityId: "33333333-3333-3333-3333-333333333333",
      note: "Test Preview – nedovoláno",
      stageChange,
      nextFollowUpAt,
      result: "no_answer",
    });
    return dialect.sqlToQuery(query);
  }

  it("reprodukuje přesně nahlášenou kombinaci (fázi neměnit + prázdné další kontakt) beze zpádu na netypovaný NULL", () => {
    const { sql, params } = compile(null, null);
    // jsonb_build_object dostává 4 páry klíč/hodnota — každá hodnota musí
    // mít explicitní cast hned za svým placeholderem, jinak je netypovaná.
    // Nutné zachytit obsah NEgreedy až k UZAVÍRACÍ závorce jsonb_build_object
    // samotné, ne k první "(" uvnitř (ta patří vnořenému podvýrazu
    // `(SELECT stage FROM old_lead)`) — proto match až po `,\n      now()`.
    const jsonbArgsMatch = sql.match(/jsonb_build_object\(([\s\S]*?)\),\s*now\(\)/);
    expect(jsonbArgsMatch).not.toBeNull();
    const jsonbArgs = jsonbArgsMatch![1];
    expect(jsonbArgs).toMatch(/\$\d+::text/); // stageChangedTo
    expect(jsonbArgs).toMatch(/\$\d+::timestamptz/); // nextFollowUpAt
    expect(jsonbArgs).toMatch(/\$\d+::text/); // callResult
    // Žádný placeholder uvnitř jsonb_build_object nesmí zůstat bez castu.
    // Pozor: `\$\d+(?!::)` jako jediný regex by si u vícemístných čísel
    // (např. $13) kvůli zpětnému sledování mohl odtrhnout jen "$1" a
    // zbytek "3::text" vyhodnotit jako "bez castu" — proto se tu každý
    // placeholder nejdřív najde celý přes matchAll a cast se ověřuje podle
    // jeho SKUTEČNÉ pozice a délky, ne podle textového hledání podřetězce.
    for (const match of jsonbArgs.matchAll(/\$\d+/g)) {
      const after = jsonbArgs.slice(match.index + match[0].length);
      expect(after.startsWith("::")).toBe(true);
    }
    // Reálná hodnota parametrů je null — přesně kombinace z hlášené chyby.
    expect(params).toContain(null);
  });

  it("COALESCE pro stage má explicitní cast ('Fázi neměnit' = skutečně neměnit)", () => {
    const { sql } = compile(null, null);
    expect(sql).toMatch(/COALESCE\(\$\d+::text, stage\)/);
  });

  it("stejná struktura platí i s vyplněnou fází a termínem (nejde o větev jen pro null)", () => {
    const { sql } = compile("contacted", new Date("2026-10-05T12:00:00.000Z"));
    const jsonbArgs = sql.match(/jsonb_build_object\(([\s\S]*?)\),\s*now\(\)/)![1];
    expect(jsonbArgs).toMatch(/\$\d+::text/);
    expect(jsonbArgs).toMatch(/\$\d+::timestamptz/);
  });
});

// Security Phase 20 (Google Kalendář 1.0) — regresní test dokazující, že
// next_follow_up_at se nastavuje PŘÍMO (::timestamptz), NE přes COALESCE.
// Bug: "jiný výsledek při vyřizování dříve naplánovaného kontaktu" by s
// COALESCE znamenalo "ponechat starý termín" místo "smazat ho" — přesně
// opak toho, co má nastat, když hovor proběhl a žádný nový termín se
// nenaplánoval. next_follow_up_at je proto v Denním volání VŽDY binární
// rozhodnutí (nastavit, nebo explicitně smazat), nikdy "neřešeno".
describe("buildLogDailyCallOutcomeQuery — next_follow_up_at se skutečně maže, ne jen zachová (Security Phase 20)", () => {
  const dialect = new PgDialect();

  function compile(nextFollowUpAt: Date | null) {
    const query = buildLogDailyCallOutcomeQuery({
      itemId: "11111111-1111-1111-1111-111111111111",
      leadId: "22222222-2222-2222-2222-222222222222",
      authorUserId: "06240ac4-c050-47ea-998c-6c81389edf9f",
      authorName: "Jaroslav Blahout",
      activityId: "33333333-3333-3333-3333-333333333333",
      note: "Dovoláno, bez zájmu.",
      stageChange: null,
      nextFollowUpAt,
      result: "reached_not_interested",
    });
    return dialect.sqlToQuery(query);
  }

  it("next_follow_up_at = $N::timestamptz PŘÍMO, žádné COALESCE kolem něj", () => {
    const { sql } = compile(null);
    expect(sql).toMatch(/next_follow_up_at = \$\d+::timestamptz/);
    expect(sql).not.toMatch(/COALESCE\([^)]*next_follow_up_at/);
  });

  it("při nextFollowUpAt=null je skutečná hodnota parametru null (SQL NULL), ne vynechaná", () => {
    const { params } = compile(null);
    expect(params).toContain(null);
  });

  it("při vyplněném nextFollowUpAt se stejná přímá cesta použije i pro nastavení (ne jen pro mazání)", () => {
    const value = new Date("2026-10-05T10:00:00.000Z");
    const { sql, params } = compile(value);
    expect(sql).toMatch(/next_follow_up_at = \$\d+::timestamptz/);
    expect(params).toContain(value);
  });

  it("upsert do lead_calendar_sync na 'pending' je součástí TÉŽE atomické operace", () => {
    const { sql } = compile(null);
    expect(sql).toMatch(/INSERT INTO lead_calendar_sync/);
    expect(sql).toMatch(/ON CONFLICT \(lead_id\) DO UPDATE SET sync_status = 'pending'/);
  });
});

// Security Phase 21 (Denní volání 1.1) — resulting_activity_id musí vznikat
// VÝHRADNĚ uvnitř `claimed`, tedy přesně v tom samém UPDATU, co je jediný
// gate celého příkazu. Žádný test tady neběží proti databázi (stejná
// konvence jako testy výše — PgDialect().sqlToQuery() funguje čistě na
// zkompilovaném SQL textu), ale struktura dotazu sama dokazuje, že:
//   - prohraný/souběžný claim (0 řádků v `claimed`) znemožní jak
//     resulting_activity_id tak INSERT do lead_activity (oba jsou součástí
//     stejného UPDATE/gate), takže osiřelá aktivita nemůže vzniknout;
//   - dvě různá vyřízení (různé itemId/activityId na stejném leadu) si
//     nikdy nepřepíšou/nespletou vazbu, protože každé volání funkce
//     sestaví ÚPLNĚ NOVÝ, nezávislý dotaz se svými vlastními parametry.
describe("buildLogDailyCallOutcomeQuery — resulting_activity_id (Security Phase 21)", () => {
  const dialect = new PgDialect();

  function compile(itemId: string, leadId: string, activityId: string) {
    const query = buildLogDailyCallOutcomeQuery({
      itemId,
      leadId,
      authorUserId: "06240ac4-c050-47ea-998c-6c81389edf9f",
      authorName: "Jaroslav Blahout",
      activityId,
      note: "Test",
      stageChange: null,
      nextFollowUpAt: null,
      result: "no_answer",
    });
    return dialect.sqlToQuery(query);
  }

  it("resulting_activity_id se nastavuje PŘÍMO uvnitř claimed CTE, ne mimo něj", () => {
    const { sql } = compile(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "33333333-3333-3333-3333-333333333333"
    );
    const claimedMatch = sql.match(/claimed AS \(([\s\S]*?)\),\s*lead_upd AS/);
    expect(claimedMatch).not.toBeNull();
    const claimedSql = claimedMatch![1];
    expect(claimedSql).toMatch(/resulting_activity_id = \$\d+/);
    // Jediný gate zůstává WHERE status='pending' — beze změny.
    expect(claimedSql).toMatch(/WHERE id = \$\d+ AND status = 'pending' AND lead_id = \$\d+/);
  });

  it("INSERT do lead_activity zůstává gatovaný WHERE EXISTS (SELECT 1 FROM claimed) i po přidání vazby", () => {
    const { sql } = compile(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "33333333-3333-3333-3333-333333333333"
    );
    expect(sql).toMatch(/INSERT INTO lead_activity[\s\S]*WHERE EXISTS \(SELECT 1 FROM claimed\)/);
  });

  it("stejný activityId je parametrem jak pro resulting_activity_id, tak pro id vkládané aktivity", () => {
    const activityId = "33333333-3333-3333-3333-333333333333";
    const { params } = compile("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", activityId);
    expect(params.filter((p) => p === activityId).length).toBeGreaterThanOrEqual(2);
  });

  it("dvě vyřízení stejného leada (různé itemId/activityId) vytvoří dva nezávislé dotazy bez křížení parametrů", () => {
    const leadId = "22222222-2222-2222-2222-222222222222";
    const first = compile("11111111-1111-1111-1111-111111111111", leadId, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const second = compile("44444444-4444-4444-4444-444444444444", leadId, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    expect(first.params).toContain("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(first.params).not.toContain("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(second.params).toContain("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(second.params).not.toContain("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });
});

describe("isRelevantActivityEntry / RELEVANT_ACTIVITY_KINDS (Security Phase 21)", () => {
  it("call_logged se zapsanou poznámkou je relevantní", () => {
    expect(isRelevantActivityEntry({ kind: "call_logged", body: "Slíbil zavolat zpět." })).toBe(true);
  });

  it("created se zapsanou poznámkou (budoucí import) je relevantní", () => {
    expect(isRelevantActivityEntry({ kind: "created", body: "Poznámka z importu." })).toBe(true);
  });

  it("administrativní záznamy (stage_changed, owner_assigned, …) NEJSOU relevantní, i kdyby měly body", () => {
    expect(isRelevantActivityEntry({ kind: "stage_changed", body: "cokoliv" })).toBe(false);
    expect(isRelevantActivityEntry({ kind: "owner_assigned", body: "cokoliv" })).toBe(false);
    expect(isRelevantActivityEntry({ kind: "acquired_by_set", body: "cokoliv" })).toBe(false);
    expect(isRelevantActivityEntry({ kind: "converted", body: "cokoliv" })).toBe(false);
    expect(isRelevantActivityEntry({ kind: "company_name_set", body: "cokoliv" })).toBe(false);
    expect(isRelevantActivityEntry({ kind: "follow_up_removed", body: "cokoliv" })).toBe(false);
  });

  it("relevantní druh bez textu (body null/prázdné) se nezobrazí — pouhé 'body IS NOT NULL' nestačí ani naopak", () => {
    expect(isRelevantActivityEntry({ kind: "call_logged", body: null })).toBe(false);
    expect(isRelevantActivityEntry({ kind: "call_logged", body: "" })).toBe(false);
    expect(isRelevantActivityEntry({ kind: "call_logged", body: "   " })).toBe(false);
  });

  it("RELEVANT_ACTIVITY_KINDS obsahuje přesně call_logged a created", () => {
    expect(RELEVANT_ACTIVITY_KINDS).toEqual(["call_logged", "created"]);
  });
});

describe("isPragueSameDay (Security Phase 21)", () => {
  it("stejný kalendářní den v Europe/Prague = true", () => {
    expect(isPragueSameDay(new Date("2026-10-07T06:00:00.000Z"), new Date("2026-10-07T20:00:00.000Z"))).toBe(true);
  });

  it("různý kalendářní den = false", () => {
    // 2026-10-08 je ještě CEST (DST v Česku koncí až 25. 10. 2026), tedy
    // UTC+2 — 2026-10-07T23:30 UTC = 2026-10-08T01:30 CEST (už jiný den).
    expect(isPragueSameDay(new Date("2026-10-07T12:00:00.000Z"), new Date("2026-10-07T23:30:00.000Z"))).toBe(false);
  });

  it("půlnoc Europe/Prague kolem letního času (CEST, UTC+2) se počítá správně", () => {
    // 2026-06-07 21:59 UTC = 2026-06-07 23:59 CEST; 2026-06-07 22:01 UTC = 2026-06-08 00:01 CEST.
    expect(isPragueSameDay(new Date("2026-06-07T21:59:00.000Z"), new Date("2026-06-07T22:01:00.000Z"))).toBe(false);
  });

  it("půlnoc Europe/Prague kolem zimního času (CET, UTC+1) se počítá správně", () => {
    // 2026-01-07T22:59 UTC = 2026-01-07T23:59 CET; 2026-01-07T23:01 UTC = 2026-01-08T00:01 CET.
    expect(isPragueSameDay(new Date("2026-01-07T22:59:00.000Z"), new Date("2026-01-07T23:01:00.000Z"))).toBe(false);
  });
});
