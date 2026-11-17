// Ekonomika 1.1 — economy_update_entry / economy_delete_entry: úprava a mazání
// řádků s historií, idempotence a součet měsíce bez smazaných řádků (PGlite).
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "moje.begina.example", "x-forwarded-proto": "https" }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: null }) } }));
vi.mock("@/lib/data/admin", () => ({ createCustomerOrganization: async () => ({ ok: false }) }));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const LUCIE = "f9f93f03-92b0-4724-becd-c0a3576b5275";
const KOLEGA = "00000000-0000-4000-8000-00000000c0de";
const REDIRECT = "https://chatgpt.com/connector/oauth/abc123";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const CLIENT = "chatgpt-mojebegina";
const SECRET = "s".repeat(40);
const ISSUER = "https://gpt-pilot.begina.cz";

describe("MCP Ekonomika — úprava a mazání", { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let store: typeof import("../oauthStore");
  let mcp: typeof import("../mcp/server");
  let config: NonNullable<ReturnType<typeof import("../config").agentConfig>>;
  type Session = import("../oauthStore").AgentSession;
  let lucie: Session;
  let kolega: Session;

  async function connect(userId: string, role: "ADMIN" | "EXECUTIVE", write: boolean): Promise<Session> {
    const code = await store.issueAuthorizationCode(db, { userId, systemRole: role, clientId: CLIENT, write, invoicing: write, redirectUri: REDIRECT, codeChallenge: CHALLENGE });
    const tokens = await store.exchangeAuthorizationCode(db, { clientId: CLIENT, code, redirectUri: REDIRECT, codeVerifier: VERIFIER });
    if (!tokens.ok) throw new Error(tokens.description);
    const session = await store.resolveAccessToken(db, config, tokens.body.access_token);
    if (!session) throw new Error("token neplatí");
    return session;
  }
  const call = async (session: Session, name: string, args: Record<string, unknown>) => {
    const result = await mcp.callAgentTool(db, session, config, name, args);
    if (!result) throw new Error(`nástroj ${name} neexistuje`);
    const text = result.content.map((c) => ("text" in c ? c.text : "")).join("");
    return { isError: result.isError === true, data: (result.structuredContent ?? {}) as Record<string, any>, text }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const listed = (session: Session) => mcp.agentMcpServer(db, session, config).listTools().map((t) => t.name);

  beforeAll(async () => {
    process.env.DATABASE_URL = "postgresql://u:p@ep-test.neon.tech/neondb";
    process.env.MCP_OAUTH_CLIENT_SECRET = SECRET;
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    ({ db } = await import("@/lib/db/client"));
    store = await import("../oauthStore");
    mcp = await import("../mcp/server");
    const { agentConfig } = await import("../config");
    config = agentConfig({
      MCP_ISSUER: ISSUER,
      MCP_OAUTH_CLIENT_ID: CLIENT,
      MCP_OAUTH_CLIENT_SECRET: SECRET,
      MCP_OAUTH_REDIRECT_URIS: REDIRECT,
      MCP_ALLOWED_USER_IDS: `${VINER},${LUCIE},${KOLEGA}`,
      MCP_ALLOW_WRITE: "on",
      MCP_ALLOW_INVOICING: "on",
    })!;
    for (const statement of [
      `INSERT INTO user_roles (user_id, system_role) VALUES ('${LUCIE}', 'EXECUTIVE'), ('${KOLEGA}', 'EXECUTIVE')`,
      `INSERT INTO user_profiles (user_id, name, email) VALUES ('${LUCIE}', 'Lucie Königsbergová', 'lucie@begina.cz'), ('${KOLEGA}', 'Kolega', 'kolega@begina.cz')`,
    ]) {
      await db.execute(sql.raw(statement));
    }
    lucie = await connect(LUCIE, "EXECUTIVE", true);
    kolega = await connect(KOLEGA, "EXECUTIVE", true);
  }, 120_000);

  beforeEach(() => {
    process.env.MCP_OAUTH_CLIENT_SECRET = SECRET;
  });

  const add = async (date: string, title: string, counterparty: string, amount: number, note?: string) => {
    const result = await call(lucie, "economy_add_entry", { kind: "cost", date, title, counterparty, amount_kc: amount, ...(note ? { note } : {}), idempotency_key: randomUUID() });
    expect(result.isError, result.text).toBe(false);
  };
  const list = async () => {
    const result = await call(lucie, "economy_list_entries", { kind: "cost", month: "2026-11" });
    expect(result.isError, result.text).toBe(false);
    return result.data as { totalKc: number; count: number; entries: { id: string; title: string; note: string | null; amountKc: number }[] };
  };

  it("nástroje vidí jen Jaroslav a Lucie", () => {
    expect(listed(lucie)).toEqual(expect.arrayContaining(["economy_update_entry", "economy_delete_entry"]));
    expect(listed(kolega).filter((n) => n.startsWith("economy_"))).toEqual([]);
  });

  it("smazání poznámky, smazání řádku s důvodem, historie a součet bez smazaných", async () => {
    await add("2026-11-02", "Čisticí prostředky", "Allegro - ItaPolandChemia", 661, "není faktura");
    await add("2026-11-17", "Pěnové vložky do bot", "Allegro - insoles_pl", 312, "není faktura");
    const before = await list();
    expect(before.totalKc).toBe(973);
    const chemia = before.entries.find((e) => e.amountKc === 661)!;
    const insoles = before.entries.find((e) => e.amountKc === 312)!;
    expect(chemia.id).toMatch(/^[0-9a-f-]{36}$/);

    const key = randomUUID();
    const upd = await call(lucie, "economy_update_entry", { id: chemia.id, note: "", idempotency_key: key });
    expect(upd.isError, upd.text).toBe(false);
    expect(upd.data.updated).toBe(true);
    const again = await call(lucie, "economy_update_entry", { id: chemia.id, note: "", idempotency_key: key });
    expect(again.isError, again.text).toBe(false);

    expect((await call(lucie, "economy_delete_entry", { id: insoles.id, idempotency_key: randomUUID() })).isError).toBe(true); // bez důvodu ne
    const del = await call(lucie, "economy_delete_entry", { id: insoles.id, reason: "není firemní náklad", idempotency_key: randomUUID() });
    expect(del.isError, del.text).toBe(false);
    expect((await call(lucie, "economy_delete_entry", { id: insoles.id, reason: "znovu", idempotency_key: randomUUID() })).isError).toBe(true);
    expect((await call(lucie, "economy_update_entry", { id: insoles.id, note: "x", idempotency_key: randomUUID() })).isError).toBe(true);

    const after = await list();
    expect(after.count).toBe(1);
    expect(after.totalKc).toBe(661);
    expect(after.entries[0].note).toBeNull();

    const history = (await db.execute(sql`SELECT action, changes, reason, changed_by_name FROM economy_entry_changes ORDER BY created_at`)).rows;
    expect(history).toHaveLength(2); // stejný idempotency_key nezapsal úpravu podruhé
    expect(history[0]).toMatchObject({ action: "update", changes: { note: { old: "není faktura", new: null } } });
    expect(history[1]).toMatchObject({ action: "delete", reason: "není firemní náklad", changes: { amountHal: { old: 312 } } });
  });

  it("u nákladu nejde vyplnit číslo faktury; bez polí není co měnit", async () => {
    await add("2026-11-05", "Koření", "Profi koření", 700);
    const row = (await list()).entries.find((e) => e.amountKc === 700)!;
    expect((await call(lucie, "economy_update_entry", { id: row.id, invoice_number: "123", idempotency_key: randomUUID() })).isError).toBe(true);
    expect((await call(lucie, "economy_update_entry", { id: row.id, idempotency_key: randomUUID() })).isError).toBe(true);
  });
});
