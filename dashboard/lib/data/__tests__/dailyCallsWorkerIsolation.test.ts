// @vitest-environment node
//
// Security Phase 21 (Denní volání 1.1) — post-implementation audit, bod 2.
//
// Dřívější tvrzení "izolace je vynucena konstrukcí" bylo nepřesné v jedné
// věci: dokazovalo jen, že žádné externí leadId/itemId nemůže dotaz
// rozšířit. NEdokazovalo, že `requireDailyCallWorkerContext()` je
// skutečně zavolaný JAKO PRVNÍ věc uvnitř reálné exportované funkce, ani
// co přesně `WHERE` obsahuje (a co ne).
//
// Tenhle test volá SKUTEČNÉ exportované funkce z dailyCalls.ts (ne jen
// samostatně otestovaný allowlist helper) a dokazuje to na SKUTEČNĚ
// zkompilovaném SQL, které by šlo po drátě na Neon:
//   - "server-only" je stubnuté (vi.mock), aby šel modul vůbec importovat
//     mimo Next.js build — stejné omezení, které zbytek test suite řeší
//     tím, že dailyCalls.ts nikdy neimportuje jako hodnotu; tady ho
//     importujeme ÚMYSLNĚ, abychom získali reálnou funkci, ne jen její
//     popis.
//   - `@neondatabase/serverless`'s `neon()` je nahrazené špionem, který
//     zachytí PŘESNĚ to, co by `drizzle-orm/neon-http` poslalo jako
//     tělo HTTP požadavku (sql text + params) — žádná síť, žádná DB,
//     žádné falšování výsledku dotazu nad rámec prázdných řádků.
//   - `getAuthContext` je nahrazený (jediný legitimní mock bod — identita
//     per-request), `googleCalendar.ts` je nahrazený (nesouvisející
//     vedlejší efekt, viz Security Phase 20).
//
// ZÁVĚR, který tenhle test dokazuje (ne jen tvrdí): v současném schématu
// NEEXISTUJE žádný řádkový WHERE, který by vázal daily_call_queue na
// konkrétního workera — `daily_call_queue` nemá sloupec "ownerUserId"
// per worker, jen `addedBy/publishedBy/doneBy/removedBy` (audit trail
// KDO, ne KOMU řádek "patří"). Fronta je podle schváleného produktového
// modelu JEDNA SDÍLENÁ fronta, kterou vidí celá allowlist (Viner i
// Blahout) stejně — to NENÍ mezera, je to schválený model (viz
// dailyCallsAuth.ts komentář). Jediná skutečná hranice je
// requireDailyCallWorkerAccess/requireDailyCallCuratorAccess PŘED every
// dotazem — a přesně TU tenhle test ověřuje na reálné funkci: nepovolený
// uživatel nedostane žádný řádek SQL ven (gate běží dřív, než se vůbec
// sestaví dotaz).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext, SystemRole } from "../types";

vi.mock("server-only", () => ({}));

type CapturedQuery = { sql: string; params: unknown[] };
const capturedQueries: CapturedQuery[] = [];

vi.mock("@neondatabase/serverless", () => ({
  neon: () => (sqlText: string, params: unknown[]) => {
    capturedQueries.push({ sql: sqlText, params });
    return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
  },
}));

// Jediný legitimní mock bod: identita per-request (session/cookies) by
// mimo Next.js request-scope nešla reálně vytvořit. Auth GATE samotný
// (requireDailyCallWorkerAccess/requireDailyCallCuratorAccess) je REÁLNÝ,
// neimportovaný z mocku — jen vstup (ctx) do něj simulujeme.
const mockGetAuthContext = vi.fn<() => Promise<AuthContext>>();
vi.mock("../authContext", () => ({ getAuthContext: () => mockGetAuthContext() }));

// Google Kalendář je nesouvisející vedlejší efekt (Security Phase 20) —
// testy tady cílí na čtecí cesty (getWorkerQueueView/getCuratorQueueView/
// getDoneTodayItems), které ho ani nevolají, ale `dailyCalls.ts` ho
// importuje na top-levelu, takže ho musí jít importovat bez reálné sítě.
vi.mock("../googleCalendar", () => ({ reconcileLeadCalendarEvent: vi.fn() }));

const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f";
const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const STRELEC_FORBIDDEN = "11111111-2222-3333-4444-555555555555"; // EXECUTIVE, ale NE v allowlistu

function ctxFor(userId: string, systemRole: SystemRole): AuthContext {
  return {
    userId,
    systemRole,
    grantedRoles: [systemRole],
    roleSelectionRequired: false,
    name: "Test User",
    email: "test@example.com",
  };
}

beforeEach(() => {
  capturedQueries.length = 0;
});

afterEach(() => {
  vi.resetModules();
});

