// Denní volání — kontakty s nezájmem se nenavrhují ani nezobrazují
// pracovníkovi (zadání 6. 11. 2026). Nad skutečným Postgresem (ovladač
// Neonu → PGlite se všemi migracemi).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const holder = vi.hoisted(() => ({
  db: null as unknown,
  ctx: null as null | {
    userId: string; systemRole: string; grantedRoles: string[]; roleSelectionRequired: boolean; name: string | null; email: string;
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ get db() { return holder.db; } }));
vi.mock("../authContext", () => ({ getAuthContext: async () => holder.ctx }));
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: null }) } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f";
const asViner = () => (holder.ctx = { userId: VINER, systemRole: "ADMIN", grantedRoles: ["ADMIN"], roleSelectionRequired: false, name: "Jaroslav Viner", email: "v@begina.cz" });
const asBlahout = () => (holder.ctx = { userId: BLAHOUT, systemRole: "EXECUTIVE", grantedRoles: ["EXECUTIVE"], roleSelectionRequired: false, name: "Jaroslav Blahout", email: "b@begina.cz" });

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// Lead → popis; true = nezájem (nesmí se navrhnout ani zobrazit)
const LEADS: [number, string, string, boolean][] = [
  [1, "Aktivní bez hovoru", "new", false],
  [2, "Fáze Nezájem", "not_interested", true],
  [3, "Dovoláno – bez zájmu, fáze zůstala", "contacted", true],
  [4, "Bez zájmu, ale potom zájem", "contacted", false],
  [5, "Bez zájmu, potom ručně změněná fáze", "interested", false],
  // jako v ostrých datech: výsledek „bez zájmu“, fáze u téhož hovoru „Kontaktován“
  [6, "Bez zájmu, u hovoru zvolená fáze Kontaktován", "contacted", true],
  [7, "Jen poznámka „nezájem“ v textu", "contacted", false],
];
const OLD = "2026-09-01T08:00:00Z"; // dávno — 30denní ochrana nehraje roli
const LATER = "2026-09-02T08:00:00Z";

describe("Denní volání — nezájem", { timeout: 120_000 }, () => {
  let dc: typeof import("../dailyCalls");
  let db: import("drizzle-orm/neon-http").NeonHttpDatabase<typeof import("@/lib/db/schema")>;

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    holder.db = db;
    dc = await import("../dailyCalls");
    const values = LEADS.map(([n, name, stage]) =>
      `('${id(n)}', '${name}', '+420 600 000 00${n}', 'existing_database', '${stage}', '${BLAHOUT}', ${n === 1 ? "NULL" : `'${OLD}'`})`
    ).join(",");
    await db.execute(sql.raw(`INSERT INTO leads (id, company_name, contact_phone, source, stage, owner_user_id, last_contacted_at) VALUES ${values}`));
    const call = (n: number, at: string, result: string, stageTo: string | null, body = "pozn.") =>
      `('${id(n)}', '${BLAHOUT}', 'Jaroslav Blahout', 'call_logged', '${body}', '{"callResult":"${result}","stageChangedTo":${stageTo ? `"${stageTo}"` : "null"}}', '${at}')`;
    await db.execute(sql.raw(`INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata, created_at) VALUES
      ${call(3, OLD, "reached_not_interested", null)},
      ${call(4, OLD, "reached_not_interested", null)},
      ${call(4, LATER, "reached_interested", "interested")},
      ${call(6, OLD, "reached_not_interested", "contacted")},
      ${call(7, OLD, "no_answer", null, "kdyžtak označím jako nezájem")},
      ('${id(5)}', '${VINER}', 'Jaroslav Viner', 'call_logged', 'bez zájmu', '{"callResult":"reached_not_interested"}', '${OLD}'),
      ('${id(5)}', '${VINER}', 'Jaroslav Viner', 'stage_changed', NULL, '{"from":"contacted","to":"interested"}', '${LATER}')`));
  });

  const expectedEligible = LEADS.filter(([, , , ni]) => !ni).map(([n]) => id(n)).sort();

  it("ruční nabídka i automatický návrh vynechají kontakty s nezájmem", async () => {
    asViner();
    expect((await dc.listManualCandidateOptions()).map((o) => o.id).sort()).toEqual(expectedEligible);
    // fáze „Nezájem“ už filtrovala i dřív; nově i výsledek hovoru „bez zájmu“
    expect(await dc.addManualCandidate(id(3))).toEqual({ ok: false, error: "Kontakt má zapsaný nezájem — do Denního volání se nepřidává." });
    expect((await dc.addManualCandidate(id(2))).ok).toBe(false);

    expect(await dc.generateDraftCandidates()).toEqual({ ok: true, added: expectedEligible.length });
    const { draft } = await dc.getCuratorQueueView();
    expect(draft.map((c) => c.leadId).sort()).toEqual(expectedEligible);
    expect(draft.every((c) => !c.notInterested)).toBe(true);
  });

  it("nezájem zapsaný až po zařazení: pracovník kontakt nevidí, kurátor ho vidí označený", async () => {
    asViner();
    await dc.publishDraft();
    // Jarda zapíše „bez zájmu“ u leadu 1 jinou cestou (detail kontaktu) — položka zůstala ve frontě
    await db.execute(sql.raw(`INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata, created_at)
      VALUES ('${id(1)}', '${BLAHOUT}', 'Jaroslav Blahout', 'call_logged', 'nechce', '{"callResult":"reached_not_interested","stageChangedTo":null}', now())`));
    const curator = await dc.getCuratorQueueView();
    expect(curator.published.find((c) => c.leadId === id(1))?.notInterested).toBe(true);

    asBlahout();
    const worker = await dc.getWorkerQueueView();
    const shown = [...worker.carriedOver, ...worker.today].map((c) => c.leadId);
    expect(shown).not.toContain(id(1));
    expect(shown.sort()).toEqual(expectedEligible.filter((x) => x !== id(1)));
    expect(worker.totalToday).toBe(worker.doneToday + shown.length);
  });
});
