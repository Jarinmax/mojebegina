// GPT/MCP pilot — celý tok nad databází (ovladač Neonu → PGlite se VŠEMI
// migracemi, nikdy skutečný Neon): souhlas → kód → tokeny → MCP nástroje
// se SKUTEČNOU datovou vrstvou (leads.ts, companyNodes.ts) pod identitou
// uživatele přes getAuthContext(). Ověřuje i bezpečnostní hranice: PKCE,
// jednorázovost kódu a refresh tokenu (znovupoužití odvolá souhlas),
// okamžitý dopad odebrané role/allowlistu, rozsah jen pro čtení,
// idempotenci a audit.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const holder = vi.hoisted(() => ({
  db: null as unknown,
  // cookie session prohlížeče (Neon Auth) — null = nikdo přihlášený
  session: null as null | { user: { id: string; name: string; email: string } },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return holder.db;
  },
}));
// Cookie session (běžné přihlášení) — ve výchozím stavu nikdo; testy izolace
// ji nastaví, aby ověřily, že se token a cookie nikdy nepomíchají.
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: holder.session }) } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/data/admin", () => ({ createCustomerOrganization: async () => ({ ok: false }) }));

const USER = "user-jaroslav";
const OTHER = "user-kolega";
const LEAD = "00000000-0000-4000-8000-0000000000c1";
const ORG = "00000000-0000-4000-8000-000000000001";
const AREA = "00000000-0000-4000-8000-0000000000d1";
const REDIRECT = "https://chatgpt.com/connector/oauth/abc123";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const CLIENT = "chatgpt-begina";

