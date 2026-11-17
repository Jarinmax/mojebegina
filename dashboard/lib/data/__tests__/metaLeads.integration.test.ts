// Import leadů z formuláře Meta + přiřazení kontaktu bez vlastníka po dovolání
// — nad skutečným Postgresem (ovladač Neonu → PGlite se všemi migracemi).
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
const asBlahout = () => (holder.ctx = { userId: BLAHOUT, systemRole: "EXECUTIVE", grantedRoles: ["EXECUTIVE"], roleSelectionRequired: false, name: "Jaroslav Blahout", email: "b@begina.cz" });
const asViner = () => (holder.ctx = { userId: VINER, systemRole: "ADMIN", grantedRoles: ["ADMIN"], roleSelectionRequired: false, name: "Jaroslav Viner", email: "v@begina.cz" });

const L_LENKA = "00000000-0000-4000-8000-000000000001";

// Přesně tabulka „Bekinka Beginka“ k 16. 11. 2026 (export Mety).
const HEADER = [
  "id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id", "campaign_name", "form_id", "form_name",
  "is_organic", "platform", "jaký_typ_provozovny_máte_?", "kapacita_vašeho_podniku_?", "full name", "email", "phone_number", "city", "lead_status",
];
const row = (id: string, created: string, venue: string, cap: string, name: string, email: string, phone: string, city: string) => [
  id, created, "ag:1", "BEGINA karusel", "as:1", "BEGINA karusel", "c:1", "BEGINA karusel", "f:1", "begina.cz KARUSEL Prosinec",
  "false", "fb", venue, cap, name, email, phone, city, "CREATED",
];
const MAREK = row("l:3188005584924076", "2026-11-14T01:48:35-05:00", "kavárna", "cca 15", "Marek Baroš", "barosmarek123@gmail.com", "p:+420725156602", "Praha");
const LENKA = row("l:2314970179357320", "2026-11-15T14:47:14-05:00", "Kavarna", "20", "Lenka Gruntova", "Legrunt@seznam.cz", "p:+420723485618", "Sušice");

