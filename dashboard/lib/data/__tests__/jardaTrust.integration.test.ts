// Svěřené peníze Jardy nad skutečným Postgresem (ovladač Neonu → PGlite se
// všemi migracemi): oprávnění, zápis, zrušení, změna pravidelné platby.
// Smyšlená čísla a data — skutečné částky do repozitáře nepatří.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const holder = vi.hoisted(() => ({
  db: null as unknown,
  ctx: null as null | { userId: string; systemRole: string; grantedRoles: string[]; roleSelectionRequired: boolean; name: string | null; email: string },
  today: "2030-01-20",
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ get db() { return holder.db; } }));
vi.mock("../authContext", () => ({ getAuthContext: async () => holder.ctx }));
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: null }) } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("../pragueTime", async (orig) => ({ ...(await orig<typeof import("../pragueTime")>()), pragueDateString: () => holder.today }));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f";
const LUCIE = "f9f93f03-92b0-4724-becd-c0a3576b5275";
const as = (userId: string, systemRole: string, name: string) =>
  (holder.ctx = { userId, systemRole, grantedRoles: [systemRole], roleSelectionRequired: false, name, email: `${userId}@x.cz` });
const asViner = () => as(VINER, "ADMIN", "Jaroslav Viner");
const asJarda = () => as(BLAHOUT, "EXECUTIVE", "Jaroslav Blahout");
const asLucie = () => as(LUCIE, "EXECUTIVE", "Lucie Königsbergová");
const asStrelec = () => as("user-strelec", "EXECUTIVE", "Jiří Střelec");

describe("Svěřené peníze Jardy nad DB", { timeout: 120_000 }, () => {
  let jt: typeof import("../jardaTrust");

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    holder.db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    jt = await import("../jardaTrust");
  });

  it("Viner zapíše vklad, Lucie pravidelnou platbu; vidí Jarda, Viner i Lucie", async () => {
    // Smyšlená data (ne skutečné částky).
    asViner();
    expect(await jt.addJardaTrustEntry({ kind: "deposit", amountKc: 12300, entryDate: "2030-01-05", description: "Vklad" })).toEqual({ ok: true });
    asLucie();
    expect(await jt.setJardaRecurring({ label: "Platba", amountKc: 1000, dayOfMonth: 10, fromMonth: "2030-02" })).toEqual({ ok: true });
    for (const who of [asJarda, asViner, asLucie]) {
      who();
      const v = await jt.getJardaTrustView();
      expect(v).toMatchObject({ depositedKc: 12300, balanceKc: 12300 });
      expect(v.forecast).toMatchObject({ nextDue: { date: "2030-02-10", amountKc: 1000 }, coveredCount: 12, remainderKc: 300 });
      expect(v.plans[0]).toMatchObject({ label: "Platba", amountKc: 1000, dayOfMonth: 10, startMonth: "2030-02" });
    }
    asJarda();
    expect((await jt.getJardaTrustView()).canEdit).toBe(false);
    asLucie();
    expect((await jt.getJardaTrustView()).canEdit).toBe(true);
  });

  it("nikdo jiný nevidí; Jarda nezapisuje", async () => {
    asStrelec();
    await expect(jt.getJardaTrustView()).rejects.toThrow();
    holder.ctx = null;
    await expect(jt.getJardaTrustView()).rejects.toThrow();
    asJarda();
    await expect(jt.addJardaTrustEntry({ kind: "withdrawal", amountKc: 100, entryDate: "2030-01-20", description: "x" })).rejects.toThrow();
    await expect(jt.setJardaRecurring({ label: "x", amountKc: 100, dayOfMonth: 10, fromMonth: "2030-03" })).rejects.toThrow();
  });

  it("oprava výše, dokud se ještě neodečítá; pak jen od dalšího měsíce", async () => {
    asLucie();
    expect(await jt.setJardaRecurring({ label: "Platba", amountKc: 1200, dayOfMonth: 10, fromMonth: "2030-02" })).toEqual({ ok: true });
    let v = await jt.getJardaTrustView();
    expect(v.plans).toHaveLength(1);
    expect(v.plans[0]).toMatchObject({ amountKc: 1200, startMonth: "2030-02" });
    expect(v.plans[0].note).toContain("Opraveno 2030-01-20: 1000 → 1200 Kč od 2030-02.");
    expect(await jt.setJardaRecurring({ label: "Platba", amountKc: 1000, dayOfMonth: 10, fromMonth: "2030-02" })).toEqual({ ok: true });

    holder.today = "2030-03-20"; // únor a březen už odečteny
    expect(await jt.setJardaRecurring({ label: "Platba", amountKc: 1100, dayOfMonth: 10, fromMonth: "2030-03" })).toMatchObject({ ok: false });
    expect(await jt.setJardaRecurring({ label: "Platba", amountKc: 1100, dayOfMonth: 10, fromMonth: "2030-04" })).toEqual({ ok: true });
    v = await jt.getJardaTrustView();
    expect(v.plans.map((p) => [p.amountKc, p.startMonth, p.endMonth])).toEqual([
      [1000, "2030-02", "2030-03"],
      [1100, "2030-04", null],
    ]);
    expect(v.balanceKc).toBe(10300);
    expect(v.forecast.nextDue).toMatchObject({ date: "2030-04-10", amountKc: 1100 });
  });

  it("jednorázová platba a vklad; chybný záznam se zruší (nesmaže)", async () => {
    asViner();
    expect(await jt.addJardaTrustEntry({ kind: "withdrawal", amountKc: 0, entryDate: "2030-03-20", description: "x" })).toMatchObject({ ok: false });
    expect(await jt.addJardaTrustEntry({ kind: "withdrawal", amountKc: 80, entryDate: "2030-03-20", description: "" })).toMatchObject({ ok: false });
    expect(await jt.addJardaTrustEntry({ kind: "withdrawal", amountKc: 80, entryDate: "2030-03-20", description: "Výdaj" })).toEqual({ ok: true });
    expect(await jt.addJardaTrustEntry({ kind: "deposit", amountKc: 999, entryDate: "2030-03-20", description: "omyl" })).toEqual({ ok: true });
    let v = await jt.getJardaTrustView();
    expect(v.balanceKc).toBe(10300 - 80 + 999);
    const wrong = v.lines.find((l) => l.label === "omyl")!;
    expect(await jt.cancelJardaTrustEntry(wrong.entryId!)).toEqual({ ok: true });
    expect(await jt.cancelJardaTrustEntry(wrong.entryId!)).toEqual({ ok: false, error: "Záznam nenalezen." });
    v = await jt.getJardaTrustView();
    expect(v.balanceKc).toBe(10220);
    const [{ n }] = (await (holder.db as { execute: (q: unknown) => Promise<{ rows: { n: number }[] }> }).execute(sql.raw(`SELECT count(*)::int AS n FROM trust_entries WHERE cancelled_at IS NOT NULL`))).rows;
    expect(n).toBe(1);
  });
});