describe("asistent ChatGPT nad DB", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let store: typeof import("../oauthStore");
  let mcp: typeof import("../mcp/server");
  let config: NonNullable<ReturnType<typeof import("../config").agentConfig>>;

  const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;

  async function connect(write: boolean, userId = USER, role: "ADMIN" | "EXECUTIVE" = "EXECUTIVE") {
    const code = await store.issueAuthorizationCode(db, {
      userId,
      systemRole: role,
      clientId: CLIENT,
      write,
      redirectUri: REDIRECT,
      codeChallenge: CHALLENGE,
    });
    const tokens = await store.exchangeAuthorizationCode(db, {
      clientId: CLIENT,
      code,
      redirectUri: REDIRECT,
      codeVerifier: VERIFIER,
    });
    if (!tokens.ok) throw new Error(tokens.description);
    const session = await store.resolveAccessToken(db, config, tokens.body.access_token);
    if (!session) throw new Error("token neplatí");
    return { code, tokens: tokens.body, session };
  }

  const call = (session: import("../oauthStore").AgentSession, name: string, args: Record<string, unknown> = {}) =>
    mcp.callAgentTool(db, session, config, name, args);

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    holder.db = db;

    const { agentConfig } = await import("../config");
    config = agentConfig({
      MCP_ISSUER: "https://moje.begina.cz",
      MCP_OAUTH_CLIENT_ID: CLIENT,
      MCP_OAUTH_CLIENT_SECRET: "s".repeat(40),
      MCP_OAUTH_REDIRECT_URIS: REDIRECT,
      MCP_ALLOWED_USER_IDS: `${USER},${OTHER}`,
      MCP_ALLOW_WRITE: "on",
    })!;
    store = await import("../oauthStore");
    mcp = await import("../mcp/server");

    for (const statement of [
      `INSERT INTO user_roles (user_id, system_role) VALUES ('${USER}', 'EXECUTIVE'), ('${OTHER}', 'CUSTOMER')`,
      `INSERT INTO user_profiles (user_id, name, email) VALUES ('${USER}', 'Jaroslav Viner', 'jaroslav@begina.cz')`,
      `INSERT INTO organizations (id, ico, name, registered_address) VALUES ('${ORG}', '11935367', 'The Cup s.r.o.', 'Praha')`,
      `INSERT INTO leads (id, source, company_name, contact_name, contact_phone, city, owner_user_id)
         VALUES ('${LEAD}', 'existing_database', 'Kavárna U Lípy', 'Petra Malá', '+420 777 111 222', 'Brno', '${USER}')`,
      `INSERT INTO company_nodes (id, title, status, created_by) VALUES ('${AREA}', 'Obchod', 'green', '${USER}')`,
    ]) {
      await db.execute(sql.raw(statement));
    }
  });

  describe("OAuth", () => {
    it("kód → tokeny → identita uživatele (role z DB, jméno s příponou)", async () => {
      const { tokens, session } = await connect(true);
      expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "mojebegina.read mojebegina.write" });
      expect(session.ctx).toEqual({
        userId: USER,
        systemRole: "EXECUTIVE",
        grantedRoles: ["EXECUTIVE"],
        roleSelectionRequired: false,
        name: "Jaroslav Viner (přes ChatGPT)",
        email: "jaroslav@begina.cz",
      });
      // v DB jen otisky, nikdy token
      const stored = await rows(sql`SELECT token_hash FROM agent_tokens`);
      expect(JSON.stringify(stored)).not.toContain(tokens.access_token);
    });

    it("špatný PKCE verifier, cizí redirect nebo klient → invalid_grant", async () => {
      const issue = () =>
        store.issueAuthorizationCode(db, {
          userId: USER,
          systemRole: "EXECUTIVE",
          clientId: CLIENT,
          write: false,
          redirectUri: REDIRECT,
          codeChallenge: CHALLENGE,
        });
      const base = { clientId: CLIENT, redirectUri: REDIRECT, codeVerifier: VERIFIER };
      expect(await store.exchangeAuthorizationCode(db, { ...base, code: await issue(), codeVerifier: "x".repeat(43) })).toMatchObject({ ok: false });
      expect(await store.exchangeAuthorizationCode(db, { ...base, code: await issue(), redirectUri: "https://evil.example/cb" })).toMatchObject({ ok: false });
      expect(await store.exchangeAuthorizationCode(db, { ...base, code: await issue(), clientId: "jiny" })).toMatchObject({ ok: false });
    });

    it("kód je jednorázový; znovupoužití odvolá souhlas i vydané tokeny", async () => {
      const { code, tokens } = await connect(false);
      const again = await store.exchangeAuthorizationCode(db, { clientId: CLIENT, code, redirectUri: REDIRECT, codeVerifier: VERIFIER });
      expect(again).toMatchObject({ ok: false, error: "invalid_grant" });
      expect(await store.resolveAccessToken(db, config, tokens.access_token)).toBeNull();
    });

    it("refresh token rotuje; starý podruhé = odcizení → odvolání", async () => {
      const { tokens } = await connect(false);
      const rotated = await store.exchangeRefreshToken(db, { clientId: CLIENT, refreshToken: tokens.refresh_token });
      expect(rotated.ok).toBe(true);
      if (!rotated.ok) return;
      expect(rotated.body.refresh_token).not.toBe(tokens.refresh_token);
      expect(await store.resolveAccessToken(db, config, rotated.body.access_token)).not.toBeNull();

      const replay = await store.exchangeRefreshToken(db, { clientId: CLIENT, refreshToken: tokens.refresh_token });
      expect(replay).toMatchObject({ ok: false });
      expect(await store.resolveAccessToken(db, config, rotated.body.access_token)).toBeNull();
    });

    it("access token po expiraci neplatí", async () => {
      const { tokens } = await connect(false);
      const later = new Date(Date.now() + 61 * 60 * 1000);
      expect(await store.resolveAccessToken(db, config, tokens.access_token, later)).toBeNull();
    });

    it("odebraná role nebo vyřazení z allowlistu platí hned, ne až po expiraci", async () => {
      const { tokens } = await connect(false);
      const withoutUser = { ...config, allowedUserIds: new Set([OTHER]) };
      expect(await store.resolveAccessToken(db, withoutUser, tokens.access_token)).toBeNull();
      // výměna client_id ve Vercelu odpojí všechny dosavadní souhlasy
      expect(await store.resolveAccessToken(db, { ...config, clientId: "novy-klient" }, tokens.access_token)).toBeNull();

      await db.execute(sql`DELETE FROM user_roles WHERE user_id = ${USER}`);
      expect(await store.resolveAccessToken(db, config, tokens.access_token)).toBeNull();
      await db.execute(sql`INSERT INTO user_roles (user_id, system_role) VALUES (${USER}, 'EXECUTIVE')`);
      expect(await store.resolveAccessToken(db, config, tokens.access_token)).not.toBeNull();
    });

    it("souhlas v roli, kterou uživatel nemá (CUSTOMER kolega jako ADMIN) → token neplatí", async () => {
      const code = await store.issueAuthorizationCode(db, {
        userId: OTHER,
        systemRole: "ADMIN",
        clientId: CLIENT,
        write: true,
        redirectUri: REDIRECT,
        codeChallenge: CHALLENGE,
      });
      const tokens = await store.exchangeAuthorizationCode(db, { clientId: CLIENT, code, redirectUri: REDIRECT, codeVerifier: VERIFIER });
      expect(tokens.ok).toBe(true);
      if (tokens.ok) expect(await store.resolveAccessToken(db, config, tokens.body.access_token)).toBeNull();
    });

    it("odvolání: klientem (RFC 7009) i uživatelem — cizí souhlas odvolat nejde", async () => {
      const first = await connect(false);
      await store.revokeByToken(db, first.tokens.refresh_token);
      expect(await store.resolveAccessToken(db, config, first.tokens.access_token)).toBeNull();

      const second = await connect(false);
      expect(await store.revokeOwnGrant(db, OTHER, second.session.grantId)).toBe(false);
      expect(await store.resolveAccessToken(db, config, second.tokens.access_token)).not.toBeNull();
      expect(await store.revokeOwnGrant(db, USER, second.session.grantId)).toBe(true);
      expect(await store.resolveAccessToken(db, config, second.tokens.access_token)).toBeNull();
    });
  });

  describe("MCP nástroje", () => {
    it("tools/list: bez zápisového souhlasu jen čtecí nástroje", async () => {
      const readOnly = await connect(false);
      const names = mcp.agentMcpServer(db, readOnly.session, config).listTools().map((t) => t.name);
      expect(names).toEqual([
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
      ]);
      const full = await connect(true);
      expect(mcp.agentMcpServer(db, full.session, config).listTools()).toHaveLength(16);
    });

    it("hledání a detail leadu", async () => {
      const { session } = await connect(false);
      const found = await call(session, "search_crm", { query: "lípy" });
      expect(found?.isError).toBeUndefined();
      expect(found?.structuredContent).toMatchObject({
        leads: [{ id: LEAD, name: "Kavárna U Lípy", stageLabel: "Lead", url: `https://moje.begina.cz/rizeni-firmy/obchod/leady/${LEAD}` }],
        customers: [],
      });
      // % a _ se hledají doslova, ne jako vzor
      expect((await call(session, "search_crm", { query: "%%" }))?.structuredContent).toEqual({ leads: [], customers: [] });
      expect((await call(session, "search_crm", { query: "11935367" }))?.structuredContent).toMatchObject({
        customers: [{ id: ORG, name: "The Cup s.r.o." }],
      });
      expect((await call(session, "get_lead", { lead_id: LEAD }))?.structuredContent).toMatchObject({
        lead: { id: LEAD, phone: "+420 777 111 222" },
      });
      expect(await call(session, "get_lead", { lead_id: "1; DROP TABLE leads" })).toMatchObject({ isError: true });
    });

    it("poznámka k leadu: autor = uživatel (přes ChatGPT), idempotence, audit", async () => {
      const { session } = await connect(true);
      const args = { lead_id: LEAD, text: "Volat po 15. 10., zájem o sirupy.", idempotency_key: "key-lead-note-1" };
      const first = await call(session, "add_lead_note", args);
      expect(first?.structuredContent).toMatchObject({ saved: true });

      const replay = await call(session, "add_lead_note", args);
      expect(replay?.structuredContent).toMatchObject({ saved: true, alreadySaved: true });

      const conflict = await call(session, "add_lead_note", { ...args, text: "Jiný text" });
      expect(conflict).toMatchObject({ isError: true });

      const notes = await rows(sql`SELECT author_user_id, author_name, body FROM lead_activity WHERE kind = 'note_added'`);
      expect(notes).toEqual([
        { author_user_id: USER, author_name: "Jaroslav Viner (přes ChatGPT)", body: "Volat po 15. 10., zájem o sirupy." },
      ]);
      const audit = await rows(sql`SELECT tool, status, idempotency_key FROM agent_audit_log WHERE tool = 'add_lead_note'`);
      expect(audit).toEqual([{ tool: "add_lead_note", status: "ok", idempotency_key: "key-lead-note-1" }]);
    });

    it("další krok u leadu nemění datum posledního kontaktu; prázdný požadavek odmítne", async () => {
      const { session } = await connect(true);
      const ok = await call(session, "set_lead_next_step", {
        lead_id: LEAD,
        next_step: "Poslat ceník sirupů",
        follow_up_date: "2026-10-20",
        idempotency_key: "key-next-step-1",
      });
      expect(ok?.structuredContent).toMatchObject({ saved: true });
      const [lead] = await rows(sql`SELECT next_step_note, next_follow_up_at, last_contacted_at FROM leads WHERE id = ${LEAD}`);
      expect(lead).toMatchObject({ next_step_note: "Poslat ceník sirupů", last_contacted_at: null });
      expect(String(lead.next_follow_up_at)).toContain("2026-10-20");

      const empty = await call(session, "set_lead_next_step", { lead_id: LEAD, idempotency_key: "key-next-step-2" });
      expect(empty).toMatchObject({ isError: true });
      const bad = await call(session, "set_lead_next_step", { lead_id: LEAD, follow_up_date: "2026-02-30", idempotency_key: "key-next-step-3" });
      expect(bad).toMatchObject({ isError: true });
    });

    it("poznámka k zákazníkovi se zobrazí v detailu zákazníka", async () => {
      const { session } = await connect(true);
      await call(session, "add_customer_note", { customer_id: ORG, text: "Chtějí ochutnávku.", idempotency_key: "key-org-note-1" });
      const detail = await call(session, "get_customer", { customer_id: ORG });
      expect(detail?.structuredContent).toMatchObject({
        notes: [{ author: "Jaroslav Viner (přes ChatGPT)", text: "Chtějí ochutnávku." }],
      });
    });

    it("úkol v Živé mapě: založení pod oblast, komentář, moje úkoly", async () => {
      const { session } = await connect(true);
      const created = await call(session, "create_company_task", {
        parent_id: AREA,
        title: "Ochutnávka The Cup",
        priority: "high",
        idempotency_key: "key-task-1",
      });
      const taskId = (created?.structuredContent as { id: string }).id;
      expect(taskId).toMatch(/^[0-9a-f-]{36}$/);
      await call(session, "comment_company_task", { task_id: taskId, text: "Termín domluvit s Petrou.", idempotency_key: "key-task-c1" });

      const detail = await call(session, "get_company_task", { task_id: taskId });
      expect(detail?.structuredContent).toMatchObject({
        task: { path: "Obchod › Ochutnávka The Cup", priority: "high" },
        activity: [
          { kind: "comment", author: "Jaroslav Viner (přes ChatGPT)", text: "Termín domluvit s Petrou." },
          { kind: "created" },
        ],
      });
      const list = await call(session, "list_company_tasks", {});
      expect((list?.structuredContent as { tasks: { path: string }[] }).tasks.map((t) => t.path)).toEqual([
        "Obchod",
        "Obchod › Ochutnávka The Cup",
      ]);
    });

    it("můj přehled: lead s dalším kontaktem do 7 dní", async () => {
      const { session } = await connect(false);
      await db.execute(sql`UPDATE leads SET next_follow_up_at = now() + interval '2 days' WHERE id = ${LEAD}`);
      const overview = await call(session, "my_overview");
      expect(overview?.structuredContent).toMatchObject({ leadsToFollowUp: [{ id: LEAD }] });
    });

    it("souhlas jen pro čtení: zápis zamítnut a zalogován, nic se nezapíše", async () => {
      const { session } = await connect(false);
      const denied = await call(session, "add_lead_note", { lead_id: LEAD, text: "x", idempotency_key: "key-denied-1" });
      expect(denied).toMatchObject({ isError: true });
      const audit = await rows(sql`SELECT status, error FROM agent_audit_log WHERE tool = 'add_lead_note' AND status = 'denied'`);
      expect(audit).toEqual([{ status: "denied", error: "scope" }]);
      expect(await rows(sql`SELECT 1 FROM lead_activity WHERE body = 'x'`)).toEqual([]);
    });

    it("bez idempotency_key nebo s neznámým nástrojem", async () => {
      const { session } = await connect(true);
      expect(await call(session, "add_lead_note", { lead_id: LEAD, text: "y" })).toMatchObject({ isError: true });
      expect(await call(session, "delete_everything", {})).toBeNull();
    });

    it("limit zápisů za hodinu", async () => {
      const { session } = await connect(true);
      await db.execute(sql`
        INSERT INTO agent_audit_log (grant_id, user_id, tool, is_write, idempotency_key, status)
        SELECT ${session.grantId}::uuid, ${USER}, 'add_lead_note', true, 'bulk-' || g, 'ok' FROM generate_series(1, 60) g`);
      const limited = await call(session, "add_lead_note", { lead_id: LEAD, text: "z", idempotency_key: "key-limit-1" });
      expect(limited).toMatchObject({ isError: true });
      expect(limited?.content[0].text).toContain("limit");
    });
  });
  describe("kontrola 2: token neovlivní běžné přihlášení ani jiné části aplikace", () => {
    it("souběžně: uvnitř nástroje identita z tokenu, mimo něj vždy cookie session", async () => {
      const { getAuthContext } = await import("@/lib/data/authContext");
      const { session } = await connect(false);
      holder.session = { user: { id: OTHER, name: "Kolega", email: "kolega@begina.cz" } };
      try {
        const [toolResult, ...outside] = await Promise.all([
          call(session, "search_crm", { query: "lípy" }),
          getAuthContext(),
          getAuthContext(),
        ]);
        expect(toolResult?.isError).toBeUndefined(); // EXECUTIVE z tokenu prošel CRM bránou
        for (const ctx of outside) {
          expect(ctx).toMatchObject({ userId: OTHER, systemRole: "CUSTOMER", name: "Kolega" });
        }
        expect(await getAuthContext()).toMatchObject({ userId: OTHER, systemRole: "CUSTOMER" });
      } finally {
        holder.session = null;
      }
    });

    it("CUSTOMER přihlášený cookie neprojde CRM ani během běžícího volání asistenta", async () => {
      const { searchCrm } = await import("@/lib/data/leads");
      const { ForbiddenError } = await import("@/lib/data/errors");
      const { session } = await connect(false);
      holder.session = { user: { id: OTHER, name: "Kolega", email: "kolega@begina.cz" } };
      try {
        const [, direct] = await Promise.allSettled([call(session, "my_overview"), searchCrm("lípy")]);
        expect(direct.status).toBe("rejected");
        expect((direct as PromiseRejectedResult).reason).toBeInstanceOf(ForbiddenError);
      } finally {
        holder.session = null;
      }
    });

    it("bez přihlášení a mimo nástroj je identita null (žádný zbytek po asistentovi)", async () => {
      const { getAuthContext } = await import("@/lib/data/authContext");
      const { session } = await connect(false);
      await call(session, "my_overview");
      expect(await getAuthContext()).toBeNull();
    });

    it("identitu asistenta nastavuje jen MCP server a bearer token čte jen /api/mcp", async () => {
      const { execSync } = await import("node:child_process");
      const root = (await import("node:path")).join(__dirname, "../../..");
      const grep = (pattern: string) =>
        execSync(`grep -rlE '${pattern}' app lib components proxy.ts --include=*.ts --include=*.tsx | grep -v __tests__ || true`, {
          cwd: root,
        })
          .toString()
          .trim()
          .split("\n")
          .filter(Boolean)
          .sort();
      expect(grep("runAsAgent\\(")).toEqual(["lib/agent/mcp/server.ts"]);
      // hlavičku Authorization čte jen MCP (Bearer) a OAuth token/revoke (Basic = ChatGPT jako klient)
      expect(grep('get\\("authorization"\\)')).toEqual(["app/api/mcp/route.ts", "app/api/oauth/revoke/route.ts", "app/api/oauth/token/route.ts"]);
      expect(grep("resolveAccessToken\\(")).toEqual(["app/api/mcp/route.ts", "lib/agent/oauthStore.ts"]);
    });
  });

  describe("kontrola 3: odvolání a idempotence po obnově tokenu", () => {
    it("odvolání v MojeBegina zablokuje už vydaný access token i jeho refresh token", async () => {
      const { tokens, session } = await connect(true);
      expect(await store.revokeOwnGrant(db, USER, session.grantId)).toBe(true);
      expect(await store.resolveAccessToken(db, config, tokens.access_token)).toBeNull();
      expect(await store.exchangeRefreshToken(db, { clientId: CLIENT, refreshToken: tokens.refresh_token })).toMatchObject({ ok: false });
    });

    it("odvolání tokenem z ChatGPT (RFC 7009) zablokuje i access token vydaný obnovou", async () => {
      const { tokens } = await connect(false);
      const rotated = await store.exchangeRefreshToken(db, { clientId: CLIENT, refreshToken: tokens.refresh_token });
      if (!rotated.ok) throw new Error("obnova selhala");
      await store.revokeByToken(db, tokens.access_token); // starý, už nahrazený token
      expect(await store.resolveAccessToken(db, config, rotated.body.access_token)).toBeNull();
    });

    it("stejný idempotency_key po obnově tokenu i po novém připojení nic nezapíše podruhé", async () => {
      const args = { lead_id: LEAD, text: "Idempotence přes refresh", idempotency_key: "key-refresh-0001" };
      const first = await connect(true);
      expect((await call(first.session, "add_lead_note", args))?.structuredContent).toMatchObject({ saved: true });

      const rotated = await store.exchangeRefreshToken(db, { clientId: CLIENT, refreshToken: first.tokens.refresh_token });
      if (!rotated.ok) throw new Error("obnova selhala");
      const afterRefresh = await store.resolveAccessToken(db, config, rotated.body.access_token);
      expect((await call(afterRefresh!, "add_lead_note", args))?.structuredContent).toMatchObject({ alreadySaved: true });

      const reconnected = await connect(true); // nový souhlas (jiný grant), stejný uživatel
      expect((await call(reconnected.session, "add_lead_note", args))?.structuredContent).toMatchObject({ alreadySaved: true });

      expect(await rows(sql`SELECT count(*)::int AS n FROM lead_activity WHERE body = 'Idempotence přes refresh'`)).toEqual([{ n: 1 }]);
    });
  });

  describe("kontrola 4: audit bez tokenů, tajemství a obsahu CRM", () => {
    it("v tabulkách asistenta není token, secret, text poznámky ani hledané jméno", async () => {
      const { tokens, session } = await connect(true);
      const NOTE = "Tajná obchodní poznámka 4711";
      await call(session, "search_crm", { query: "Petra Malá" });
      await call(session, "add_lead_note", { lead_id: LEAD, text: NOTE, idempotency_key: "key-audit-0001", access_token: tokens.access_token });
      await call(session, "set_lead_next_step", { lead_id: LEAD, next_step: NOTE, follow_up_date: "2026-11-02", idempotency_key: "key-audit-0002" });

      const dump = JSON.stringify([
        await rows(sql`SELECT * FROM agent_audit_log`),
        await rows(sql`SELECT * FROM agent_tokens`),
        await rows(sql`SELECT * FROM agent_grants`),
      ]);
      for (const secret of [tokens.access_token, tokens.refresh_token, config.clientSecret, NOTE, "Petra Malá", VERIFIER]) {
        expect(dump).not.toContain(secret);
      }
      const audit = await rows(sql`SELECT tool, args FROM agent_audit_log WHERE idempotency_key IN ('key-audit-0001', 'key-audit-0002') ORDER BY idempotency_key`);
      expect(audit).toEqual([
        { tool: "add_lead_note", args: { lead_id: LEAD, text: `[${NOTE.length} znaků]`, access_token: `[${tokens.access_token.length} znaků]` } },
        { tool: "set_lead_next_step", args: { lead_id: LEAD, next_step: `[${NOTE.length} znaků]`, follow_up_date: "2026-11-02" } },
      ]);
      // obsah je uložený jen tam, kam patří — v historii leadu (poznámka + další krok)
      expect(await rows(sql`SELECT kind FROM lead_activity WHERE body = ${NOTE} ORDER BY kind`)).toEqual([
        { kind: "next_step_set" },
        { kind: "note_added" },
      ]);
    });
  });

  describe("pilot jen ke čtení (MCP_ALLOW_WRITE nenastaveno)", () => {
    it("ani souhlas se zápisem nedá zápisové nástroje; volání zápisu se zamítne", async () => {
      const readOnlyConfig = { ...config, writeEnabled: false };
      const { session } = await connect(true);
      const names = mcp.agentMcpServer(db, session, readOnlyConfig).listTools().map((t) => t.name);
      expect(names.some((n) => n.startsWith("add_") || n.startsWith("set_") || n.startsWith("create_") || n.startsWith("comment_"))).toBe(false);
      const denied = await mcp.callAgentTool(db, session, readOnlyConfig, "add_lead_note", {
        lead_id: LEAD,
        text: "nesmí se zapsat",
        idempotency_key: "key-readonly-0001",
      });
      expect(denied).toMatchObject({ isError: true });
      expect(await rows(sql`SELECT 1 FROM lead_activity WHERE body = 'nesmí se zapsat'`)).toEqual([]);
    });
  });
});
