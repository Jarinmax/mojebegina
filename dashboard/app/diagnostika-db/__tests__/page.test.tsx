// GPT/MCP pilot — stránka /diagnostika-db: kdo ji uvidí a co nikdy
// neukáže. Přihlášení přes Neon Auth lokálně nejde, proto je identita
// i databáze podvržená (vi.mock); vlastní render je skutečný.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const USER = "neondb_owner";
const PASSWORD = "npg_TAJNEheslo123";
const PILOT_HOST = "ep-bold-fire-b2x24ylv-pooler.c-6.eu-central-1.aws.neon.tech";

const state = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  ctx: null as null | { userId: string; systemRole: string; grantedRoles: string[]; roleSelectionRequired: boolean; name: string | null; email: string },
  execute: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/data/authContext", () => ({ getAuthContext: state.getAuthContext }));
vi.mock("@/lib/db/client", () => ({ db: { execute: state.execute } }));

import DbDiagnosticsPage from "../page";

const ADMIN = { userId: "u1", systemRole: "ADMIN", grantedRoles: ["ADMIN"], roleSelectionRequired: false, name: "J", email: "j@example.cz" };

async function render(): Promise<string> {
  return renderToStaticMarkup(await DbDiagnosticsPage());
}

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc1234def5678");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "claude/upbeat-goodall-pj64t5");
  vi.stubEnv("DATABASE_URL", `postgresql://${USER}:${PASSWORD}@${PILOT_HOST}/neondb?sslmode=require`);
  vi.stubEnv("PGHOST", PILOT_HOST);
  vi.stubEnv("PGDATABASE", "neondb");
  vi.stubEnv("PGUSER", USER);
  vi.stubEnv("PGPASSWORD", PASSWORD);
  state.ctx = ADMIN;
  state.getAuthContext.mockReset();
  state.getAuthContext.mockImplementation(async () => state.ctx);
  state.execute.mockReset();
  state.execute.mockResolvedValue({
    rows: [{ branch_id: "br-super-dust-b2wbw2wk", endpoint_id: "ep-bold-fire-b2x24ylv", timeline_id: "c70254c51c443a004abce759abaa576d" }],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/diagnostika-db", () => {
  it("ADMIN na Preview: hostname, SHA, odpověď databáze a verdikt; žádné tajemství", async () => {
    const html = await render();
    expect(html).toContain(PILOT_HOST);
    expect(html).toContain("ep-bold-fire-b2x24ylv.neonauth.c-6.eu-central-1.aws.neon.tech");
    expect(html).toContain("abc1234def5678");
    expect(html).toContain("br-super-dust-b2wbw2wk");
    expect(html).toContain("Shoda: deployment používá Preview větev pilotu");
    for (const secret of [USER, PASSWORD, "postgresql://", "sslmode", "/neondb"]) {
      expect(html).not.toContain(secret);
    }
  });

  it("produkční PGHOST (Neon Auth) = varování, i když DATABASE_URL sedí", async () => {
    vi.stubEnv("PGHOST", "ep-orange-lake-b2zctiy8-pooler.c-6.eu-central-1.aws.neon.tech");
    expect(await render()).toContain("POZOR: deployment používá PRODUKČNÍ databázi");
  });

  it("chyba dotazu: jen typ chyby, ne její text", async () => {
    state.execute.mockRejectedValue(new TypeError(`connect failed postgresql://${USER}:${PASSWORD}@${PILOT_HOST}`));
    const html = await render();
    expect(html).toContain("TypeError");
    expect(html).toContain("Nelze rozhodnout");
    expect(html).not.toContain(PASSWORD);
    expect(html).not.toContain("connect failed");
  });

  it("nepřihlášený na Preview → /login s návratem sem (ne na Organizace)", async () => {
    state.ctx = null;
    await expect(render()).rejects.toThrow("NEXT_REDIRECT /login?next=%2Fdiagnostika-db");
    expect(state.execute).not.toHaveBeenCalled();
  });

  it("nevybraná role → výběr role, bez dotazu do DB", async () => {
    state.ctx = { ...ADMIN, grantedRoles: ["ADMIN", "EXECUTIVE"], roleSelectionRequired: true };
    await expect(render()).rejects.toThrow("NEXT_REDIRECT /vyber-roli");
    expect(state.execute).not.toHaveBeenCalled();
  });

  it.each([
    ["Production", () => vi.stubEnv("VERCEL_ENV", "production")],
    ["Production nepřihlášený", () => (vi.stubEnv("VERCEL_ENV", "production"), (state.ctx = null))],
    ["lokální vývoj", () => vi.stubEnv("VERCEL_ENV", "")],
  ])("%s → 404 ještě před přihlášením, žádný dotaz do DB", async (_label, arrange) => {
    arrange();
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.getAuthContext).not.toHaveBeenCalled();
    expect(state.execute).not.toHaveBeenCalled();
  });

  it.each([
    ["EXECUTIVE", { ...ADMIN, systemRole: "EXECUTIVE", grantedRoles: ["EXECUTIVE"] }],
    ["CUSTOMER", { ...ADMIN, systemRole: "CUSTOMER", grantedRoles: ["CUSTOMER"] }],
  ])("%s na Preview → 404 a žádný dotaz do DB", async (_label, ctx) => {
    state.ctx = ctx;
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.execute).not.toHaveBeenCalled();
  });
});
