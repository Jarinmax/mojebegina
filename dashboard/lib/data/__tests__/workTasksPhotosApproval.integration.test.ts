// Práce 2.0 — fotografie, dokončení a schvalování nad skutečným Postgresem
// (ovladač Neonu → PGlite se všemi migracemi). Úložiště fotek je v paměti
// (setPhotoStorageForTests), ale datová vrstva je skutečná.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { PhotoStorage } from "@/lib/prace/photoStorage";

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
const asBlahout = () => (holder.ctx = { userId: BLAHOUT, systemRole: "EXECUTIVE", grantedRoles: ["CUSTOMER", "EXECUTIVE"], roleSelectionRequired: false, name: "Jaroslav Blahout", email: "b@begina.cz" });
const asStrelec = () => (holder.ctx = { userId: "user-strelec", systemRole: "EXECUTIVE", grantedRoles: ["EXECUTIVE"], roleSelectionRequired: false, name: "Jiří Střelec", email: "s@begina.cz" });

// Syntetický JPEG s EXIF/GPS (sanitizace dekódování obrazu nepotřebuje).
const seg = (m: number, p: number[]) => [0xff, m, ((p.length + 2) >> 8) & 0xff, (p.length + 2) & 0xff, ...p];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const JPEG_WITH_GPS = new Uint8Array([
  0xff, 0xd8,
  ...seg(0xe1, [...ascii("Exif\0\0"), ...ascii("GPS 50.0755N 14.4378E")]),
  ...seg(0xc0, [8, 0x04, 0xb0, 0x06, 0x40, 1, 1, 0x11, 0]),
  ...seg(0xda, [1, 1, 0, 0, 0x3f, 0]),
  0x12, 0x34, 0xff, 0xd9,
]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

class MemoryStorage implements PhotoStorage {
  objects = new Map<string, Uint8Array>();
  async put(key: string, bytes: Uint8Array) { this.objects.set(key, bytes); }
  async signedGetUrl(key: string) { return `https://r2.test/${key}?X-Amz-Expires=300&X-Amz-Signature=x`; }
  async delete(key: string) { this.objects.delete(key); }
}

describe("Práce 2.0 — fotografie a schvalování", { timeout: 120_000 }, () => {
  let db: import("drizzle-orm/neon-http").NeonHttpDatabase<typeof import("@/lib/db/schema")>;
  let wt: typeof import("../workTasks");
  let storageMod: typeof import("@/lib/prace/photoStorage");
  let storage: MemoryStorage;

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    holder.db = db;
    wt = await import("../workTasks");
    storageMod = await import("@/lib/prace/photoStorage");
    await db.execute(sql.raw(`INSERT INTO user_profiles (user_id, name, email) VALUES
      ('${VINER}', 'Jaroslav Viner', 'v@begina.cz'), ('${BLAHOUT}', 'Jaroslav Blahout', 'b@begina.cz')`));
  });

  beforeEach(() => {
    storage = new MemoryStorage();
    storageMod.setPhotoStorageForTests(storage);
  });

  const create = async (title: string, photoRequirement: string, requiresApproval: boolean) => {
    asViner();
    const r = await wt.createWorkTask({ title, description: "", assigneeUserId: BLAHOUT, dueDate: "2099-12-31", priority: "normal", photoRequirement, requiresApproval });
    expect(r).toEqual({ ok: true });
    const [row] = (await db.execute<{ id: string }>(sql`SELECT id FROM work_tasks WHERE title = ${title}`)).rows;
    return row.id;
  };
  const task = async (id: string) =>
    (await db.execute<Record<string, unknown>>(sql`SELECT status, submitted_by, done_by, approved_by, return_reason FROM work_tasks WHERE id = ${id}`)).rows[0];
  const kinds = async (id: string) =>
    (await db.execute<{ kind: string; actor_user_id: string }>(sql`SELECT kind, actor_user_id FROM work_task_activity WHERE task_id = ${id} ORDER BY created_at, kind`)).rows;
  const notes = async (userId: string, type: string) =>
    (await db.execute<{ title: string; href: string; read_at: string | null }>(sql`SELECT title, href, read_at FROM notifications WHERE user_id = ${userId} AND type = ${type}`)).rows;

  it("bez nastaveného úložiště nejde fotku vyžadovat ani nahrát; bez fotky úkol jde zadat", async () => {
    storageMod.setPhotoStorageForTests(null);
    asViner();
    expect((await wt.createWorkTask({ title: "x", description: "", assigneeUserId: BLAHOUT, dueDate: "", priority: "normal", photoRequirement: "required" })).ok).toBe(false);
    expect(await wt.createWorkTask({ title: "Bez fotky", description: "", assigneeUserId: BLAHOUT, dueDate: "", priority: "normal" })).toEqual({ ok: true });
  });

  it("povinná fotka: bez ní úkol nejde dokončit (kontrola na serveru)", async () => {
    const id = await create("Destičky", "required", false);
    asBlahout();
    const r = await wt.setWorkTaskDone(id, true);
    expect(r).toEqual({ ok: false, error: "Přiložte alespoň jednu fotografii — u tohoto úkolu je povinná." });
    expect((await task(id)).status).toBe("open");
  });

  it("nahrání: škodlivý / jiný soubor odmítne; JPEG uloží bez GPS a zapíše kdo a kdy", async () => {
    const id = await create("Zahrádka", "required", false);
    asBlahout();
    expect((await wt.addWorkTaskPhoto(id, PNG)).ok).toBe(false);
    expect(storage.objects.size).toBe(0);
    const r = await wt.addWorkTaskPhoto(id, JPEG_WITH_GPS);
    expect(r.ok).toBe(true);
    const [stored] = [...storage.objects.values()];
    expect(Buffer.from(stored).toString("latin1")).not.toContain("GPS");
    const [photo] = (await db.execute<Record<string, unknown>>(
      sql`SELECT uploaded_by, content_type, width, height, locked_at, storage_key FROM work_task_photos WHERE task_id = ${id}`
    )).rows;
    expect(photo).toMatchObject({ uploaded_by: BLAHOUT, content_type: "image/jpeg", width: 1600, height: 1200, locked_at: null });
    expect(String(photo.storage_key)).toMatch(new RegExp(`^prace/${id}/[0-9a-f-]{36}\\.jpg$`));
    expect((await kinds(id)).map((k) => k.kind)).toEqual(["created", "photo_added"]);
    // s fotkou už dokončit jde
    expect(await wt.setWorkTaskDone(id, true)).toEqual({ ok: true });
    expect((await task(id)).status).toBe("done");
  });

  it("oprávnění k fotkám: cizí EXECUTIVE nesmí nahrát ani zobrazit; vedoucí i zaměstnanec zobrazit smí", async () => {
    const id = await create("Šachový stolek", "optional", false);
    asBlahout();
    const { photoId } = await wt.addWorkTaskPhoto(id, JPEG_WITH_GPS);
    asStrelec();
    await expect(wt.addWorkTaskPhoto(id, JPEG_WITH_GPS)).rejects.toThrow();
    await expect(wt.resolveWorkTaskPhoto(photoId!)).rejects.toThrow();
    asViner();
    expect(await wt.resolveWorkTaskPhoto(photoId!)).toMatchObject({ storageKey: expect.stringMatching(/^prace\//) });
    asBlahout();
    expect(await wt.resolveWorkTaskPhoto(photoId!)).not.toBeNull();
    expect(await wt.resolveWorkTaskPhoto("nesmysl")).toBeNull();
  });

  it("odstranění omylem přiložené fotky před odesláním: záznam zůstane, soubor zmizí; vedoucí cizí fotku neodstraní", async () => {
    const id = await create("Prostor před bistrem", "optional", true);
    asBlahout();
    const { photoId } = await wt.addWorkTaskPhoto(id, JPEG_WITH_GPS);
    asViner();
    expect((await wt.removeWorkTaskPhoto(photoId!)).ok).toBe(false);
    asBlahout();
    expect(await wt.removeWorkTaskPhoto(photoId!)).toEqual({ ok: true });
    expect(storage.objects.size).toBe(0);
    const [row] = (await db.execute<{ deleted_by: string | null }>(sql`SELECT deleted_by FROM work_task_photos WHERE id = ${photoId}`)).rows;
    expect(row.deleted_by).toBe(BLAHOUT);
    expect(await wt.resolveWorkTaskPhoto(photoId!)).toBeNull();
    expect((await kinds(id)).map((k) => k.kind)).toEqual(["created", "photo_added", "photo_removed"]);
  });

  it("celý postup schválení: odeslat → vrátit s důvodem → doplnit fotku → odeslat → schválit; historie i upozornění", async () => {
    const id = await create("Levá strana bistra", "required", true);
    asBlahout();
    const { photoId } = await wt.addWorkTaskPhoto(id, JPEG_WITH_GPS);
    expect(await wt.setWorkTaskDone(id, true)).toEqual({ ok: true });
    expect(await task(id)).toMatchObject({ status: "submitted", submitted_by: BLAHOUT, done_by: null });
    expect(await notes(VINER, "work_task_submitted")).toEqual([
      expect.objectContaining({ title: "Úkol ke kontrole", href: `/prace/ukol/${id}`, read_at: null }),
    ]);
    // po odeslání je fotka zamčená (doklad) a zaměstnanec nemůže schvalovat
    expect((await wt.removeWorkTaskPhoto(photoId!)).ok).toBe(false);
    expect((await wt.addWorkTaskPhoto(id, JPEG_WITH_GPS)).ok).toBe(false);
    await expect(wt.reviewWorkTask(id, true, "")).rejects.toThrow();

    asViner();
    expect(await wt.reviewWorkTask(id, false, "  ")).toEqual({ ok: false, error: "Napište důvod vrácení." });
    expect(await wt.reviewWorkTask(id, false, "Chybí detail stříšky")).toEqual({ ok: true });
    expect(await task(id)).toMatchObject({ status: "returned", return_reason: "Chybí detail stříšky" });
    expect(await notes(BLAHOUT, "work_task_returned")).toEqual([expect.objectContaining({ title: "Úkol vrácen k opravě" })]);

    asBlahout();
    const view = (await wt.listWorkTasks()).tasks.find((t) => t.id === id)!;
    expect(view.status).toBe("returned");
    expect(view.photos).toHaveLength(1);
    expect(view.photos[0].removable).toBe(false); // původní fotka zůstává jako doklad
    expect((await wt.addWorkTaskPhoto(id, JPEG_WITH_GPS)).ok).toBe(true);
    expect(await wt.setWorkTaskDone(id, true)).toEqual({ ok: true });

    asViner();
    expect(await wt.reviewWorkTask(id, true, "")).toEqual({ ok: true });
    expect((await wt.reviewWorkTask(id, true, "")).ok).toBe(false); // podruhé už nečeká
    expect(await task(id)).toMatchObject({ status: "done", done_by: BLAHOUT, approved_by: VINER, return_reason: null });
    expect(await notes(BLAHOUT, "work_task_approved")).toEqual([expect.objectContaining({ title: "Úkol schválen" })]);
    expect((await kinds(id)).map((k) => `${k.kind}:${k.actor_user_id === VINER ? "V" : "B"}`)).toEqual([
      "created:V", "photo_added:B", "submitted:B", "returned:V", "photo_added:B", "submitted:B", "approved:V",
    ]);

    // schválený úkol zaměstnanec sám nevrátí; vedoucí ano
    asBlahout();
    expect((await wt.setWorkTaskDone(id, false)).ok).toBe(false);
    asViner();
    expect(await wt.setWorkTaskDone(id, false)).toEqual({ ok: true });
  });

  it("úkol bez schválení se po dokončení rovnou splní; volitelná fotka není podmínkou; bez upozornění vedoucímu", async () => {
    const id = await create("Volitelná fotka", "optional", false);
    asBlahout();
    expect(await wt.setWorkTaskDone(id, true)).toEqual({ ok: true });
    expect(await task(id)).toMatchObject({ status: "done", done_by: BLAHOUT, submitted_by: null });
    expect((await notes(VINER, "work_task_submitted")).every((n) => !n.href.endsWith(id))).toBe(true);
  });

  it("fotku nejde přidat k úkolu bez fotek, ke splněnému ani zrušenému; čekající úkol jde zrušit", async () => {
    const none = await create("Bez fotek", "none", false);
    asBlahout();
    expect((await wt.addWorkTaskPhoto(none, JPEG_WITH_GPS)).ok).toBe(false);
    const waiting = await create("Ke zrušení", "none", true);
    asBlahout();
    await wt.setWorkTaskDone(waiting, true);
    asViner();
    expect(await wt.cancelWorkTask(waiting, "Už není potřeba")).toEqual({ ok: true });
    expect((await task(waiting)).status).toBe("cancelled");
  });

  it("upozornění: každý vidí jen svoje; přečtení jen svých", async () => {
    asViner();
    const mine = await wt.listWorkNotifications();
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((n) => n.title === "Úkol ke kontrole")).toBe(true);
    asBlahout();
    await wt.markWorkNotificationsRead();
    asViner();
    expect((await wt.listWorkNotifications()).some((n) => !n.read)).toBe(true);
    await wt.markWorkNotificationsRead();
    expect((await wt.listWorkNotifications()).every((n) => n.read)).toBe(true);
  });
});
