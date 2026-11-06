// Hovory a kontakty — historie hovorů a hledání kontaktů nad skutečným
// Postgresem (ovladač Neonu → PGlite se všemi migracemi).
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

const asViner = () => (holder.ctx = { userId: VINER, systemRole: "ADMIN", grantedRoles: ["ADMIN"], roleSelectionRequired: false, name: "Jaroslav Viner", email: "v@begina.cz" });
const asBlahout = () => (holder.ctx = { userId: BLAHOUT, systemRole: "EXECUTIVE", grantedRoles: ["EXECUTIVE"], roleSelectionRequired: false, name: "Jaroslav Blahout", email: "b@begina.cz" });
const asBlahoutCustomer = () => (holder.ctx = { userId: BLAHOUT, systemRole: "CUSTOMER", grantedRoles: ["CUSTOMER", "EXECUTIVE"], roleSelectionRequired: false, name: "Jaroslav Blahout", email: "b@begina.cz" });
const asStrelec = () => (holder.ctx = { userId: "user-strelec", systemRole: "EXECUTIVE", grantedRoles: ["EXECUTIVE"], roleSelectionRequired: false, name: "Jiří Střelec", email: "s@begina.cz" });

const L1 = "00000000-0000-4000-8000-0000000000a1";
const L2 = "00000000-0000-4000-8000-0000000000a2";
const L3 = "00000000-0000-4000-8000-0000000000a3";