describe("Leady z Mety nad DB", { timeout: 120_000 }, () => {
  let ml: typeof import("../metaLeads");
  let leadsApi: typeof import("../leads");
  let claim: typeof import("../leadClaim");
  let daily: typeof import("../dailyCalls");
  let rows: (q: string) => Promise<Record<string, unknown>[]>;
  let marekId: string;

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    const db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    holder.db = db;
    rows = async (q: string) => (await db.execute(sql.raw(q))).rows as Record<string, unknown>[];
    ml = await import("../metaLeads");
    leadsApi = await import("../leads");
    claim = await import("../leadClaim");
    daily = await import("../dailyCalls");
    // stav jako v produkci: Lenka (formulář v květnu) je už Jardův kontakt
    await rows(`INSERT INTO leads (id, contact_name, contact_phone, contact_email, city, source, stage, owner_user_id) VALUES
      ('${L_LENKA}', 'Lenka Ester', '+420 723 485 618', 'legrunt@seznam.cz', 'Sušice', 'existing_database', 'new', '${BLAHOUT}')`);
  });

  it("nový lead se založí bez vlastníka (zdroj Meta), stávající kontakt jen dostane poznámku", async () => {
    const r = await ml.importMetaLeadValues(holder.db as never, [HEADER, MAREK, LENKA]);
    expect(r).toMatchObject({ status: "ok", rowsRead: 2, alreadyImported: 0, skipped: [] });
    if (r.status !== "ok") throw new Error();
    expect(r.created.map((c) => c.name)).toEqual(["Marek Baroš"]);
    expect(r.matched).toEqual([{ leadId: L_LENKA, name: "Lenka Gruntova" }]);
    marekId = r.created[0].leadId;

    const [marek] = await rows(`SELECT contact_name, contact_phone, contact_email, city, venue_type, source, stage, owner_user_id FROM leads WHERE id = '${marekId}'`);
    expect(marek).toEqual({
      contact_name: "Marek Baroš", contact_phone: "+420 725 156 602", contact_email: "barosmarek123@gmail.com",
      city: "Praha", venue_type: "kavarna", source: "meta", stage: "new", owner_user_id: null,
    });
    const acts = await rows(`SELECT lead_id, kind, author_user_id, body, metadata->>'metaLeadId' AS meta_id FROM lead_activity ORDER BY lead_id`);
    expect(acts).toEqual(
      expect.arrayContaining([
        {
          lead_id: marekId, kind: "created", author_user_id: "system:meta-leady", meta_id: "l:3188005584924076",
          body: "Formulář z Mety vyplněn 14. 11. 2026 v 7:48 (Facebook). provozovna: kavárna, kapacita: cca 15, město: Praha, kampaň: BEGINA karusel, formulář: begina.cz KARUSEL Prosinec.",
        },
        {
          lead_id: L_LENKA, kind: "note_added", author_user_id: "system:meta-leady", meta_id: "l:2314970179357320",
          body: "Znovu se ozval/a přes formulář z Mety. Formulář z Mety vyplněn 15. 11. 2026 v 20:47 (Facebook). provozovna: Kavarna, kapacita: 20, město: Sušice, kampaň: BEGINA karusel, formulář: begina.cz KARUSEL Prosinec.",
        },
      ])
    );
    asBlahout();
    const fresh = await leadsApi.listNewUnassignedLeads();
    expect(fresh.map((l) => [l.displayName, l.isNew, l.source])).toEqual([["Marek Baroš", true, "meta"]]);
    const all = await leadsApi.listLeads("all");
    expect(all[0]).toMatchObject({ displayName: "Marek Baroš", isNew: true }); // nahoře seznamu
    expect(all.find((l) => l.id === L_LENKA)?.isNew).toBe(false);
    const [lenka] = await rows(`SELECT owner_user_id, contact_name FROM leads WHERE id = '${L_LENKA}'`);
    expect(lenka).toEqual({ owner_user_id: BLAHOUT, contact_name: "Lenka Ester" }); // vlastník ani jméno se nemění
  });

  it("opakované načtení nic nezdvojí; stejný člověk dvakrát v nové dávce = jeden kontakt + poznámka", async () => {
    const again = await ml.importMetaLeadValues(holder.db as never, [HEADER, MAREK, LENKA]);
    expect(again).toMatchObject({ status: "ok", created: [], matched: [], alreadyImported: 2 });

    const NEW1 = row("l:9001", "2026-11-16T05:00:00-05:00", "bistro", "40", "Nová Kavárna", "nova@example.cz", "p:+420601000001", "Brno");
    const NEW1_AGAIN = row("l:9002", "2026-11-16T06:00:00-05:00", "bistro", "40", "Nová Kavárna", "nova@example.cz", "p:+420601000001", "Brno");
    const r = await ml.importMetaLeadValues(holder.db as never, [HEADER, MAREK, LENKA, NEW1, NEW1_AGAIN]);
    if (r.status !== "ok") throw new Error();
    expect(r.created.map((c) => c.name)).toEqual(["Nová Kavárna"]);
    expect(r.matched.map((c) => c.leadId)).toEqual([r.created[0].leadId]);
    expect(r.alreadyImported).toBe(2);
    const [{ n }] = await rows(`SELECT count(*)::int AS n FROM leads WHERE contact_email = 'nova@example.cz'`);
    expect(n).toBe(1);
    const [{ m }] = await rows(`SELECT count(*)::int AS m FROM meta_lead_imports`);
    expect(m).toBe(4);
  });

  it("chybný formát tabulky se nahlásí a nic se nezapíše", async () => {
    const r = await ml.importMetaLeadValues(holder.db as never, [["id", "full name"], ["l:1", "X"]]);
    expect(r).toEqual({ status: "error", error: "V hlavičce tabulky chybí sloupce: email, phone." });
  });

  it("bez klíče servisního účtu se import přeskočí (nenastaveno)", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    expect(await ml.importMetaLeads(holder.db as never, {} as NodeJS.ProcessEnv)).toEqual({ status: "not_configured" });
  });

  it("zápis hovoru bez „dovolal/a jsem se“ kontakt nepřiřadí; s ním ano — jen jednou", async () => {
    asBlahout();
    expect(await leadsApi.logCallOutcome(marekId, { note: "nezvedá", nextStage: "", nextFollowUpAtDate: "", nextFollowUpAtTime: "", nextStepNote: "" })).toEqual({ ok: true });
    expect((await rows(`SELECT owner_user_id FROM leads WHERE id = '${marekId}'`))[0].owner_user_id).toBeNull();

    expect(
      await leadsApi.logCallOutcome(marekId, { note: "chce ochutnávku", nextStage: "interested", nextFollowUpAtDate: "", nextFollowUpAtTime: "", nextStepNote: "", reached: true })
    ).toEqual({ ok: true });
    expect((await rows(`SELECT owner_user_id FROM leads WHERE id = '${marekId}'`))[0].owner_user_id).toBe(BLAHOUT);
    const owners = await rows(`SELECT author_user_id, body, metadata->>'reason' AS reason, metadata->>'via' AS via FROM lead_activity WHERE lead_id = '${marekId}' AND kind = 'owner_assigned'`);
    expect(owners).toEqual([
      { author_user_id: BLAHOUT, body: "Kontakt bez vlastníka přiřazen: Jaroslav Blahout — dovolal/a se mu.", reason: "reached_call", via: "lead_detail" },
    ]);

    // kontakt už vlastníka má → další dovolání (i někoho jiného) nic nemění
    asViner();
    expect(await claim.claimUnownedLeadOnReach(marekId, { userId: VINER, name: "Jaroslav Viner" }, "daily_call")).toBe(false);
    expect((await rows(`SELECT owner_user_id FROM leads WHERE id = '${marekId}'`))[0].owner_user_id).toBe(BLAHOUT);
  });

  it("Denní volání: „nezvedá“ kontakt nepřiřadí, „dovoláno“ ano", async () => {
    const [{ id: novaId }] = await rows(`SELECT id FROM leads WHERE contact_email = 'nova@example.cz'`);
    const queue = async (pos: number) =>
      (
        await rows(`INSERT INTO daily_call_queue (lead_id, position, status, source, added_by, added_for_date, published_at, published_by)
          VALUES ('${novaId}', ${pos}, 'pending', 'manual', '${VINER}', '2026-11-16', now(), '${VINER}') RETURNING id`)
      )[0].id as string;
    asBlahout();
    const first = await queue(1);
    expect(await daily.logDailyCallOutcome(first, { result: "no_answer", note: "nezvedá", stageChange: "", nextFollowUpAtDate: "", nextFollowUpAtTime: "" })).toMatchObject({ ok: true });
    expect((await rows(`SELECT owner_user_id FROM leads WHERE id = '${novaId}'`))[0].owner_user_id).toBeNull();

    const second = await queue(2);
    expect(await daily.logDailyCallOutcome(second, { result: "reached_interested", note: "chce vzorky", stageChange: "", nextFollowUpAtDate: "", nextFollowUpAtTime: "" })).toMatchObject({ ok: true });
    expect((await rows(`SELECT owner_user_id FROM leads WHERE id = '${novaId}'`))[0].owner_user_id).toBe(BLAHOUT);
    expect(await rows(`SELECT metadata->>'via' AS via FROM lead_activity WHERE lead_id = '${novaId}' AND kind = 'owner_assigned'`)).toEqual([{ via: "daily_call" }]);
  });
});
