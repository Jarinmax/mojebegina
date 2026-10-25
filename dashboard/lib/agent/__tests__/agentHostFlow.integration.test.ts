// GPT/MCP pilot — celý OAuth tok PŘES PILOTNÍ DOMÉNU gpt-pilot.begina.cz:
// každý požadavek nejdřív projde skutečným proxy.ts (výchozí 404) a teprve
// když projde, obslouží ho skutečný route handler / stránka / serverová
// akce. Databáze = PGlite se všemi migracemi přes ovladač Neonu (nikdy
// skutečný Neon). Neon Auth je jediné, co je podvržené: jeho handler
// (/api/auth/[...path]) a session — skutečný Neon Auth lokálně nejde.
//
// discovery → 401 bez tokenu → souhlas → přihlášení → návrat na souhlas →
// Povolit → kód → token → read-only volání /api/mcp.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";

const holder = vi.hoisted(() => ({
  db: null as unknown,
  session: null as null | { user: { id: string; name: string; email: string } },
  headers: new Headers(),
  signInCalls: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), { redirectUrl: url });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { notFound: true });
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => holder.headers,
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
// Neon Auth: session prohlížeče a handler /api/auth (přihlášení e-mailem).
vi.mock("@/lib/auth/server", () => ({
  sessionAuth: {
    getSession: async () => ({ data: holder.session }),
  },
  auth: {
    handler: () => ({
      GET: async () => new Response("upstream GET", { status: 200 }),
      POST: async (request: Request) => {
        const path = new URL(request.url).pathname;
        holder.signInCalls.push(path);
        const body = (await request.json()) as { email?: string; password?: string };
        if (path === "/api/auth/sign-in/email" && body.email === EMAIL && body.password === "správné-heslo") {
          holder.session = { user: { id: USER, name: "Jaroslav Viner", email: EMAIL } };
          return Response.json({ user: { id: USER } });
        }
        return Response.json({ message: "Invalid email or password" }, { status: 401 });
      },
    }),
  },
}));
vi.mock("@/lib/data/admin", () => ({ createCustomerOrganization: async () => ({ ok: false }) }));

const HOST = "gpt-pilot.begina.cz";
const ISSUER = `https://${HOST}`;
const USER = "user-jaroslav";
const EMAIL = "jaroslav@begina.cz";
const LEAD = "00000000-0000-4000-8000-0000000000c1";
const REDIRECT = "https://chatgpt.com/connector/oauth/abc123";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const CLIENT = "chatgpt-mojebegina";
const SECRET = "a".repeat(64);
const ENV = {
  VERCEL_ENV: "preview",
  MCP_ISSUER: ISSUER,
  MCP_OAUTH_CLIENT_ID: CLIENT,
  MCP_OAUTH_CLIENT_SECRET: SECRET,
  MCP_OAUTH_REDIRECT_URIS: REDIRECT,
  MCP_ALLOWED_USER_IDS: USER,
  // MCP_ALLOW_WRITE záměrně nenastaveno — pilot jen ke čtení
};

/** Text z React stromu (bez renderu komponent — stačí na kontrolu obsahu stránky). */
function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  const props = (node as { props?: Record<string, unknown> }).props;
  return props ? textOf(props.children) : "";
}

/** První prvek stromu s daným prop (např. LoginForm s `next`). */
function findProp(node: unknown, prop: string): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProp(child, prop);
      if (found) return found;
    }
    return null;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (!props) return null;
  if (prop in props) return props;
  return findProp(props.children, prop);
}

type Result = { status: number; location?: string | null; json?: unknown; text?: string; tree?: unknown; headers?: Headers };

