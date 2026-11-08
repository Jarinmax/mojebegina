// Registr „Kontrola e-shopu – Lucie“ nad skutečným Postgresem (PGlite):
// skript 74 založí 16 karet; Lucie vidí jen svoje karty a sama je schválí
// nebo vrátí; nikdo jiný (ani vedoucí, ani Blahout) za ni neschválí.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const holder = vi.hoisted(() => ({
  db: null as unknown,
  ctx: null as null | { userId: string; systemRole: string; grantedRoles: string[]; roleSelectionRequired: boolean; name: string | null; email: string },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ get db() { return holder.db; } }));
vi.mock("../authContext", () => ({ getAuthContext: async () => holder.ctx }));
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: null }) } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f";
const LUCIE = "f9f93f03-92b0-4724-becd-c0a3576b5275";
const asViner = () => (holder.ctx = { userId: VINER, systemRole: "ADMIN", grantedRoles: ["ADMIN"], roleSelectionRequired: false, name: "Jaroslav Viner", email: "v@begina.cz" });
const asBlahout = () => (holder.ctx = { userId: BLAHOUT, systemRole: "EXECUTIVE", grantedRoles: ["CUSTOMER", "EXECUTIVE"], roleSelectionRequired: false, name: "Jaroslav Blahout", email: "b@begina.cz" });
const asLucie = () => (holder.ctx = { userId: LUCIE, systemRole: "EXECUTIVE", grantedRoles: ["CUSTOMER", "EXECUTIVE"], roleSelectionRequired: false, name: "Lucie Königsbergová", email: "l@begina.cz" });

const SCRIPT = readFileSync(path.join(__dirname, "../../../docs/eshop-production/74_registr_kontrola_eshopu_MAIN.sql"), "utf8").replace(
  "IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'",
  "IS NOT NULL AND false"
);

describe("Kontrola e-shopu – Lucie", { timeout: 120_000 }, () => {
  let db: import("drizzle-orm/neon-http").NeonHttpDatabase<typeof import("@/lib/db/schema")>;
  let ec: typeof import("../eshopCheck");
  let wt: typeof import("../workTasks");
  let auth: typeof import("../workTasksAuth");

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    holder.db = db;
    ec = await import("../eshopCheck");
    wt = await import("../workTasks");
    auth = await import("../workTasksAuth");
    await db.execute(sql.raw(`INSERT INTO user_profiles (user_id, name, email) VALUES
      ('${VINER}', 'Jaroslav Viner', 'v@begina.cz'), ('${BLAHOUT}', 'Jaroslav Blahout', 'b@begina.cz'), ('${LUCIE}', 'Lucie Königsbergová', 'l@begina.cz')`));
    await db.execute(sql.raw(SCRIPT.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "")));
  });

  it("skript 74: 16 karet BEG-01…16 přidělených Lucii, 5 × P0 urgentní; podruhé se zastaví", async () => {
    const rows = (await db.execute<{ title: string; priority: string; assignee_user_id: string; status: string }>(sql`SELECT title, priority, assignee_user_id, status FROM work_tasks WHERE title ~ '^BEG-' ORDER BY title`)).rows;
    expect(rows).toHaveLength(16);
    expect(rows.map((r) => r.title.slice(0, 6))).toEqual(Array.from({ length: 16 }, (_, i) => `BEG-${String(i + 1).padStart(2, "0")}`));
    expect(rows.every((r) => r.assignee_user_id === LUCIE && r.status === "open")).toBe(true);
    expect(rows.filter((r) => r.priority === "urgent")).toHaveLength(5);
    await expect(db.execute(sql.raw(SCRIPT.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "")))).rejects.toThrow(/už existuje/);
  });

  it("Lucie má přístup jen jako přidělená osoba (žádná práva vedoucí), přistává dál na /executive", async () => {
    asLucie();
    expect(auth.isWorkAssignee(holder.ctx)).toBe(true);
    expect(auth.isWorkManager(holder.ctx)).toBe(false);
    expect(auth.landingForExecutive(LUCIE)).toBe("/executive");
    expect(auth.landingForExecutive(BLAHOUT)).toBe("/prace");
    const { rows, isManager } = await ec.listEshopChecks();
    expect(isManager).toBe(false);
    expect(rows).toHaveLength(16);
    expect(rows[0]).toMatchObject({ code: "BEG-01", status: "open", header: { priority: "P0", technical: "NASAZENO – ČEKÁ NA KONTROLU LUCIE" } });
    await expect(wt.createWorkTask({ title: "x", description: "", assigneeUserId: LUCIE, dueDate: null, priority: "normal", photoRequirement: "none", requiresApproval: false })).rejects.toThrow();
    asBlahout();
    expect((await ec.listEshopChecks()).rows).toHaveLength(0);
  });

  it("schválit / vrátit smí jen Lucie; vedoucí ani Blahout ne", async () => {
    const id = (await db.execute<{ id: string }>(sql`SELECT id FROM work_tasks WHERE title LIKE 'BEG-07%'`)).rows[0].id;
    asViner();
    expect((await ec.reviewEshopCheck(id, true, "")).ok).toBe(false);
    asBlahout();
    expect((await ec.reviewEshopCheck(id, true, "")).ok).toBe(false);
    asLucie();
    expect(await ec.reviewEshopCheck(id, false, "")).toEqual({ ok: false, error: "Napište, co je potřeba opravit." });
    expect(await ec.reviewEshopCheck(id, false, "Převod není předvybraný na mobilu")).toEqual({ ok: true });
    let row = (await db.execute<Record<string, unknown>>(sql`SELECT status, return_reason, approved_by FROM work_tasks WHERE id = ${id}`)).rows[0];
    expect(row).toMatchObject({ status: "returned", return_reason: "Převod není předvybraný na mobilu", approved_by: null });
    expect(await ec.reviewEshopCheck(id, true, "Po opravě v pořádku")).toEqual({ ok: true });
    row = (await db.execute<Record<string, unknown>>(sql`SELECT status, done_by, approved_by, return_reason FROM work_tasks WHERE id = ${id}`)).rows[0];
    expect(row).toEqual({ status: "done", done_by: LUCIE, approved_by: LUCIE, return_reason: null });
    const acts = (await db.execute<{ kind: string; metadata: Record<string, string> | null }>(sql`SELECT kind, metadata FROM work_task_activity WHERE task_id = ${id} ORDER BY created_at`)).rows;
    expect(acts.map((a) => a.kind)).toEqual(["created", "returned", "approved"]);
    expect(acts[2].metadata).toEqual({ note: "Po opravě v pořádku" });
    const notes = (await db.execute<{ user_id: string; title: string }>(sql`SELECT user_id, title FROM notifications WHERE href = ${`/prace/ukol/${id}`} ORDER BY created_at`)).rows;
    expect(notes).toEqual([
      { user_id: VINER, title: "Kontrola e-shopu: vráceno k opravě" },
      { user_id: VINER, title: "Kontrola e-shopu: schváleno" },
    ]);
    // schválenou už znovu neschvaluje
    expect((await ec.reviewEshopCheck(id, true, "")).ok).toBe(false);
  });
});
