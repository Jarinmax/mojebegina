// Projekt Begina 1.0 — nástroje asistenta project_overview / project_read_area /
// project_write nad skutečnou datovou vrstvou (PGlite s migracemi).
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

describe("MCP Projekt Begina", { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let store: typeof import("../oauthStore");
  let mcp: typeof import("../mcp/server");
  let config: NonNullable<ReturnType<typeof import("../config").agentConfig>>;
  type Session = import("../oauthStore").AgentSession;
  let lucie: Session;
  let kolega: Session;

  async function connect(userId: string, role: "ADMIN" | "EXECUTIVE", write: boolean): Promise<Session> {
    const code = await store.issueAuthorizationCode(db, { userId, systemRole: role, clientId: CLIENT, write, redirectUri: REDIRECT, codeChallenge: CHALLENGE });
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

  it("nástroje vidí jen Jaroslav a Lucie", () => {
    expect(listed(lucie)).toEqual(expect.arrayContaining(["project_overview", "project_read_area", "project_write"]));
    expect(listed(kolega).filter((n) => n.startsWith("project_"))).toEqual([]);
  });

  it("zápis stavu, rozhodnutí a výstupu; nejnovější stav platí; opakování nezapíše druhý řádek", async () => {
    const key = randomUUID();
    const first = await call(lucie, "project_write", { area: "etikety", kind: "decision", title: "Sirupy všude 650 ml, cena 199 Kč", idempotency_key: key });
    expect(first.isError, first.text).toBe(false);
    expect(first.data.created).toBe(true);
    const again = await call(lucie, "project_write", { area: "etikety", kind: "decision", title: "Sirupy všude 650 ml, cena 199 Kč", idempotency_key: key });
    expect(again.isError, again.text).toBe(false);
    const [{ n }] = (await db.execute(sql`SELECT count(*)::int AS n FROM project_entries WHERE kind = 'decision'`)).rows;
    expect(n).toBe(1); // stejný idempotency_key = žádný druhý řádek

    await call(lucie, "project_write", { area: "etikety", kind: "status", text: "Starý stav", idempotency_key: randomUUID() });
    await call(lucie, "project_write", { area: "etikety", kind: "status", text: "Polévky hotové, sirupy čekají na tisk.", idempotency_key: randomUUID() });
    const output = await call(lucie, "project_write", { area: "etikety", kind: "output", title: "Etikety polévek PDF", url: "https://begina.cz/etikety.pdf", idempotency_key: randomUUID() });
    expect(output.isError, output.text).toBe(false);

    const area = await call(lucie, "project_read_area", { area: "etikety" });
    expect(area.isError, area.text).toBe(false);
    expect(area.data.status).toMatchObject({ text: "Polévky hotové, sirupy čekají na tisk.", author: "Lucie Königsbergová (přes asistenta)" });
    expect(area.data.decisions).toHaveLength(1);
    expect(area.data.outputs).toEqual([expect.objectContaining({ title: "Etikety polévek PDF", url: "https://begina.cz/etikety.pdf" })]);

    const overview = await call(lucie, "project_overview", {});
    expect(overview.data.areas).toHaveLength(18);
    expect(overview.data.areas.find((a: { area: string }) => a.area === "etikety")).toMatchObject({ decisions: 1, outputs: 1 });
  });

  it("špatná oblast, prázdný stav a nebezpečný odkaz neprojdou", async () => {
    expect((await call(lucie, "project_write", { area: "x", kind: "status", text: "a", idempotency_key: randomUUID() })).isError).toBe(true);
    expect((await call(lucie, "project_write", { area: "web", kind: "status", idempotency_key: randomUUID() })).isError).toBe(true);
    expect((await call(lucie, "project_write", { area: "web", kind: "output", title: "x", url: "javascript:alert(1)", idempotency_key: randomUUID() })).isError).toBe(true);
  });
});