describe("Hovory a kontakty nad DB", { timeout: 120_000 }, () => {
  let ch: typeof import("../callHistory");
  let v: typeof import("../callHistoryValidation");

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    const db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    holder.db = db;
    ch = await import("../callHistory");
    v = await import("../callHistoryValidation");
    await db.execute(sql.raw(`
      INSERT INTO leads (id, company_name, contact_name, contact_phone, city, source, stage, owner_user_id) VALUES
        ('${L1}', 'Kavárna U Mostu', 'Petr Novák', '+420 777 123 456', 'Brno', 'existing_database', 'contacted', '${BLAHOUT}'),
        ('${L2}', 'Bistro 100% Bio', NULL, '602 111 222', 'Praha', 'existing_database', 'new', '${BLAHOUT}'),
        ('${L3}', NULL, 'Jana Malá', NULL, 'Olomouc', 'existing_database', 'interested', '${BLAHOUT}')`));
    await db.execute(sql.raw(`
      INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata, created_at) VALUES
        ('${L1}', '${BLAHOUT}', 'Jaroslav Blahout', 'call_logged', 'Zavolat po víkendu', '{"callResult":"call_back_later","stageChangedTo":"contacted"}', '2026-11-02T08:00:00Z'),
        ('${L1}', '${BLAHOUT}', 'Jaroslav Blahout', 'call_logged', 'Chtějí vzorky', '{"callResult":"reached_interested","stageChangedTo":null}', '2026-11-05T22:30:00Z'),
        ('${L3}', '${VINER}', 'Jaroslav Viner', 'call_logged', 'Vinerův hovor', '{}', '2026-11-04T10:00:00Z'),
        ('${L2}', '${BLAHOUT}', 'Jaroslav Blahout', 'note_added', 'jen poznámka', NULL, '2026-11-04T11:00:00Z')`));
  });

  it("pracovník vidí jen SVÉ uložené hovory, nejnovější první, s výsledkem a poznámkou", async () => {
    asBlahout();
    const h = await ch.getCallHistory(0);
    expect(h.allAuthors).toBe(false);
    expect(h.hasMore).toBe(false);
    expect(h.entries.map((e) => e.note)).toEqual(["Chtějí vzorky", "Zavolat po víkendu"]);
    expect(h.entries[0]).toMatchObject({ leadId: L1, displayName: "Kavárna U Mostu", resultLabel: "Dovoláno – zájem", stageLabel: null, contactPhone: "+420 777 123 456" });
    expect(h.entries[1]).toMatchObject({ resultLabel: "Zavolat později", stageLabel: "Kontaktován" });
    // 22:30 UTC 5. 11. = 23:30 v Praze, tedy stále 5. 11.
    expect(v.groupByPragueDay(h.entries).map((g) => g.day)).toEqual(["2026-11-05", "2026-11-02"]);
  });

  it("kurátor (Viner) vidí hovory všech i s autorem", async () => {
    asViner();
    const h = await ch.getCallHistory(0);
    expect(h.allAuthors).toBe(true);
    expect(h.entries.map((e) => e.authorName)).toEqual(["Jaroslav Blahout", "Jaroslav Viner", "Jaroslav Blahout"]);
  });

  it("stránkování: další stránka za posledním záznamem je prázdná", async () => {
    asBlahout();
    const h = await ch.getCallHistory(1);
    expect(h.entries).toEqual([]);
    expect(h.hasMore).toBe(false);
  });

  it("hledá v celé databázi kontaktů: firma, jméno, město i telefon bez mezer", async () => {
    asBlahout();
    const names = async (q: string) => (await ch.searchContacts(v.parseContactSearch(q)!)).map((c) => c.displayName);
    expect(await names("most")).toEqual(["Kavárna U Mostu"]);
    expect(await names("jana")).toEqual(["Jana Malá"]); // kontakt, který Blahout nevolal, jde taky otevřít
    expect(await names("PRAHA")).toEqual(["Bistro 100% Bio"]);
    expect(await names("777123")).toEqual(["Kavárna U Mostu"]);
    expect(await names("602 111")).toEqual(["Bistro 100% Bio"]);
    // % se hledá doslova, ne jako zástupný znak
    expect(await names("100%")).toEqual(["Bistro 100% Bio"]);
    expect(await names("0%B")).toEqual([]);
    const [kavarna] = await ch.searchContacts(v.parseContactSearch("most")!);
    expect(kavarna.lastCallAt?.toISOString()).toBe("2026-11-05T22:30:00.000Z");
    expect(kavarna.contactName).toBe("Petr Novák");
  });

  it("Dnes zavoláno: dnešní hovory, každý kontakt jednou (poslední hovor), nejnovější nahoře", async () => {
    const db = holder.db as import("drizzle-orm/neon-http").NeonHttpDatabase<typeof import("@/lib/db/schema")>;
    await db.execute(sql.raw(`
      INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata, created_at) VALUES
        ('${L2}', '${BLAHOUT}', 'Jaroslav Blahout', 'call_logged', 'Nezvedá', '{"callResult":"no_answer"}', now()),
        ('${L2}', '${BLAHOUT}', 'Jaroslav Blahout', 'call_logged', 'Druhý pokus – domluveno', '{"callResult":"reached_interested"}', now() + interval '1 second'),
        ('${L1}', '${BLAHOUT}', 'Jaroslav Blahout', 'call_logged', 'Dnes ráno', '{"callResult":"call_back_later"}', now()),
        ('${L3}', '${VINER}', 'Jaroslav Viner', 'call_logged', 'Vinerův dnešní', '{}', now()),
        ('${L3}', '${BLAHOUT}', 'Jaroslav Blahout', 'call_logged', 'Předevčírem', '{}', now() - interval '2 days')`));

    asBlahout();
    const mine = await ch.getTodayCalls();
    expect(mine.allAuthors).toBe(false);
    expect(mine.calls.map((c) => [c.displayName, c.note, c.resultLabel])).toEqual([
      ["Bistro 100% Bio", "Druhý pokus – domluveno", "Dovoláno – zájem"],
      ["Kavárna U Mostu", "Dnes ráno", "Zavolat později"],
    ]);
    expect(mine.calls[0]).toMatchObject({ leadId: L2, contactPhone: "602 111 222" });

    asViner();
    const all = await ch.getTodayCalls();
    expect(all.allAuthors).toBe(true);
    expect(all.calls.map((c) => c.displayName).sort()).toEqual(["Bistro 100% Bio", "Jana Malá", "Kavárna U Mostu"]);
  });

  it("bez oprávnění Denního volání nic: jiný EXECUTIVE, Blahout v roli zákazníka, nepřihlášený", async () => {
    for (const as of [asStrelec, asBlahoutCustomer, () => (holder.ctx = null)]) {
      as();
      await expect(ch.getCallHistory(0)).rejects.toThrow();
      await expect(ch.searchContacts(v.parseContactSearch("most")!)).rejects.toThrow();
      await expect(ch.getTodayCalls()).rejects.toThrow();
    }
  });
});
