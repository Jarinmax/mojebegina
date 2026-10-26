// GPT/MCP pilot — rozšířené čtecí nástroje (část 1: leady, aktivita
// obchodníků, denní fronta, manažerský přehled, hledání) nad databází
// (ovladač Neonu → PGlite se VŠEMI migracemi, nikdy skutečný Neon), volané
// přes MCP pod identitou uživatele jen se čtecím souhlasem.
//
// Ověřuje: SQL filtry (autor, druh záznamu, hranice dne v Europe/Prague,
// předvolby leadů), první kontakt proti celé historii, plán fronty vs.
// zaznamenané hovory, souhrny přehledu, „nedostupné ≠ nula“ u chybějícího
// oprávnění, hlavičku source, stránkování, audit bez osobních údajů,
// nepřítomnost tajných hodnot ve výstupech, limit čtení a že se nic nezapíše.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: null }) } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/data/admin", () => ({ createCustomerOrganization: async () => ({ ok: false }) }));

// skutečná id: kurátor Denního volání = Viner, CEO allowlist podle e-mailu
const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f";
const NOVAK = "user-novak";
const KOLEGA = "user-kolega";
const ZAKAZNIK = "user-zakaznik";
const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const CLIENT = "chatgpt-mojebegina";
const NOW = new Date("2026-10-14T16:00:00Z"); // 18:00 v Praze

const id = (prefix: string, n: number) => `00000000-0000-4000-8000-${prefix}${String(n).padStart(12 - prefix.length, "0")}`;
const lead = (n: number) => id("1", n);
const L_NEW = lead(1);
const L_TWICE = lead(2);
const L_OLD = lead(3); // import z tabulky
const L_REPEAT = lead(4);
const L_LATE = lead(5);
const L_BEFORE = lead(6);
const L_AFTER = lead(7);
const L_VINER = lead(8);
const L_IDLE = lead(9); // bez hovoru, bez dalšího kroku
const L_OVERDUE = lead(10);
const L_TODAY = lead(11);
const L_CLOSED = lead(12);
const L_ASSIGNED = lead(13);
const L_CONV = lead(14); // převedený bez vazby na zákazníka
const ORG1 = id("3", 1);
const ORG2 = id("3", 2);
const ORG3 = id("3", 3);
const ORG_OLD = id("3", 4);
const ORDER = (n: number) => id("4", n);
const SECRET_EXTERNAL_ID = "cs_test_SECRET123";
const SECRET_RAW = "tok_SECRET_raw_payload";

type Call = { n: number; leadId: string; author: string; at: string; meta: Record<string, unknown>; body?: string | null; kind?: string };
const ACTIVITY: Call[] = [
  { n: 1, leadId: L_NEW, author: BLAHOUT, at: "2026-10-13T22:00:00Z", body: "Majitel má zájem, poslat ceník.", meta: { from: "new", callResult: "reached_interested", stageChangedTo: "interested", nextFollowUpAt: "2026-10-20T12:00:00.000Z" } },
  { n: 2, leadId: L_TWICE, author: BLAHOUT, at: "2026-10-14T06:30:00Z", body: "Nebere.", meta: { from: "new", callResult: "no_answer", nextFollowUpAt: "2026-10-14T12:00:00.000Z" } },
  { n: 3, leadId: L_TWICE, author: BLAHOUT, at: "2026-10-14T13:15:00Z", body: "Dovoláno, chce vzorky.", meta: { from: "new", callResult: "reached_interested", nextFollowUpAt: "2026-10-17T12:00:00.000Z" } },
  { n: 4, leadId: L_OLD, author: BLAHOUT, at: "2026-10-14T09:00:00Z", body: "Domluven vzorek.", meta: { from: "interested", stageChangedTo: "sample_offer", nextFollowUpAt: "2026-10-18T12:00:00.000Z" } },
  { n: 5, leadId: L_REPEAT, author: VINER, at: "2026-10-10T10:00:00Z", body: "Úvodní hovor.", meta: { from: "new", callResult: "call_back_later", nextFollowUpAt: "2026-10-14T12:00:00.000Z" } },
  { n: 6, leadId: L_REPEAT, author: BLAHOUT, at: "2026-10-14T10:00:00Z", body: null, meta: { from: "contacted", stageChangedTo: null, nextFollowUpAt: null } },
  { n: 7, leadId: L_LATE, author: BLAHOUT, at: "2026-10-14T21:59:59Z", body: "Číslo neexistuje.", meta: { from: "new", callResult: "invalid_contact", nextFollowUpAt: null } },
  { n: 8, leadId: L_BEFORE, author: BLAHOUT, at: "2026-10-13T21:59:59Z", body: "Předchozí den.", meta: { from: "new", callResult: "no_answer", nextFollowUpAt: "2026-10-15T12:00:00.000Z" } },
  { n: 9, leadId: L_AFTER, author: BLAHOUT, at: "2026-10-14T22:00:00Z", body: "Následující den.", meta: { from: "new", callResult: "no_answer", nextFollowUpAt: "2026-10-16T12:00:00.000Z" } },
  { n: 10, leadId: L_VINER, author: VINER, at: "2026-10-14T12:00:00Z", body: "Vinerův hovor.", meta: { from: "new", callResult: "reached_interested", nextFollowUpAt: "2026-10-21T12:00:00.000Z" } },
  // Blahoutovy záznamy, které NEJSOU hovory
  { n: 11, leadId: L_NEW, author: BLAHOUT, at: "2026-10-14T11:00:00Z", body: "Jen poznámka: poslat nabídku e-mailem.", meta: {}, kind: "note_added" },
  { n: 12, leadId: L_NEW, author: BLAHOUT, at: "2026-10-14T11:05:00Z", body: null, meta: { from: "interested", to: "negotiating" }, kind: "stage_changed" },
  // import a přidělení
  { n: 13, leadId: L_OLD, author: VINER, at: "2026-09-26T07:37:20Z", body: null, meta: { importBatch: "crm-import-2026-09-26", sourceRow: 7 }, kind: "created" },
  { n: 14, leadId: L_ASSIGNED, author: VINER, at: "2026-10-13T08:00:00Z", body: null, meta: { ownerUserId: BLAHOUT, ownerName: "Jaroslav Blahout" }, kind: "owner_assigned" },
];
const activityId = (n: number) => id("2", n);