describe("Worker/curator izolace na SKUTEČNÝCH funkcích dailyCalls.ts (Security Phase 21, bod 2)", () => {
  it("povolený worker (Blahout, EXECUTIVE): getWorkerQueueView() projde a vyšle SQL bez filtru na konkrétního uživatele", async () => {
    mockGetAuthContext.mockResolvedValue(ctxFor(BLAHOUT, "EXECUTIVE"));
    const { getWorkerQueueView } = await import("../dailyCalls");

    const result = await getWorkerQueueView();
    expect(result).toEqual({ carriedOver: [], today: [], doneToday: 0, totalToday: 0, doneTodayItems: [] });

    // Hlavní dotaz na pending/published položky.
    const mainQuery = capturedQueries.find((q) => q.sql.includes('"daily_call_queue"') && q.sql.includes("status"));
    expect(mainQuery).toBeTruthy();
    expect(mainQuery!.sql).toMatch(/"status" = \$\d+/);
    expect(mainQuery!.params).toContain("pending");

    // Dotaz na "Dnes vyřízeno" (raw SQL).
    const doneQuery = capturedQueries.find((q) => q.sql.includes("queueItemId"));
    expect(doneQuery).toBeTruthy();
    expect(doneQuery!.sql).toMatch(/status = 'done'/);

    // KLÍČOVÉ ZJIŠTĚNÍ (ne předpoklad): ŽÁDNÝ z vyslaných dotazů neobsahuje
    // žádnou podmínku vázanou na Blahoutovo userId, added_by, done_by ani
    // owner_user_id — fronta je jedna sdílená, viditelná celé allowlistě
    // stejně. To je schválený model, ne mezera — ale je důležité to umět
    // dokázat, ne jen tvrdit.
    for (const q of capturedQueries) {
      expect(q.sql).not.toMatch(/added_by\s*=/);
      expect(q.sql).not.toMatch(/done_by\s*=/);
      expect(q.sql).not.toMatch(/published_by\s*=/);
      expect(q.params).not.toContain(BLAHOUT);
    }
  });

  it("kurátor (Viner, ADMIN): getCuratorQueueView() projde", async () => {
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER, "ADMIN"));
    const { getCuratorQueueView } = await import("../dailyCalls");

    const result = await getCuratorQueueView();
    expect(result).toEqual({ draft: [], published: [], doneTodayItems: [] });
    expect(capturedQueries.length).toBeGreaterThan(0);
  });

  it("nepovolený uživatel (Střelec, EXECUTIVE mimo allowlist): getWorkerQueueView() vyhodí ForbiddenError a NEVYŠLE ŽÁDNÉ SQL", async () => {
    mockGetAuthContext.mockResolvedValue(ctxFor(STRELEC_FORBIDDEN, "EXECUTIVE"));
    const { getWorkerQueueView } = await import("../dailyCalls");
    const { ForbiddenError } = await import("../errors");

    await expect(getWorkerQueueView()).rejects.toThrow(ForbiddenError);
    // Gate běží PŘED jakýmkoli dotazem — žádný řádek SQL se vůbec nesestavil.
    expect(capturedQueries).toHaveLength(0);
  });

  it("nepovolený uživatel mimo kurátorskou allowlist (Blahout): getCuratorQueueView() vyhodí ForbiddenError a NEVYŠLE ŽÁDNÉ SQL", async () => {
    mockGetAuthContext.mockResolvedValue(ctxFor(BLAHOUT, "EXECUTIVE"));
    const { getCuratorQueueView } = await import("../dailyCalls");
    const { ForbiddenError } = await import("../errors");

    await expect(getCuratorQueueView()).rejects.toThrow(ForbiddenError);
    expect(capturedQueries).toHaveLength(0);
  });

  it("nepřihlášený (ctx=null): getWorkerQueueView() i getDoneTodayItems() vyhodí UnauthenticatedError bez jakéhokoli SQL", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { getWorkerQueueView, getDoneTodayItems } = await import("../dailyCalls");
    const { UnauthenticatedError } = await import("../errors");

    await expect(getWorkerQueueView()).rejects.toThrow(UnauthenticatedError);
    await expect(getDoneTodayItems()).rejects.toThrow(UnauthenticatedError);
    expect(capturedQueries).toHaveLength(0);
  });

  it("getDoneTodayItems() samo o sobě: stejný gate, stejná absence per-uživatelského filtru v SQL", async () => {
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER, "ADMIN"));
    const { getDoneTodayItems } = await import("../dailyCalls");

    const result = await getDoneTodayItems();
    expect(result).toEqual([]);

    expect(capturedQueries).toHaveLength(1);
    const [q] = capturedQueries;
    // Jediný parametr dotazu je čistě dnešní datum/status, NE uživatel.
    expect(q.sql).not.toMatch(/added_by|done_by|published_by|owner_user_id/);
    expect(q.params).not.toContain(VINER);
  });
});

// "Cizí queue položka" jako koncept NEEXISTUJE v současném schématu —
// daily_call_queue nemá sloupec vlastníka per worker (jen audit trail
// KDO akci provedl). Nejbližší reálný ekvivalent, který model umožňuje,
// je test výše: prokázat, že SAMOTNÝ dotaz nikdy neobsahuje podmínku
// vázanou na konkrétního workera, takže by žádná budoucí úprava "jen
// přidat podmínku navíc" nemohla nic rozbít, protože žádná taková
// podmínka dnes neexistuje ani nemá na co se vázat. Pokud produkt v
// budoucnu zavede PER-WORKER fronty (ne jednu sdílenou), bude to
// vyžadovat nový sloupec (např. `assigned_worker_user_id`) a tenhle test
// bude první, co začne padat — a to je žádoucí (regression guard).
describe("Dokumentace mezery (Security Phase 21, bod 2 — explicitní, ne předstíraná izolace)", () => {
  it("daily_call_queue nemá sloupec per-worker ownership — jen audit trail KDO akci provedl", async () => {
    const { dailyCallQueue } = await import("../../db/schema");
    const columnNames = Object.keys(dailyCallQueue);
    expect(columnNames).toEqual(
      expect.arrayContaining(["addedBy", "publishedBy", "doneBy", "removedBy"])
    );
    expect(columnNames).not.toContain("ownerUserId");
    expect(columnNames).not.toContain("assignedWorkerUserId");
  });
});
