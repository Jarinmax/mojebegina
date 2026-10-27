// Práce 1.0 — oprávnění, zápis a načítání úkolů nad skutečným Postgresem
// (ovladač Neonu → PGlite se všemi migracemi, stejně jako agentFlow test).
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
const STRELEC = "user-strelec";

const asViner = () => (holder.ctx = { userId: VINER, systemRole: "ADMIN", grantedRoles: ["ADMIN"], roleSelectionRequired: false, name: "Jaroslav Viner", email: "v@begina.cz" });
const asBlahout = () => (holder.ctx = { userId: BLAHOUT, systemRole: "EXECUTIVE", grantedRoles: ["CUSTOMER", "EXECUTIVE"], roleSelectionRequired: false, name: "Jaroslav Blahout", email: "b@begina.cz" });
const asBlahoutCustomer = () => (holder.ctx = { userId: BLAHOUT, systemRole: "CUSTOMER", grantedRoles: ["CUSTOMER", "EXECUTIVE"], roleSelectionRequired: false, name: "Jaroslav Blahout", email: "b@begina.cz" });
const asStrelec = () => (holder.ctx = { userId: STRELEC, systemRole: "EXECUTIVE", grantedRoles: ["EXECUTIVE"], roleSelectionRequired: false, name: "Jiří Střelec", email: "s@begina.cz" });

describe("Práce 1.0 — úkoly nad DB", { timeout: 120_000 }, () => {
  let db: import("drizzle-orm/neon-http").NeonHttpDatabase<typeof import("@/lib/db/schema")>;
  let wt: typeof import("../workTasks");

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    holder.db = db;
    wt = await import("../workTasks");
    await db.execute(sql.raw(`INSERT INTO user_profiles (user_id, name, email) VALUES
      ('${VINER}', 'Jaroslav Viner', 'v@begina.cz'), ('${BLAHOUT}', 'Jaroslav Blahout', 'b@begina.cz')`));
    // úkol jiného člověka (např. budoucí zaměstnanec) — Blahout ho nesmí vidět ani splnit
    await db.execute(sql.raw(`INSERT INTO work_tasks (id, title, assignee_user_id, created_by)
      VALUES ('00000000-0000-4000-8000-0000000000f1', 'Cizí úkol', 'user-jiny', '${VINER}')`));
  });

  it("vedoucí zadá úkol; uloží se i s historií „zadáno“", async () => {
    asViner();
    expect(await wt.createWorkTask({ title: "Vyrobit destičky", description: "Jídla a sladkosti", assigneeUserId: BLAHOUT, dueDate: "2026-10-27", priority: "normal" })).toEqual({ ok: true });
    expect(await wt.createWorkTask({ title: "Urgentní", description: "", assigneeUserId: BLAHOUT, dueDate: "", priority: "urgent" })).toEqual({ ok: true });
    const { tasks } = await wt.listWorkTasks();
    const t = tasks.find((x) => x.title === "Vyrobit destičky")!;
    expect(t).toMatchObject({ assigneeUserId: BLAHOUT, dueDate: "2026-10-27", status: "open", description: "Jídla a sladkosti" });
    expect(t.history).toEqual([expect.objectContaining({ kind: "created", actorName: "Jaroslav Viner" })]);
  });

  it("úkol jde zadat jen povolenému pracovníkovi; pracovník ani jiný EXECUTIVE úkoly zadávat nesmí", async () => {
    asViner();
    expect((await wt.createWorkTask({ title: "x", description: "", assigneeUserId: STRELEC, dueDate: "", priority: "normal" })).ok).toBe(false);
    asBlahout();
    await expect(wt.createWorkTask({ title: "x", description: "", assigneeUserId: BLAHOUT, dueDate: "", priority: "normal" })).rejects.toThrow();
    asStrelec();
    await expect(wt.listWorkTasks()).rejects.toThrow();
    asBlahoutCustomer();
    await expect(wt.listWorkTasks()).rejects.toThrow();
  });

  it("pracovník vidí jen svoje úkoly; vedoucí vidí všechny", async () => {
    asBlahout();
    const mine = await wt.listWorkTasks();
    expect(mine.isManager).toBe(false);
    expect(mine.tasks.every((t) => t.assigneeUserId === BLAHOUT)).toBe(true);
    expect(mine.tasks.map((t) => t.title)).not.toContain("Cizí úkol");
    asViner();
    expect((await wt.listWorkTasks()).tasks.map((t) => t.title)).toContain("Cizí úkol");
  });

  it("pracovník splní svůj úkol: uloží se čas a uživatel, do historie právě jednou; urgentní je první", async () => {
    asBlahout();
    const { tasks } = await wt.listWorkTasks();
    expect(tasks[0].title).toBe("Urgentní");
    const target = tasks.find((t) => t.title === "Vyrobit destičky")!;
    expect(await wt.setWorkTaskDone(target.id, true)).toEqual({ ok: true });
    expect((await wt.setWorkTaskDone(target.id, true)).ok).toBe(false); // dvojí klepnutí
    const row = (await db.execute<{ status: string; done_by: string; done_at: string | null }>(
      sql`SELECT status, done_by, done_at FROM work_tasks WHERE id = ${target.id}`
    )).rows[0];
    expect(row).toMatchObject({ status: "done", done_by: BLAHOUT });
    expect(row.done_at).not.toBeNull();
    const hist = (await db.execute<{ kind: string; actor_user_id: string }>(
      sql`SELECT kind, actor_user_id FROM work_task_activity WHERE task_id = ${target.id} ORDER BY created_at`
    )).rows;
    expect(hist).toEqual([{ kind: "created", actor_user_id: VINER }, { kind: "done", actor_user_id: BLAHOUT }]);
    // po „opětovném přihlášení“ (nové načtení) je úkol pořád splněný
    const again = await wt.listWorkTasks();
    expect(again.tasks.find((t) => t.id === target.id)).toMatchObject({ status: "done", doneByName: "Jaroslav Blahout" });
  });

  it("pracovník nesmí splnit cizí úkol; vedoucí může vrátit splněný úkol a zapíše se to", async () => {
    asBlahout();
    expect((await wt.setWorkTaskDone("00000000-0000-4000-8000-0000000000f1", true)).ok).toBe(false);
    const cizi = (await db.execute<{ status: string }>(sql`SELECT status FROM work_tasks WHERE id = '00000000-0000-4000-8000-0000000000f1'`)).rows[0];
    expect(cizi.status).toBe("open");
    asViner();
    const done = (await wt.listWorkTasks()).tasks.find((t) => t.title === "Vyrobit destičky")!;
    expect(await wt.setWorkTaskDone(done.id, false)).toEqual({ ok: true });
    const row = (await db.execute<{ status: string; done_at: string | null }>(sql`SELECT status, done_at FROM work_tasks WHERE id = ${done.id}`)).rows[0];
    expect(row).toEqual({ status: "open", done_at: null });
  });
});