describe("pilotní doména gpt-pilot.begina.cz — celý OAuth tok přes proxy.ts", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let proxy: typeof import("@/proxy").proxy;

  /**
   * Jeden požadavek „z internetu“ na pilotní doménu: nejdřív proxy.ts, pak
   * skutečný cíl. Cokoli, co proxy nepustí, končí 404 a cíl se nespustí.
   */
  async function hit(
    pathAndQuery: string,
    init: { method?: string; headers?: Record<string, string>; body?: string; form?: FormData } = {}
  ): Promise<Result> {
    const method = init.method ?? "GET";
    const url = `${ISSUER}${pathAndQuery}`;
    const reqHeaders = { host: HOST, ...init.headers };
    const gate = proxy(new NextRequest(url, { method, headers: reqHeaders }));
    if (gate.headers.get("x-middleware-next") !== "1") return { status: gate.status, text: await gate.text() };

    holder.headers = new Headers(reqHeaders);
    const request = new Request(url, { method, headers: reqHeaders, body: init.body });
    const { pathname, searchParams } = new URL(url);
    const searchObject = Object.fromEntries(searchParams);
    const asResponse = async (response: Response): Promise<Result> => {
      const text = await response.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      return { status: response.status, json, text, headers: response.headers };
    };
    const asPage = async (render: () => Promise<unknown>): Promise<Result> => {
      try {
        return { status: 200, tree: await render() };
      } catch (error) {
        const e = error as { redirectUrl?: string; notFound?: boolean };
        if (e.redirectUrl) return { status: 307, location: e.redirectUrl };
        if (e.notFound) return { status: 404 };
        throw error;
      }
    };

    switch (`${method} ${pathname}`) {
      case "GET /.well-known/oauth-authorization-server":
        return asResponse((await import("@/app/.well-known/oauth-authorization-server/route")).GET());
      case "GET /.well-known/oauth-protected-resource/api/mcp":
        return asResponse((await import("@/app/.well-known/oauth-protected-resource/api/mcp/route")).GET());
      case "POST /api/mcp":
        return asResponse(await (await import("@/app/api/mcp/route")).POST(request));
      case "GET /api/mcp":
        return asResponse((await import("@/app/api/mcp/route")).GET());
      case "POST /api/oauth/token":
        return asResponse(await (await import("@/app/api/oauth/token/route")).POST(request));
      case "POST /api/auth/sign-in/email": {
        const { POST } = await import("@/app/api/auth/[...path]/route");
        const ctx = { params: Promise.resolve({ path: ["sign-in", "email"] }) };
        return asResponse(await POST(new NextRequest(request), ctx as never));
      }
      case "GET /login": {
        const { default: LoginPage } = await import("@/app/login/page");
        return asPage(() => LoginPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchObject) } as never));
      }
      case "GET /oauth/authorize": {
        const { default: AuthorizePage } = await import("@/app/oauth/authorize/page");
        return asPage(() => AuthorizePage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchObject) } as never));
      }
      case "POST /oauth/authorize": {
        const { decideAuthorizationAction } = await import("@/app/oauth/authorize/actions");
        return asPage(() => decideAuthorizationAction(init.form ?? new FormData()));
      }
      default:
        throw new Error(`Test nemá cíl pro ${method} ${pathname} — proxy ho ale pustil!`);
    }
  }

  const rpc = (accessToken: string | null, id: number, method: string, params: Record<string, unknown> = {}) =>
    hit("/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });

  beforeAll(async () => {
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    holder.db = db;
    proxy = (await import("@/proxy")).proxy;

    for (const statement of [
      `INSERT INTO user_roles (user_id, system_role) VALUES ('${USER}', 'ADMIN')`,
      `INSERT INTO user_profiles (user_id, name, email) VALUES ('${USER}', 'Jaroslav Viner', '${EMAIL}')`,
      `INSERT INTO leads (id, source, company_name, contact_name, contact_phone, city, owner_user_id)
         VALUES ('${LEAD}', 'existing_database', 'Kavárna U Lípy', 'Petra Malá', '+420 777 111 222', 'Brno', '${USER}')`,
    ]) {
      await db.execute(sql.raw(statement));
    }
  });

  afterAll(() => vi.unstubAllEnvs());

  it("discovery → přihlášení → souhlas → token → read-only /api/mcp", async () => {
    // 1. discovery (ChatGPT, bez přihlášení)
    const resource = await hit("/.well-known/oauth-protected-resource/api/mcp");
    expect(resource.status).toBe(200);
    expect(resource.json).toMatchObject({ resource: `${ISSUER}/api/mcp`, authorization_servers: [ISSUER] });
    const server = await hit("/.well-known/oauth-authorization-server");
    expect(server.json).toMatchObject({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/oauth/authorize`,
      token_endpoint: `${ISSUER}/api/oauth/token`,
      code_challenge_methods_supported: ["S256"],
    });

    // 2. /api/mcp bez tokenu → 401 s odkazem na metadata
    const anonymous = await rpc(null, 1, "ping");
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers?.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${ISSUER}/.well-known/oauth-protected-resource/api/mcp"`
    );
    expect((await hit("/api/mcp")).status).toBe(405);

    // 3. ChatGPT pošle uživatele na souhlas — nepřihlášený → /login s návratem
    const query = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT,
      redirect_uri: REDIRECT,
      state: "st-1",
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
      resource: `${ISSUER}/api/mcp`,
    }).toString();
    const authorizePath = `/oauth/authorize?${query}`;
    const toLogin = await hit(authorizePath);
    expect(toLogin.status).toBe(307);
    const loginUrl = toLogin.location!;
    expect(loginUrl).toBe(`/login?next=${encodeURIComponent(authorizePath)}`);

    // 4. přihlašovací stránka dostane návratovou adresu
    const loginPage = await hit(loginUrl);
    expect(loginPage.status).toBe(200);
    expect(findProp(loginPage.tree, "next")?.next).toBe(authorizePath);

    // 5. přihlášení (jediný endpoint Neon Auth, který formulář volá); prohlížeč
    // posílá Origin pilotní domény — bez něj (nebo s cizím) route odmítne 403
    // a do Neon Auth nic nepošle
    const foreign = await hit("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://zly-web.example" },
      body: JSON.stringify({ email: EMAIL, password: "správné-heslo" }),
    });
    expect(foreign.status).toBe(403);
    const wrong = await hit("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ISSUER },
      body: JSON.stringify({ email: EMAIL, password: "špatně" }),
    });
    expect(wrong.status).toBe(401);
    const signIn = await hit("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ISSUER },
      body: JSON.stringify({ email: EMAIL, password: "správné-heslo" }),
    });
    expect(signIn.status).toBe(200);
    expect(holder.signInCalls).toEqual(["/api/auth/sign-in/email", "/api/auth/sign-in/email"]);

    // 6. návrat na souhlas (už přihlášený /login rovnou přesměruje na next)
    const back = await hit(loginUrl);
    expect(back).toMatchObject({ status: 307, location: authorizePath });
    const consent = await hit(back.location!);
    expect(consent.status).toBe(200);
    const consentText = textOf(consent.tree);
    expect(findProp(consent.tree, "title")?.title).toBe("Propojit ChatGPT s MojeBegina?");
    expect(consentText).toContain("Jaroslav Viner");
    expect(consentText).toContain("Zápisy jsou zatím vypnuté");

    // 7. Povolit (serverová akce na stejné cestě) → návrat do ChatGPT s kódem
    const form = new FormData();
    form.set("query", query);
    form.set("decision", "allow");
    form.set("role", "ADMIN");
    form.set("write", "on"); // i kdyby to někdo poslal, zápis se bez MCP_ALLOW_WRITE neudělí
    const allowed = await hit("/oauth/authorize", { method: "POST", form });
    expect(allowed.status).toBe(307);
    const callback = new URL(allowed.location!);
    expect(`${callback.origin}${callback.pathname}`).toBe(REDIRECT);
    expect(callback.searchParams.get("state")).toBe("st-1");
    expect(callback.searchParams.get("iss")).toBe(ISSUER);
    const code = callback.searchParams.get("code")!;
    expect(code).toMatch(/^mbc_/);

    // 8. token (server ChatGPT, Basic klient)
    const basic = `Basic ${Buffer.from(`${CLIENT}:${SECRET}`).toString("base64")}`;
    const badClient = await hit("/api/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${CLIENT}:x`).toString("base64")}` },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: VERIFIER }).toString(),
    });
    expect(badClient.status).toBe(401);
    const token = await hit("/api/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: basic },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: VERIFIER }).toString(),
    });
    expect(token.status).toBe(200);
    const tokens = token.json as { access_token: string; refresh_token: string; scope: string; token_type: string };
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.scope).toBe("mojebegina.read");

    // 9. read-only volání /api/mcp s tokenem
    const init = await rpc(tokens.access_token, 2, "initialize", { protocolVersion: "2025-06-18", capabilities: {} });
    expect(init.status).toBe(200);
    expect(init.json).toMatchObject({ result: { protocolVersion: "2025-06-18" } });

    const list = await rpc(tokens.access_token, 3, "tools/list");
    const names = ((list.json as { result: { tools: Array<{ name: string }> } }).result.tools).map((t) => t.name).sort();
    expect(names).toEqual([
      "get_company_task",
      "get_customer",
      "get_daily_call_report",
      "get_executive_overview",
      "get_lead",
      "get_salesperson_activity",
      "list_company_tasks",
      "list_leads",
      "my_overview",
      "search_crm",
      "search_mojebegina",
    ]);

    const search = await rpc(tokens.access_token, 4, "tools/call", { name: "search_crm", arguments: { query: "Lípy" } });
    const searchResult = (search.json as { result: { isError?: boolean; content: Array<{ text: string }> } }).result;
    expect(searchResult.isError).not.toBe(true);
    expect(searchResult.content[0].text).toContain("Kavárna U Lípy");

    // zápis nejde ani přímým voláním
    const write = await rpc(tokens.access_token, 5, "tools/call", {
      name: "add_lead_note",
      arguments: { lead_id: LEAD, note: "test", idempotency_key: "k-1" },
    });
    expect((write.json as { result: { isError: boolean } }).result.isError).toBe(true);
    const notes = (await db.execute(sql`SELECT count(*)::int AS n FROM lead_activity WHERE lead_id = ${LEAD}`)).rows[0].n;
    expect(notes).toBe(0);
    const grants = (await db.execute(sql`SELECT scope FROM agent_grants`)).rows;
    expect(grants).toEqual([{ scope: "mojebegina.read" }]);
  });

  it("na pilotní doméně proxy nepustí e-shop, pokladnu, webhook, reset hesla ani interní stránky (cíl se nespustí)", async () => {
    holder.session = { user: { id: USER, name: "Jaroslav Viner", email: EMAIL } }; // ani přihlášenému
    const cases: Array<[string, string]> = [
      ["GET", "/eshop"],
      ["GET", "/eshop/pokladna"],
      ["POST", "/eshop/pokladna"],
      ["GET", "/eshop/kosik"],
      ["GET", "/pokladna"],
      ["POST", "/api/eshop/stripe/webhook"],
      ["GET", "/nastavit-heslo"],
      ["POST", "/api/auth/request-password-reset"],
      ["POST", "/api/auth/forget-password"],
      ["POST", "/api/auth/reset-password"],
      ["POST", "/api/auth/sign-up/email"],
      ["GET", "/api/auth/get-session"],
      ["GET", "/"],
      ["GET", "/admin"],
      ["GET", "/rizeni-firmy"],
      ["GET", "/rizeni-firmy/asistent"],
      ["GET", "/diagnostika-db"],
      ["GET", "/profil"],
      ["POST", "/login"],
    ];
    for (const [method, path] of cases) {
      const result = await hit(path, { method, headers: { "next-action": "x" } });
      expect(result, `${method} ${path}`).toEqual({ status: 404, text: "Not Found" });
    }
    expect(holder.signInCalls).toHaveLength(2); // žádné další volání Neon Auth
  });
});