describe("rozšířené čtecí nástroje nad DB", { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let store: typeof import("../oauthStore");
  let mcp: typeof import("../mcp/server");
  let config: NonNullable<ReturnType<typeof import("../config").agentConfig>>;
  let viner: import("../oauthStore").AgentSession;
  let kolega: import("../oauthStore").AgentSession;
  const outputs: string[] = [];

  type Result = { isError?: boolean; structuredContent?: any; content: Array<{ text: string }> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const call = async (name: string, args: Record<string, unknown> = {}, session = viner): Promise<Result> => {
    const result = (await mcp.callAgentTool(db, session, config, name, args)) as Result;
    outputs.push(JSON.stringify(result));
    return result;
  };
  const ok = async (name: string, args: Record<string, unknown> = {}, session = viner) => {
    const result = await call(name, args, session);
    if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
    return result.structuredContent;
  };

  const businessHash = async () =>
    (
      await db.execute(sql`
        SELECT md5(concat_ws('|',
          (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY id) FROM leads t),
          (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY id) FROM lead_activity t),
          (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY id) FROM orders t),
          (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY id) FROM payments t),
          (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY id) FROM organizations t),
          (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY id) FROM daily_call_queue t),
          (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY id) FROM company_nodes t),
          (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY id) FROM focus_projects t)
        )) AS h`)
    ).rows[0].h;
  let hashBefore: string;

  async function connect(userId: string, role: "ADMIN" | "EXECUTIVE") {
    const code = await store.issueAuthorizationCode(db, { userId, systemRole: role, clientId: CLIENT, write: false, redirectUri: REDIRECT, codeChallenge: CHALLENGE });
    const tokens = await store.exchangeAuthorizationCode(db, { clientId: CLIENT, code, redirectUri: REDIRECT, codeVerifier: VERIFIER });
    if (!tokens.ok) throw new Error(tokens.description);
    const session = await store.resolveAccessToken(db, config, tokens.body.access_token);
    if (!session) throw new Error("token neplatí");
    return session;
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);

    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    holder.db = db;

    const { agentConfig } = await import("../config");
    config = agentConfig({
      MCP_ISSUER: "https://gpt-pilot.begina.cz",
      MCP_OAUTH_CLIENT_ID: CLIENT,
      MCP_OAUTH_CLIENT_SECRET: "s".repeat(40),
      MCP_OAUTH_REDIRECT_URIS: REDIRECT,
      MCP_ALLOWED_USER_IDS: `${VINER},${KOLEGA}`,
    })!;
    store = await import("../oauthStore");
    mcp = await import("../mcp/server");

    const leadRow = (leadId: string, name: string, stage: string, owner: string | null, next: string | null, created = "2026-09-26T07:37:20Z") =>
      sql`(${leadId}, 'existing_database', ${name}, ${stage}, ${owner}, ${next}::timestamptz, ${created}::timestamptz)`;
    const statements = [
      sql`INSERT INTO user_roles (user_id, system_role) VALUES (${VINER}, 'ADMIN'), (${BLAHOUT}, 'EXECUTIVE'), (${NOVAK}, 'EMPLOYEE'), (${KOLEGA}, 'EXECUTIVE'), (${ZAKAZNIK}, 'CUSTOMER')`,
      sql`INSERT INTO user_profiles (user_id, name, email) VALUES
           (${VINER}, 'Jaroslav Viner', 'viner.jaroslav@gmail.com'),
           (${BLAHOUT}, 'Jaroslav Blahout', 'blahout@begina.cz'),
           (${NOVAK}, 'Jaroslav Novák', 'novak@begina.cz'),
           (${KOLEGA}, 'Petra Kolegová', 'petra@begina.cz'),
           (${ZAKAZNIK}, 'Petr Blahout', 'petr@example.cz')`,
      sql`INSERT INTO leads (id, source, company_name, stage, owner_user_id, next_follow_up_at, created_at) VALUES ${sql.join(
        [
          leadRow(L_NEW, "Kavárna U Lípy", "negotiating", BLAHOUT, "2026-10-20T12:00:00Z"),
          leadRow(L_TWICE, "Bistro Na Rohu", "contacted", BLAHOUT, "2026-10-17T12:00:00Z"),
          leadRow(L_OLD, "Café Import", "sample_offer", BLAHOUT, "2026-10-18T12:00:00Z"),
          leadRow(L_REPEAT, "Hospoda Opakovaná", "contacted", BLAHOUT, "2026-10-22T12:00:00Z"),
          leadRow(L_LATE, "Pozdní Bar", "new", BLAHOUT, "2026-10-25T12:00:00Z"),
          leadRow(L_BEFORE, "Včerejší Bar", "contacted", BLAHOUT, "2026-10-15T12:00:00Z"),
          leadRow(L_AFTER, "Zítřejší Bar", "contacted", BLAHOUT, "2026-10-16T12:00:00Z"),
          leadRow(L_VINER, "Vinerova Kavárna", "interested", VINER, "2026-10-21T12:00:00Z"),
          leadRow(L_IDLE, "Nečinný Bufet", "new", BLAHOUT, null),
          leadRow(L_OVERDUE, "Prošlá Vinárna", "contacted", BLAHOUT, "2026-10-10T12:00:00Z"),
          leadRow(L_TODAY, "Dnešní Pivnice", "interested", null, "2026-10-14T12:00:00Z"),
          leadRow(L_CLOSED, "Ukončená Restaurace", "not_interested", BLAHOUT, null),
          leadRow(L_ASSIGNED, "Nově Přidělená Cukrárna", "new", BLAHOUT, "2026-10-30T12:00:00Z", "2026-09-01T08:00:00Z"),
          leadRow(L_CONV, "Převedený Hotel", "converted", BLAHOUT, null),
        ],
        sql`, `
      )}`,
      sql`INSERT INTO organizations (id, ico, name, registered_address, owner_user_id, created_at) VALUES
           (${ORG1}, '11111111', 'The Cup s.r.o.', 'Praha', ${BLAHOUT}, '2026-05-01T08:00:00Z'),
           (${ORG2}, '22222222', 'Bez Obchodníka a.s.', 'Brno', NULL, '2026-06-01T08:00:00Z'),
           (${ORG3}, '33333333', 'Nový Zákazník s.r.o.', 'Ostrava', NULL, '2026-10-10T08:00:00Z'),
           (${ORG_OLD}, '44444444', 'Spící Zákazník s.r.o.', 'Plzeň', ${BLAHOUT}, '2026-01-01T08:00:00Z')`,
      sql`INSERT INTO orders (id, buyer_organization_id, contact_email, subtotal_kc, total_kc, payment_status, fulfillment_status, ordered_at, channel, payment_vs, order_number) VALUES
           (${ORDER(1)}, ${ORG1}, NULL, 1000, 1000, 'paid', 'delivered', '2026-10-12T09:00:00Z', 'manual', NULL, 1001),
           (${ORDER(2)}, NULL, 'host@example.cz', 500, 500, 'unpaid', 'new', '2026-09-20T09:00:00Z', 'eshop', '71234567', 1002),
           (${ORDER(3)}, ${ORG2}, NULL, 300, 300, 'unpaid', 'cancelled', '2026-10-13T09:00:00Z', 'manual', NULL, 1003),
           (${ORDER(4)}, ${ORG1}, NULL, 700, 700, 'paid', 'confirmed', '2026-10-05T09:00:00Z', 'manual', NULL, 1004),
           (${ORDER(5)}, ${ORG_OLD}, NULL, 400, 400, 'paid', 'delivered', '2026-05-01T09:00:00Z', 'manual', NULL, 1005)`,
      sql`INSERT INTO payments (id, order_id, source, external_id, method, direction, status, amount_hal, match_status, occurred_at, raw, refund_of_payment_id) VALUES
           (${id("5", 1)}, ${ORDER(1)}, 'stripe', ${SECRET_EXTERNAL_ID}, 'card', 'inflow', 'succeeded', 100000, 'matched', '2026-10-12T09:05:00Z', ${JSON.stringify({ token: SECRET_RAW })}::jsonb, NULL),
           (${id("5", 2)}, ${ORDER(1)}, 'stripe', 're_test_1', 'card', 'outflow', 'succeeded', 20000, 'matched', '2026-10-13T10:00:00Z', NULL, ${id("5", 1)}),
           (${id("5", 3)}, NULL, 'bank', 'ucet:42', 'bank_transfer', 'inflow', 'succeeded', 50000, 'needs_review', '2026-10-14T08:00:00Z', NULL, NULL)`,
      sql`INSERT INTO daily_call_queue (id, lead_id, position, status, source, added_by, added_for_date, published_at, published_by, done_at, done_by, removed_at, removed_by) VALUES
           (${id("6", 1)}, ${L_TWICE}, 1, 'done', 'auto', ${VINER}, '2026-10-14', '2026-10-14T05:00:00Z', ${VINER}, '2026-10-14T13:15:00Z', ${BLAHOUT}, NULL, NULL),
           (${id("6", 2)}, ${L_IDLE}, 2, 'pending', 'auto', ${VINER}, '2026-10-14', '2026-10-14T05:00:00Z', ${VINER}, NULL, NULL, NULL, NULL),
           (${id("6", 3)}, ${L_CLOSED}, 3, 'removed', 'manual', ${VINER}, '2026-10-14', '2026-10-14T05:00:00Z', ${VINER}, NULL, NULL, '2026-10-14T07:00:00Z', ${VINER}),
           (${id("6", 4)}, ${L_TODAY}, 4, 'pending', 'auto', ${VINER}, '2026-10-14', NULL, NULL, NULL, NULL, NULL, NULL),
           (${id("6", 5)}, ${L_OVERDUE}, 5, 'done', 'auto', ${VINER}, '2026-10-14', '2026-10-14T05:00:00Z', ${VINER}, '2026-10-14T15:00:00Z', ${BLAHOUT}, NULL, NULL)`,
      sql`INSERT INTO company_nodes (id, title, status, priority, owner_user_id, created_by, created_at, updated_at) VALUES
           (${id("7", 1)}, 'Obchod', 'red', 'high', ${VINER}, ${VINER}, '2026-09-01T08:00:00Z', '2026-09-01T08:00:00Z'),
           (${id("7", 2)}, 'Výroba', 'green', 'medium', NULL, ${VINER}, '2026-09-01T08:00:00Z', '2026-10-14T08:00:00Z')`,
      sql`INSERT INTO focus_projects (id, title, status, priority, is_active_now, owner_user_id, created_by) VALUES
           (${id("8", 1)}, 'Rozjezd e-shopu', 'amber', 'high', true, ${VINER}, ${VINER})`,
    ];
    for (const statement of statements) await db.execute(statement);
    for (const a of ACTIVITY) {
      await db.execute(sql`
        INSERT INTO lead_activity (id, lead_id, author_user_id, author_name, kind, body, metadata, created_at)
        VALUES (${activityId(a.n)}, ${a.leadId}, ${a.author}, ${a.author === VINER ? "Jaroslav Viner" : "Jaroslav Blahout"},
                ${a.kind ?? "call_logged"}, ${a.body ?? null}, ${JSON.stringify(a.meta)}::jsonb, ${a.at}::timestamptz)`);
    }

    viner = await connect(VINER, "ADMIN");
    kolega = await connect(KOLEGA, "EXECUTIVE");
    hashBefore = await businessHash();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("nástroje: se čtecím souhlasem jen čtení; search_crm zůstává jako alias", () => {
    const tools = mcp.agentMcpServer(db, viner, config).listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "search_mojebegina",
      "get_executive_overview",
      "list_leads",
      "get_lead",
      "get_salesperson_activity",
      "get_daily_call_report",
      "search_crm",
      "get_customer",
      "my_overview",
      "list_company_tasks",
      "get_company_task",
      // fakturace — jen vystavovatelé faktur (Viner), se čtecím souhlasem bez vystavení
      "idoklad_search_invoices",
      "idoklad_get_invoice",
      "idoklad_list_series",
      "idoklad_numbering_audit",
      "idoklad_unpaid_and_discrepancies",
      "invoice_preview",
      "woocommerce_order_import_preview",
    ]);
    for (const tool of tools) expect(tool.annotations, tool.name).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    const colleague = mcp.agentMcpServer(db, kolega, config).listTools().map((t) => t.name);
    expect(colleague.filter((name) => name.startsWith("idoklad_") || name.startsWith("invoice_"))).toEqual([]);
  });

  describe("source hlavička", () => {
    it("prostředí, větev, čas, období, čerstvost domén a varování", async () => {
      const data = await ok("list_leads", { preset: "overdue" });
      expect(data.source).toMatchObject({
        environment: "neznámé", // PGlite nemá neon.branch_id
        neonBranchId: null,
        queriedAt: NOW.toISOString(),
        queriedAtPrague: "2026-10-14 18:00",
        complete: true,
        truncated: false,
        nextCursor: null,
      });
      expect(data.source.lastRecordedActivity).toEqual([
        expect.objectContaining({ domain: "crm", lastRecordedActivityAtPrague: "2026-10-15 00:00" }),
      ]);
      expect(data.source.copy).toBeNull();
      expect(data.source.warnings[0]).toMatch(/Nepodařilo se ověřit/);
    });
  });

  describe("list_leads", () => {
    const names = (data: { leads: Array<{ name: string }> }) => data.leads.map((l) => l.name).sort();

    it("předvolby po termínu, na dnes, bez dalšího kroku, ukončené", async () => {
      expect(names(await ok("list_leads", { preset: "overdue" }))).toEqual(["Prošlá Vinárna"]);
      expect(names(await ok("list_leads", { preset: "due_today" }))).toEqual(["Dnešní Pivnice"]);
      expect(names(await ok("list_leads", { preset: "missing_next_step" }))).toEqual(["Nečinný Bufet"]);
      expect(names(await ok("list_leads", { preset: "closed" }))).toEqual(["Převedený Hotel", "Ukončená Restaurace"].sort());
    });

    it("neobvolané/obvolané podle zaznamenaných hovorů a nově přidělené", async () => {
      expect(names(await ok("list_leads", { preset: "never_called" }))).toEqual(
        ["Dnešní Pivnice", "Nečinný Bufet", "Nově Přidělená Cukrárna", "Převedený Hotel", "Prošlá Vinárna", "Ukončená Restaurace"].sort()
      );
      const called = await ok("list_leads", { preset: "called", owner: "Viner" });
      expect(called.leads).toEqual([expect.objectContaining({ name: "Vinerova Kavárna", recordedCalls: 1, lastRecordedCallAtPrague: "2026-10-14 14:00" })]);
      const assigned = await ok("list_leads", { preset: "new_assigned", assigned_from: "2026-10-13", assigned_to: "2026-10-14" });
      expect(names(assigned)).toEqual(["Nově Přidělená Cukrárna"]);
      expect(assigned.source.period).toMatchObject({ dateFrom: "2026-10-13", dateTo: "2026-10-14" });
    });

    it("obchodník, fáze, termín dalšího kontaktu; bez obchodníka", async () => {
      expect(names(await ok("list_leads", { owner: "nikdo" }))).toEqual(["Dnešní Pivnice"]);
      expect(names(await ok("list_leads", { owner: "Blahout", stages: ["new"] }))).toEqual(["Nečinný Bufet", "Nově Přidělená Cukrárna", "Pozdní Bar"]);
      expect(names(await ok("list_leads", { next_contact_from: "2026-10-15", next_contact_to: "2026-10-17" }))).toEqual([
        "Bistro Na Rohu",
        "Včerejší Bar",
        "Zítřejší Bar",
      ]);
    });

    it("stránkování přes cursor, úplnost a ochrana cursoru", async () => {
      const first = await ok("list_leads", { owner: "Blahout", limit: 5 });
      expect(first.totalMatching).toBe(12);
      expect(first.source).toMatchObject({ complete: false, truncated: true });
      const second = await ok("list_leads", { owner: "Blahout", limit: 5, cursor: first.source.nextCursor });
      const third = await ok("list_leads", { owner: "Blahout", limit: 5, cursor: second.source.nextCursor });
      expect(third.leads).toHaveLength(2);
      expect(third.source).toMatchObject({ truncated: false, nextCursor: null });
      const all = [...first.leads, ...second.leads, ...third.leads].map((l: { id: string }) => l.id);
      expect(new Set(all).size).toBe(12);
      expect(await call("list_leads", { owner: "Viner", limit: 5, cursor: first.source.nextCursor })).toMatchObject({ isError: true });
      const capped = await call("list_leads", { limit: 51 });
      expect(capped.isError).toBeUndefined();
      expect(capped.structuredContent.leads).toHaveLength(14);
      expect(await call("list_leads", { created_from: "2026-01-01", created_to: "2026-12-31" })).toMatchObject({ isError: true });
      expect(await call("list_leads", { owner: "Jaroslav" })).toMatchObject({ isError: true });
    });
  });

  describe("get_lead", () => {
    it("úplná historie po stránkách s popisky", async () => {
      const page1 = await ok("get_lead", { lead_id: L_NEW, limit: 2 });
      expect(page1.activityTotal).toBe(3);
      expect(page1.lead).toMatchObject({ name: "Kavárna U Lípy", recordedCalls: 1, firstRecordedCallAtPrague: "2026-10-14 00:00", importedLead: false });
      expect(page1.activity.map((a: { kindLabel: string }) => a.kindLabel)).toEqual(["změna fáze", "poznámka"]);
      const page2 = await ok("get_lead", { lead_id: L_NEW, limit: 2, cursor: page1.source.nextCursor });
      expect(page2.activity).toEqual([
        expect.objectContaining({
          kindLabel: "zaznamenaný hovor",
          atPrague: "2026-10-14 00:00",
          text: "Majitel má zájem, poslat ceník.",
          details: { result: "Dovoláno – zájem", stageBefore: "Lead", stageChangedTo: "Zájem", nextContactDate: "2026-10-20" },
        }),
      ]);
      expect(page2.source.nextCursor).toBeNull();
    });

    it("importovaný lead nese varování o chybějící starší historii", async () => {
      const data = await ok("get_lead", { lead_id: L_OLD });
      expect(data.lead.importedLead).toBe(true);
      expect(data.source.warnings.join(" ")).toMatch(/importem/);
    });
  });

  describe("get_salesperson_activity", () => {
    it("Blahout 14. 10.: jen jeho zaznamenané hovory, hranice dne v Praze, první kontakt bez ohledu na fázi", async () => {
      const data = await ok("get_salesperson_activity", { salesperson: "Jaroslav Blahout", date_from: "2026-10-14" });
      expect(data.period).toMatchObject({ startUtc: "2026-10-13T22:00:00.000Z", endUtcExclusive: "2026-10-14T22:00:00.000Z" });
      expect(data.totals).toEqual({
        recordedCalls: 6,
        uniqueLeads: 5,
        firstContactLeads: 4,
        firstContactImportedLeads: 1,
        repeatOnlyLeads: 1,
        repeatCalls: 2,
        incompleteCalls: 1,
      });
      expect(data.leads.map((l: { name: string; contactType: string }) => [l.name, l.contactType])).toEqual([
        ["Kavárna U Lípy", "first_recorded"],
        ["Bistro Na Rohu", "first_recorded"],
        ["Café Import", "first_recorded_imported"],
        ["Hospoda Opakovaná", "repeat"],
        ["Pozdní Bar", "first_recorded"],
      ]);
      expect(data.leads[2].contactTypeLabel).toMatch(/první evidovaný hovor v MojeBegina/);
      expect(data.incompleteRecords).toEqual([
        expect.objectContaining({ name: "Hospoda Opakovaná", warnings: ["chybí výsledek hovoru", "chybí poznámka", "chybí termín dalšího kontaktu"] }),
      ]);
    });

    it("období a den bez hovorů", async () => {
      expect((await ok("get_salesperson_activity", { salesperson: "blahout", date_from: "2026-10-13", date_to: "2026-10-14" })).totals).toMatchObject({
        recordedCalls: 7,
        uniqueLeads: 6,
      });
      const empty = await ok("get_salesperson_activity", { salesperson: "Blahout", date_from: "2026-10-01" });
      expect(empty.totals.recordedCalls).toBe(0);
      expect(empty.source.warnings.join(" ")).toMatch(/nula zaznamenaných/);
      expect(await call("get_salesperson_activity", { salesperson: "Blahout", date_from: "2026-09-01", date_to: "2026-10-14" })).toMatchObject({ isError: true });
    });
  });

  describe("get_daily_call_report", () => {
    it("plán vs. zaznamenané hovory (výchozí dnes)", async () => {
      const data = await ok("get_daily_call_report");
      expect(data.totals).toEqual({
        planned: 4,
        plannedDone: 2,
        plannedPending: 1,
        plannedRemoved: 1,
        draftsNotPublished: 1,
        doneInPeriod: 2,
        doneWithoutRecordedCall: 1,
        recordedCallsInPeriod: 7,
        recordedCallsOutsideQueue: 5,
      });
      expect(data.done).toEqual([
        expect.objectContaining({ leadName: "Bistro Na Rohu", doneBy: "Jaroslav Blahout", recordedCall: expect.objectContaining({ result: "Dovoláno – zájem" }) }),
        expect.objectContaining({ leadName: "Prošlá Vinárna", recordedCall: null }),
      ]);
      expect(data.pending).toEqual([expect.objectContaining({ leadName: "Nečinný Bufet" })]);
      expect(data.source.period).toMatchObject({ dateFrom: "2026-10-14", dateTo: "2026-10-14" });
    });

    it("jen Blahoutovy hovory; kolega bez práv kurátora fronty nic nevidí", async () => {
      const data = await ok("get_daily_call_report", { date_from: "2026-10-14", salesperson: "Blahout" });
      expect(data.totals).toMatchObject({ recordedCallsInPeriod: 6, recordedCallsOutsideQueue: 4, doneInPeriod: 2 });
      const denied = await call("get_daily_call_report", {}, kolega);
      expect(denied.isError).toBe(true);
      expect(denied.content[0].text).toMatch(/oprávnění/);
    });
  });

  describe("get_executive_overview", () => {
    it("souhrny za týden a kvalita dat", async () => {
      const data = await ok("get_executive_overview", { period: "week" });
      const { crm, recordedCalls, dailyQueue, orders, customers, companyMap, ceoProjects } = data.sections;
      expect(crm).toMatchObject({ available: true, data: { overdue: 1, dueToday: 1, missingNextStep: 1, convertedWithoutCustomer: 1, activeWithoutOwner: 1 } });
      expect(recordedCalls.data).toMatchObject({ recordedCalls: 9, callsWithoutResult: 1, callsWithoutNote: 1 });
      expect(recordedCalls.data.bySalesperson[0]).toMatchObject({ salesperson: "Jaroslav Blahout", recordedCalls: 7, firstContactLeads: 5 });
      expect(dailyQueue.data).toMatchObject({ plannedToday: 4, plannedTodayDone: 2, draftsNotPublished: 1, doneWithoutRecordedCall: 1 });
      expect(orders.data).toMatchObject({
        ordersInPeriod: 2, // 5. 10. je mimo týden 8.–14. 10.
        revenueKcInPeriod: 1000, // storno se do obratu nepočítá
        cancelledInPeriod: 1,
        unpaidOpen: 1,
        unpaidOpenKc: 500,
        needsAttention: { unpaidOver14Days: 1, paidNotProcessedOver3Days: 1, newUnconfirmed: 1, paymentsNeedingReview: 1 },
        refundsInPeriod: 1,
        refundedKcInPeriod: 200,
      });
      expect(customers.data).toMatchObject({ customers: 4, neverOrdered: 2, orderedLast90Days: 1, noOrderOver90Days: 1, withoutOwner: 2, newInPeriod: 1 });
      expect(companyMap.data).toMatchObject({ topics: 2, red: 1, stagnating: 1, problemTopics: [expect.objectContaining({ title: "Obchod", owner: "Jaroslav Viner" })] });
      expect(ceoProjects.data.activeNow).toEqual([expect.objectContaining({ title: "Rozjezd e-shopu", status: "amber" })]);
      expect(data.dataQuality).toMatchObject({
        callsWithoutResult: 1,
        callsWithoutNote: 1,
        activeLeadsMissingNextStep: 1,
        activeLeadsOverdue: 1,
        queueDoneWithoutRecordedCall: 1,
        convertedLeadsWithoutCustomer: 1,
        customersWithoutOwner: 2,
      });
      expect(data.source.period).toMatchObject({ dateFrom: "2026-10-08", dateTo: "2026-10-14" });
      expect(data.source.lastRecordedActivity.map((f: { domain: string }) => f.domain)).toEqual(["crm", "daily_calls", "orders", "customers", "company", "focus"]);
    });

    it("celá historie i víceleté období jen jako souhrn", async () => {
      const all = await ok("get_executive_overview", { period: "all" });
      expect(all.sections.orders.data.ordersInPeriod).toBe(5);
      expect(all.source.period.note).toMatch(/celá dostupná historie/);
      const years = await ok("get_executive_overview", { date_from: "2024-01-01", date_to: "2026-12-31" });
      expect(years.sections.orders.data.ordersInPeriod).toBe(5);
    });

    it("bez oprávnění je sekce nedostupná, ne nulová", async () => {
      const data = await ok("get_executive_overview", {}, kolega);
      expect(data.sections.ceoProjects).toMatchObject({ available: false, reason: expect.stringMatching(/nejsou nulová/) });
      expect(data.sections.dailyQueue.available).toBe(false);
      expect(data.sections.crm.available).toBe(true);
      expect(data.dataQuality.queueDoneWithoutRecordedCall).toBeNull();
      expect(data.dataQuality.activeLeadsOverdue).toBe(1);
    });
  });

  describe("search_mojebegina", () => {
    it("leady, zákazníci, objednávky (číslo, VS), témata a projekty", async () => {
      const lipy = await ok("search_mojebegina", { query: "lípy" });
      expect(lipy.leads).toMatchObject({ available: true, data: [expect.objectContaining({ id: L_NEW, name: "Kavárna U Lípy" })] });
      expect(lipy.products).toMatchObject({ available: true, data: [] });
      expect((await ok("search_mojebegina", { query: "1001" })).orders.data).toEqual([expect.objectContaining({ orderNumber: 1001, customer: "The Cup s.r.o." })]);
      expect((await ok("search_mojebegina", { query: "71234567" })).orders.data).toEqual([expect.objectContaining({ orderNumber: 1002 })]);
      expect((await ok("search_mojebegina", { query: "The Cup", domains: ["customers"] })).customers.data).toEqual([expect.objectContaining({ id: ORG1 })]);
      expect((await ok("search_mojebegina", { query: "e-shop" })).ceoProjects.data).toEqual([expect.objectContaining({ title: "Rozjezd e-shopu" })]);
      expect((await ok("search_mojebegina", { query: "%%" })).leads.data).toEqual([]);
    });

    it("kolega bez CEO allowlistu: projekty nedostupné; search_crm dál funguje", async () => {
      const data = await ok("search_mojebegina", { query: "e-shop" }, kolega);
      expect(data.ceoProjects.available).toBe(false);
      expect((await ok("search_crm", { query: "lípy" })).leads).toEqual([expect.objectContaining({ id: L_NEW })]);
    });
  });

  describe("bezpečnost", () => {
    it("žádné tajné ani surové hodnoty ve výstupech", () => {
      const all = outputs.join("\n");
      expect(outputs.length).toBeGreaterThan(25);
      for (const forbidden of [SECRET_EXTERNAL_ID, SECRET_RAW, '"raw"', "externalId", "external_id", "requestPayload", "request_payload", "refresh_token", "token_hash", "importBatch"]) {
        expect(all, forbidden).not.toContain(forbidden);
      }
    });

    it("audit: kdo, kdy, nástroj a počty — bez jmen a hledaného textu", async () => {
      const rows = (
        await db.execute(sql`SELECT tool, args, result, status FROM agent_audit_log WHERE user_id = ${VINER} AND tool IN ('get_salesperson_activity', 'search_mojebegina', 'list_leads')`)
      ).rows as Array<{ tool: string; args: Record<string, unknown>; result: unknown; status: string }>;
      expect(rows.length).toBeGreaterThan(10);
      const text = JSON.stringify(rows);
      for (const personal of ["Blahout", "lípy", "Lípy", "71234567", "The Cup"]) expect(text, personal).not.toContain(personal);
      expect(rows).toContainEqual(
        expect.objectContaining({ tool: "get_salesperson_activity", args: { salesperson: "[16 znaků]", date_from: "2026-10-14" }, status: "ok" })
      );
      expect(rows).toContainEqual(expect.objectContaining({ tool: "list_leads", result: expect.objectContaining({ totalMatching: 12, returned: 5, truncated: true }) }));
    });

    it("nic se nezapsalo do obchodních dat", async () => {
      expect(await businessHash()).toBe(hashBefore);
    });

    it("limit čtení za hodinu", async () => {
      const [{ grant_id }] = (await db.execute(sql`SELECT ${kolega.grantId}::uuid AS grant_id`)).rows;
      await db.execute(sql`
        INSERT INTO agent_audit_log (grant_id, user_id, tool, is_write, status, created_at, finished_at)
        SELECT ${grant_id}, ${KOLEGA}, 'list_leads', false, 'ok', ${NOW}, ${NOW} FROM generate_series(1, 600)`);
      const denied = await call("list_leads", {}, kolega);
      expect(denied).toMatchObject({ isError: true });
      expect(denied.content[0].text).toMatch(/limit 600 dotazů/);
    });
  });
});
