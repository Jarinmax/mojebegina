// Jarda – volání a provize, část 1: kontakty a jednotná historie hovorů.
//
// Skutečný zápis přes ovladač Neonu (neon-http, db.batch = jedna
// transakce) napojený na PGlite se všemi migracemi — stejný harness jako
// lib/eshop/__tests__/orderWrite.test.ts. Na rozdíl od mock-transport testů
// (vi.mock("@neondatabase/serverless")) tohle ověřuje REÁLNÉ Postgres
// chování (CHECK constrainty, partial unique indexy) kolem opravy bodu 3
// (jedna společná historie leadu/fronty) — mock transport by takovou chybu
// (např. porušení daily_call_queue_done_implies_published_check) neodhalil,
// jen by předstíral úspěch podle toho, co si sám nastaví.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { AuthContext } from "../types";

vi.mock("server-only", () => ({}));
// admin.ts a userProfiles.ts (oba v závislostním stromu leads.ts) mají
// VLASTNÍ statický import `auth` z "@/lib/auth/server" (nezávisle na
// authContext.ts, co se mockuje níž) — ten modul sám staticky importuje
// next/headers, co se mimo Next.js runtime nedá resolvovat. Žádná funkce
// cvičená v týchto testech `auth.*` doopravdy nevolá (getUserProfile/
// getUserProfiles čtou jen lokální user_profiles tabulku) — stub stačí
// jen k tomu, aby statický import nespadl.
vi.mock("@/lib/auth/server", () => ({ auth: {} }));

const ADMIN_CTX: AuthContext = {
  userId: "11111111-1111-1111-1111-111111111111",
  systemRole: "ADMIN",
  grantedRoles: ["ADMIN"],
  roleSelectionRequired: false,
  name: "Jaroslav Viner",
  email: "viner@example.com",
};

// Reálné hardcoded ID z dailyCallsAuth.ts (WORKER_USER_IDS) — requireDaily-
// CallWorkerAccess/requireDailyCallCuratorAccess kontrolují KONKRÉTNÍ
// userId, ne jen roli, takže je pro testy logDailyCallOutcome/getCallHistory
// nutné použít přesně tohle ID (Blahout = worker i curator kandidát, ale
// NENÍ v CURATOR_USER_IDS, takže vychází jako "worker", ne "curator" — to
// nám pro tenhle test nevadí, obě role mají přístup k getCallHistory).
// Prostý string (ne BLAHOUT_CTX.userId) pro fixture helpery níž — AuthContext
// je `{...} | null`, takže by každé použití vyžadovalo null-check navzdory
// tomu, že je tahle konkrétní konstanta vždycky objekt.
const BLAHOUT_USER_ID = "06240ac4-c050-47ea-998c-6c81389edf9f";
const BLAHOUT_CTX: AuthContext = {
  userId: BLAHOUT_USER_ID,
  systemRole: "EXECUTIVE",
  grantedRoles: ["EXECUTIVE"],
  roleSelectionRequired: false,
  name: "Jaroslav Blahout",
  email: "blahout@example.com",
};

const CUSTOMER_CTX: AuthContext = {
  userId: "22222222-2222-2222-2222-222222222222",
  systemRole: "CUSTOMER",
  grantedRoles: ["CUSTOMER"],
  roleSelectionRequired: false,
  name: "Cizí uživatel",
  email: "cizi@example.com",
};

let mockedCtx: AuthContext = ADMIN_CTX;
vi.mock("../authContext", () => ({ getAuthContext: () => Promise.resolve(mockedCtx) }));

