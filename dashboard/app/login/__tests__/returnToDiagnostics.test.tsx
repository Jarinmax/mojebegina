// GPT/MCP pilot — regrese: odkaz na /diagnostika-db v nepřihlášeném
// prohlížeči nesmí po přihlášení skončit na "/" → /admin (Organizace).
// Celý řetěz: stránka diagnostiky → /login?next=… → po přihlášení zpět.
import { existsSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ session: null as null | { user: { id: string } } }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: state.session }) } }));
vi.mock("@/lib/auth/client", () => ({ authClient: { signIn: { email: vi.fn() } } }));

import LoginPage from "../page";
import { DB_DIAGNOSTICS_PATH } from "@/lib/diagnostics/dbTarget";

// Přesně to, co pošle stránka diagnostiky nepřihlášenému (app/diagnostika-db/page.tsx).
const LOGIN_URL = `/login?next=${encodeURIComponent(DB_DIAGNOSTICS_PATH)}`;

function loginProps(url: string) {
  const next = new URL(url, "https://preview.example").searchParams.get("next");
  return { params: Promise.resolve({}), searchParams: Promise.resolve(next === null ? {} : { next }) } as unknown as PageProps<"/login">;
}

beforeEach(() => {
  state.session = null;
});

describe("návrat na diagnostiku DB po přihlášení", () => {
  it("diagnostika není pod /admin (jeho layout návratovou adresu neumí)", () => {
    const appDir = path.resolve(__dirname, "../..");
    expect(existsSync(path.join(appDir, "diagnostika-db/page.tsx"))).toBe(true);
    expect(existsSync(path.join(appDir, "admin/diagnostika-db"))).toBe(false);
  });

  it("formulář dostane next=/diagnostika-db (po odeslání tam vede window.location)", async () => {
    // LoginForm je klientská komponenta — ověříme její props v React stromu.
    const tree = await LoginPage(loginProps(LOGIN_URL));
    const form = findByProp(tree, "next");
    expect(form?.props.next).toBe(DB_DIAGNOSTICS_PATH);
  });

  it("už přihlášený ADMIN → rovnou zpět na diagnostiku, ne na /", async () => {
    state.session = { user: { id: "u1" } };
    await expect(LoginPage(loginProps(LOGIN_URL))).rejects.toThrow(`NEXT_REDIRECT ${DB_DIAGNOSTICS_PATH}`);
  });

  it("jiné cíle zůstávají zakázané", async () => {
    state.session = { user: { id: "u1" } };
    await expect(LoginPage(loginProps("/login?next=%2Fadmin"))).rejects.toThrow("NEXT_REDIRECT /");
    await expect(LoginPage(loginProps("/login?next=https%3A%2F%2Fevil.example"))).rejects.toThrow("NEXT_REDIRECT /");
  });
});

type Node = { props?: Record<string, unknown> & { children?: unknown } } | null | undefined;

function findByProp(node: unknown, prop: string): { props: Record<string, unknown> } | null {
  const n = node as Node;
  if (!n || typeof n !== "object") return null;
  if (Array.isArray(n)) {
    for (const child of n) {
      const found = findByProp(child, prop);
      if (found) return found;
    }
    return null;
  }
  if (n.props && prop in n.props) return n as { props: Record<string, unknown> };
  return findByProp(n.props?.children, prop);
}