describe("Jarda – volání a provize, část 1: jednotná historie hovorů (reálná DB, PGlite)", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let leads: typeof import("../../db/schema").leads;
  let logCallOutcome: typeof import("../leads").logCallOutcome;
  let getLeadDetail: typeof import("../leads").getLeadDetail;
  let listLeads: typeof import("../leads").listLeads;
  let updateLeadContactEmail: typeof import("../leads").updateLeadContactEmail;
  let logDailyCallOutcome: typeof import("../dailyCalls").logDailyCallOutcome;
  let getCallHistory: typeof import("../dailyCalls").getCallHistory;

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("../../db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    leads = schema.leads;

    // lib/db/client.ts exportuje `db` sestavený ze stejného neon()/drizzle()
    // volání — vi.mock ho nahradí INSTANCÍ napojenou na PGlite (přes
    // zdola přesměrovaný fetch), aby ji leads.ts/dailyCalls.ts (import
    // "@/lib/db/client") používaly beze zbytečné druhé konfigurace.
    vi.doMock("@/lib/db/client", () => ({ db }));

    const leadsModule = await import("../leads");
    logCallOutcome = leadsModule.logCallOutcome;
    getLeadDetail = leadsModule.getLeadDetail;
    listLeads = leadsModule.listLeads;
    updateLeadContactEmail = leadsModule.updateLeadContactEmail;

    const dailyCallsModule = await import("../dailyCalls");
    logDailyCallOutcome = dailyCallsModule.logDailyCallOutcome;
    getCallHistory = dailyCallsModule.getCallHistory;
  }, 60_000);

  beforeEach(() => {
    mockedCtx = ADMIN_CTX;
  });

  const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;

  async function insertLead(id: string, overrides: Partial<{ ownerUserId: string }> = {}) {
    await db.insert(leads).values({
      id,
      companyName: "U Kotvy s.r.o.",
      contactName: "Jana Nováková",
      contactPhone: "+420777123456",
      source: "inbound",
      ownerUserId: overrides.ownerUserId ?? null,
    });
  }

  // `position` má partial unique index (WHERE status='pending') — PGlite
  // instance žije po celý describe blok (sdílený stav mezi testy, stejná
  // konvence jako orderWrite.test.ts), takže KAŽDÉ volání potřebuje
  // vlastní, nikdy opakovanou hodnotu. Čítač místo literálu 0 na každém
  // volajícím místě.
  let nextQueuePosition = 0;
  async function insertPendingQueueItem(id: string, leadId: string, opts: { published: boolean }) {
    const position = nextQueuePosition++;
    await db.execute(sql`
      INSERT INTO daily_call_queue (id, lead_id, "position", status, source, added_by, added_for_date, published_at, published_by)
      VALUES (${id}, ${leadId}, ${position}, 'pending', 'manual', ${BLAHOUT_USER_ID},
              (now() AT TIME ZONE 'Europe/Prague')::date,
              ${opts.published ? sql`now()` : sql`NULL`}, ${opts.published ? BLAHOUT_USER_ID : null})
    `);
  }

  // --- Bod 3 / povinný test 6: "hovor z Všechny leady aktualizuje dnešní plán" ---
  it("logCallOutcome (Všechny leady) zavře odpovídající PUBLIKOVANOU položku Dnešní volání ve STEJNÉM zápisu", async () => {
    const leadId = "33333333-3333-3333-3333-333333333333";
    const itemId = "44444444-4444-4444-4444-444444444444";
    await insertLead(leadId);
    await insertPendingQueueItem(itemId, leadId, { published: true });

    const result = await logCallOutcome(leadId, {
      result: "reached_interested",
      note: "Zájem, poslat vzorek.",
      nextStage: "",
      nextFollowUpAt: "",
      nextStepNote: "",
    });
    expect(result).toEqual({ ok: true });

    expect(await rows(sql`SELECT status, done_by IS NOT NULL AS has_done_by, done_at IS NOT NULL AS has_done_at FROM daily_call_queue WHERE id = ${itemId}`)).toEqual([
      { status: "done", has_done_by: true, has_done_at: true },
    ]);
    expect(await rows(sql`SELECT count(*)::int AS n FROM lead_activity WHERE lead_id = ${leadId} AND kind = 'call_logged'`)).toEqual([{ n: 1 }]);
  });

  it("logCallOutcome na leadu s NEPUBLIKOVANÝM (draft) čekajícím návrhem fronty nezhroutí zápis a draft nechá beze změny", async () => {
    const leadId = "55555555-5555-5555-5555-555555555555";
    const itemId = "66666666-6666-6666-6666-666666666666";
    await insertLead(leadId);
    await insertPendingQueueItem(itemId, leadId, { published: false });

    const result = await logCallOutcome(leadId, {
      result: "call_back_later",
      note: "Zkusím znovu zítra.",
      nextStage: "",
      nextFollowUpAt: "2026-12-15",
      nextStepNote: "",
    });
    expect(result).toEqual({ ok: true });

    // CHECK daily_call_queue_done_implies_published_check by zápis shodil,
    // kdyby appka draft omylem zkusila zavřít — zůstává tedy beze změny.
    expect(await rows(sql`SELECT status, published_at IS NULL AS unpublished FROM daily_call_queue WHERE id = ${itemId}`)).toEqual([
      { status: "pending", unpublished: true },
    ]);
  });

  it("logCallOutcome na leadu BEZ položky ve frontě jen zapíše aktivitu, nic jiného", async () => {
    const leadId = "77777777-7777-7777-7777-777777777777";
    await insertLead(leadId);

    const result = await logCallOutcome(leadId, {
      result: "reached_not_interested",
      note: "Nemá zájem.",
      nextStage: "not_interested",
      nextFollowUpAt: "",
      nextStepNote: "",
    });
    expect(result).toEqual({ ok: true });
    expect(await rows(sql`SELECT stage FROM leads WHERE id = ${leadId}`)).toEqual([{ stage: "not_interested" }]);
  });

  // --- Povinný test 7: "hovor z Dnešního volání aktualizuje Všechny leady a detail" ---
  it("logDailyCallOutcome (Dnešní volání) se projeví v getLeadDetail a listLeads (stejná data, stejný lead_id)", async () => {
    const leadId = "88888888-8888-8888-8888-888888888888";
    const itemId = "99999999-9999-9999-9999-999999999999";
    await insertLead(leadId, { ownerUserId: BLAHOUT_USER_ID });
    await insertPendingQueueItem(itemId, leadId, { published: true });

    mockedCtx = BLAHOUT_CTX;
    const result = await logDailyCallOutcome(itemId, {
      result: "reached_interested",
      note: "Chce nabídku.",
      nextStage: "interested",
      nextFollowUpAt: "",
      nextStepNote: "",
    });
    expect(result).toEqual({ ok: true, leadId });

    mockedCtx = ADMIN_CTX;
    const detail = await getLeadDetail(leadId);
    expect(detail?.lead.stage).toBe("interested");
    expect(detail?.activity.some((a) => a.kind === "call_logged" && a.body === "Chce nabídku.")).toBe(true);

    const all = await listLeads("all");
    expect(all.find((l) => l.id === leadId)?.stage).toBe("interested");
  });

  // --- Povinný test 8: "druhé načtení nevytvoří duplicitu" ---
  it("opakované čtení (getLeadDetail, listLeads) je čistě čtecí — druhé načtení nevytvoří žádný nový řádek", async () => {
    const leadId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    await insertLead(leadId);
    await logCallOutcome(leadId, {
      result: "reached_interested",
      note: "První hovor.",
      nextStage: "",
      nextFollowUpAt: "",
      nextStepNote: "",
    });

    await getLeadDetail(leadId);
    await getLeadDetail(leadId);
    await listLeads("all");
    await listLeads("all");

    expect(await rows(sql`SELECT count(*)::int AS n FROM lead_activity WHERE lead_id = ${leadId}`)).toEqual([{ n: 1 }]);
  });

  // --- Povinný test 5: "neoprávněný uživatel cizí lead neupraví" ---
  it("uživatel bez CRM role (requireCrmContext) nemůže zapsat hovor ani přidat e-mail — server to ověří, nevěří jen leadId", async () => {
    const leadId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    await insertLead(leadId);

    mockedCtx = CUSTOMER_CTX;
    await expect(
      logCallOutcome(leadId, { result: "reached_interested", note: "x", nextStage: "", nextFollowUpAt: "", nextStepNote: "" })
    ).rejects.toThrow();
    await expect(updateLeadContactEmail(leadId, "nove@example.com")).rejects.toThrow();

    mockedCtx = null;
    await expect(updateLeadContactEmail(leadId, "nove@example.com")).rejects.toThrow();

    // Nic se nezapsalo.
    expect(await rows(sql`SELECT contact_email FROM leads WHERE id = ${leadId}`)).toEqual([{ contact_email: null }]);
    expect(await rows(sql`SELECT count(*)::int AS n FROM lead_activity WHERE lead_id = ${leadId}`)).toEqual([{ n: 0 }]);
  });

  // --- Bod 1: e-mail se skutečně uloží a je vidět bez detailu ---
  it("updateLeadContactEmail uloží platný e-mail a zapíše auditní aktivitu", async () => {
    const leadId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    await insertLead(leadId);

    const result = await updateLeadContactEmail(leadId, "jana@ukotvy.cz");
    expect(result).toEqual({ ok: true });
    expect(await rows(sql`SELECT contact_email FROM leads WHERE id = ${leadId}`)).toEqual([{ contact_email: "jana@ukotvy.cz" }]);
    expect(await rows(sql`SELECT kind FROM lead_activity WHERE lead_id = ${leadId}`)).toEqual([{ kind: "contact_email_set" }]);
  });

  // --- Bod 2: Historie volání — od nejnovějšího, napříč oběma cestami zápisu ---
  it("getCallHistory zobrazí hovory z OBOU cest zápisu, od nejnovějšího, s kontaktem/telefonem/e-mailem/výsledkem/poznámkou/dalším krokem", async () => {
    const leadA = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    const leadB = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    const itemB = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    await insertLead(leadA);
    await db.update(leads).set({ contactEmail: "a@example.com" }).where(sql`id = ${leadA}`);
    await insertLead(leadB);
    await db.update(leads).set({ contactEmail: "b@example.com" }).where(sql`id = ${leadB}`);
    await insertPendingQueueItem(itemB, leadB, { published: true });

    // Starší záznam (leadA, "Všechny leady").
    await logCallOutcome(leadA, {
      result: "call_back_later",
      note: "Poznámka A.",
      nextStage: "",
      nextFollowUpAt: "2026-12-01",
      nextStepNote: "Poslat vzorek",
    });

    // Novější záznam (leadB, "Dnešní volání").
    mockedCtx = BLAHOUT_CTX;
    await logDailyCallOutcome(itemB, {
      result: "reached_interested",
      note: "Poznámka B.",
      nextStage: "",
      nextFollowUpAt: "",
      nextStepNote: "",
    });

    // getCallHistory je gatovaná requireDailyCallAccess (curator/worker
    // allowlist konkrétních userId, ne jen role ADMIN/EXECUTIVE) — ADMIN_CTX
    // (synteticé ID) by tu neprošla, proto zůstává BLAHOUT_CTX (reálné
    // hardcoded ID z dailyCallsAuth.ts). Oba zápisy právě proběhly →
    // "today" filtr (výchozí) je oba musí zahrnout.
    const { entries: history } = await getCallHistory("today");
    const entryB = history.find((e) => e.leadId === leadB);
    const entryA = history.find((e) => e.leadId === leadA);
    expect(entryB).toBeTruthy();
    expect(entryA).toBeTruthy();
    // Novější (B) musí být PŘED starším (A) — "od nejnovějšího".
    expect(history.indexOf(entryB!)).toBeLessThan(history.indexOf(entryA!));

    // Oba záznamy mají VÝSLEDEK bez ohledu na to, odkud byly zapsané — Jarda
    // – volání a provize, část 1, bod 2 doplňku ("Jednotný zápis výsledku
    // hovoru"): "Všechny leady" teď sbírá výsledek stejně jako "Dnešní
    // volání", žádné "Výsledek neuveden".
    expect(entryB).toMatchObject({ contactEmail: "b@example.com", callResult: "reached_interested", note: "Poznámka B." });
    expect(entryA).toMatchObject({
      contactEmail: "a@example.com",
      callResult: "call_back_later",
      note: "Poznámka A.",
      nextStepNote: "Poslat vzorek",
    });
    expect(entryA!.nextFollowUpAt).toBeInstanceOf(Date);
  });

  // --- Doplněk k bodu 1: "zápis stejného výsledku z obou obrazovek" ---
  it("logCallOutcome a logDailyCallOutcome se stejným vstupem zapíší BITOVĚ stejný tvar aktivity (stejný kind, stejné klíče metadat)", async () => {
    const leadX = "11111111-aaaa-aaaa-aaaa-111111111111";
    const leadY = "22222222-aaaa-aaaa-aaaa-222222222222";
    const itemY = "33333333-aaaa-aaaa-aaaa-333333333333";
    await insertLead(leadX);
    await insertLead(leadY, { ownerUserId: BLAHOUT_USER_ID });
    await insertPendingQueueItem(itemY, leadY, { published: true });

    const input = {
      result: "reached_interested" as const,
      note: "Shodný text poznámky.",
      nextStage: "interested",
      nextFollowUpAt: "2026-11-20",
      nextStepNote: "Poslat nabídku.",
    };

    await logCallOutcome(leadX, input);
    mockedCtx = BLAHOUT_CTX;
    await logDailyCallOutcome(itemY, input);
    mockedCtx = ADMIN_CTX;

    const [activityX] = await rows(
      sql`SELECT kind, body, metadata FROM lead_activity WHERE lead_id = ${leadX} AND kind = 'call_logged'`
    );
    const [activityY] = await rows(
      sql`SELECT kind, body, metadata FROM lead_activity WHERE lead_id = ${leadY} AND kind = 'call_logged'`
    );

    expect(activityX.kind).toBe("call_logged");
    expect(activityY.kind).toBe("call_logged");
    expect(activityX.body).toBe(activityY.body);
    // Stejné klíče i hodnoty v metadatech (from se liší jen tím, že leadY
    // má jiný počáteční stage, ale stageChangedTo/nextFollowUpAt/
    // nextStepNote/callResult musí sedět přesně).
    const metaX = activityX.metadata as Record<string, unknown>;
    const metaY = activityY.metadata as Record<string, unknown>;
    expect(Object.keys(metaX).sort()).toEqual(Object.keys(metaY).sort());
    expect(metaX.stageChangedTo).toBe(metaY.stageChangedTo);
    expect(metaX.nextStepNote).toBe(metaY.nextStepNote);
    expect(metaX.callResult).toBe(metaY.callResult);
    // Stejný OKAMŽIK, ne nutně stejný textový tvar — logCallOutcome
    // serializuje nextFollowUpAt přes JS Date.toISOString() (".000Z"),
    // zatímco buildLogDailyCallOutcomeQuery ho necháva vytvořit přímo
    // Postgresem (::timestamptz → text, "+00:00") — obojí je platný
    // RFC 3339 tvar téhož okamžiku a readMetadataDate (dailyCalls.ts) oba
    // correctně naparsuje přes `new Date(...)`, takže appce na textovém
    // rozdílu nezáleží.
    expect(new Date(metaX.nextFollowUpAt as string).getTime()).toBe(new Date(metaY.nextFollowUpAt as string).getTime());
  });

  // --- Doplněk k bodu 1: "výsledek, poznámka a termín se zobrazí shodně
  // ve frontě, historii i detailu" ---
  it("výsledek/poznámka/termín jsou shodné v getWorkerQueueView (lastNote), getCallHistory a getLeadDetail", async () => {
    const leadId = "44444444-bbbb-bbbb-bbbb-444444444444";
    const firstItemId = "55555555-bbbb-bbbb-bbbb-555555555555";
    const secondItemId = "66666666-bbbb-bbbb-bbbb-666666666666";
    await insertLead(leadId, { ownerUserId: BLAHOUT_USER_ID });
    await insertPendingQueueItem(firstItemId, leadId, { published: true });

    mockedCtx = BLAHOUT_CTX;
    await logDailyCallOutcome(firstItemId, {
      result: "call_back_later",
      note: "Chce zavolat zítra ráno.",
      nextStage: "",
      nextFollowUpAt: "2026-11-21",
      nextStepNote: "Připravit ceník.",
    });

    // Lead se mezitím znovu objeví v plánu (nová položka fronty) — karta má
    // v tu chvíli ukazovat STEJNOU poslední poznámku jako historie/detail,
    // ne nic jiného a ne nic staršího.
    await insertPendingQueueItem(secondItemId, leadId, { published: true });

    const { getWorkerQueueView } = await import("../dailyCalls");
    const queueView = await getWorkerQueueView();
    const queueCard = [...queueView.carriedOver, ...queueView.today].find((c) => c.leadId === leadId);
    expect(queueCard?.lastNote).toBe("Chce zavolat zítra ráno.");

    const { entries: history } = await getCallHistory("today");
    const historyEntry = history.find((e) => e.leadId === leadId);
    expect(historyEntry).toMatchObject({
      callResult: "call_back_later",
      note: "Chce zavolat zítra ráno.",
      nextStepNote: "Připravit ceník.",
    });
    expect(historyEntry!.nextFollowUpAt?.toISOString()).toBe("2026-11-21T12:00:00.000Z");

    mockedCtx = ADMIN_CTX;
    const detail = await getLeadDetail(leadId);
    const detailEntry = detail!.activity.find((a) => a.kind === "call_logged");
    expect(detailEntry!.body).toBe("Chce zavolat zítra ráno.");
    const detailMeta = detailEntry!.metadata as Record<string, unknown>;
    expect(detailMeta.callResult).toBe("call_back_later");
    expect(detailMeta.nextStepNote).toBe("Připravit ceník.");
  });

  // --- Povinný test: "filtry Dnes/Včera respektují české časové pásmo a
  // přechod přes půlnoc" ---
  it("Dnes/Včera počítají hranici podle PRAŽSKÉ půlnoci, ne podle syrového UTC data", async () => {
    const leadId = "77777777-cccc-cccc-cccc-777777777777";
    await insertLead(leadId);

    // Přesně pražská půlnoc dneška jako SKUTEČNÝ okamžik (ne naivní
    // timestamp) — v UTC je to 22:00 nebo 23:00 PŘEDCHOZÍHO UTC dne (CEST/
    // CET). Naivní "oříznutí UTC data" by tenhle záznam o minutu POZDĚJI
    // (reálně už dnešní v Praze) omylem zařadilo do "včera", a záznam o
    // minutu DŘÍVE (reálně ještě včerejší v Praze) do "dnes" — přesně ten
    // bug, co má tenhle test odhalit, kdyby appka filtrovala naivně.
    await db.execute(sql`
      INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata, created_at)
      VALUES
        (${leadId}, ${ADMIN_CTX.userId}, ${ADMIN_CTX.name}, 'call_logged', 'Minutu po pražské půlnoci — dnes', '{}'::jsonb,
          (((now() AT TIME ZONE 'Europe/Prague')::date)::timestamp AT TIME ZONE 'Europe/Prague') + interval '1 minute'),
        (${leadId}, ${ADMIN_CTX.userId}, ${ADMIN_CTX.name}, 'call_logged', 'Minutu před pražskou půlnocí — včera', '{}'::jsonb,
          (((now() AT TIME ZONE 'Europe/Prague')::date)::timestamp AT TIME ZONE 'Europe/Prague') - interval '1 minute')
    `);

    mockedCtx = BLAHOUT_CTX;
    const { entries: todayEntries } = await getCallHistory("today");
    const { entries: yesterdayEntries } = await getCallHistory("yesterday");

    expect(todayEntries.some((e) => e.note === "Minutu po pražské půlnoci — dnes")).toBe(true);
    expect(todayEntries.some((e) => e.note === "Minutu před pražskou půlnocí — včera")).toBe(false);
    expect(yesterdayEntries.some((e) => e.note === "Minutu před pražskou půlnocí — včera")).toBe(true);
    expect(yesterdayEntries.some((e) => e.note === "Minutu po pražské půlnoci — dnes")).toBe(false);
  });

  // --- Povinný test: "více než 50 záznamů neschová starší historii" ---
  it("přes 50 novějších záznamů nezpůsobí, že starší (ale pořád v posledních 7 dnech) hovor zmizí — je dostupný přes stránkování", async () => {
    const leadId = "88888888-dddd-dddd-dddd-888888888888";
    await insertLead(leadId);

    // Jeden, zřetelně NEJSTARŠÍ záznam (včera), pak 55 novějších (dnes) —
    // dohromady přes CALL_HISTORY_PAGE_SIZE (50). Appka ho nesmí jen
    // potichu oříznout.
    await db.execute(sql`
      INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata, created_at)
      VALUES (${leadId}, ${ADMIN_CTX.userId}, ${ADMIN_CTX.name}, 'call_logged', 'Nejstarší — včerejší hovor', '{}'::jsonb,
        (((now() AT TIME ZONE 'Europe/Prague')::date)::timestamp AT TIME ZONE 'Europe/Prague') - interval '1 hour')
    `);
    for (let i = 0; i < 55; i += 1) {
      await db.execute(sql`
        INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata, created_at)
        VALUES (${leadId}, ${ADMIN_CTX.userId}, ${ADMIN_CTX.name}, 'call_logged', ${`Dnešní hovor ${i}`}, '{}'::jsonb, now())
      `);
    }

    mockedCtx = BLAHOUT_CTX;
    const page1 = await getCallHistory("last7days", { page: 1 });
    expect(page1.entries).toHaveLength(50);
    expect(page1.hasMore).toBe(true);
    expect(page1.entries.some((e) => e.note === "Nejstarší — včerejší hovor")).toBe(false);

    const page2 = await getCallHistory("last7days", { page: 2 });
    expect(page2.entries.length).toBeGreaterThanOrEqual(1);
    // Nejstarší záznam musí být dostupný na DALŠÍ stránce, ne ztracený jen
    // proto, že přibylo přes 50 novějších.
    const allNotes = [...page1.entries, ...page2.entries].map((e) => e.note);
    expect(allNotes).toContain("Nejstarší — včerejší hovor");
    // A musí tam být přesně JEDNOU, ne víckrát kvůli překryvu stránek.
    expect(allNotes.filter((n) => n === "Nejstarší — včerejší hovor")).toHaveLength(1);
  });
});
