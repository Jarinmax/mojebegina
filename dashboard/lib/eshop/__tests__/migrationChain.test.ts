// Řetězec migrací Drizzle (drizzle/ + drizzle/meta): po sloučení main
// (0011 = CEO přehled, 0012 = Denní volání) jsou e-shopové migrace
// 0013–0019. Hlídá, že journal, názvy souborů a snapshoty (id → prevId)
// tvoří souvislý řetězec bez mezer a že každý snapshot popisuje úplné
// schéma — jinak by drizzle-kit generate vyrobil špatnou další migraci.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMigratedDb } from "./helpers/migratedDb";

const DRIZZLE_DIR = path.join(__dirname, "../../../drizzle");
const META_DIR = path.join(DRIZZLE_DIR, "meta");
const DB_TEST = { timeout: 60_000 };

type JournalEntry = { idx: number; version: string; when: number; tag: string; breakpoints: boolean };
type Snapshot = {
  id: string;
  prevId: string;
  tables: Record<string, { name: string; schema: string; columns: Record<string, { name: string }> }>;
};

const journal: { entries: JournalEntry[] } = JSON.parse(
  readFileSync(path.join(META_DIR, "_journal.json"), "utf8")
);
const prefix = (idx: number) => String(idx).padStart(4, "0");
const snapshot = (idx: number): Snapshot =>
  JSON.parse(readFileSync(path.join(META_DIR, `${prefix(idx)}_snapshot.json`), "utf8"));

const CEO = "0011_phase_17_ceo_focus";
const DAILY_CALLS = "0012_phase_19_daily_calls";
const ESHOP = [
  "0013_eshop_1_0_products",
  "0014_eshop_1_0_products_seed",
  "0015_eshop_1_0_order_activity_actor",
  "0016_eshop_1_0_orders_fields",
  "0017_eshop_1_0_order_items_variant",
  "0018_eshop_1_0_order_number",
  "0019_eshop_1_0_orders_guest",
  "0020_eshop_1_0_payments_invoicing",
];
const FIRST_ESHOP_IDX = 13;
/** Tabulky z main, které e-shop nesmí měnit — od kterého snapshotu existují. */
const MAIN_TABLES: Record<string, number> = {
  "public.focus_projects": 11,
  "public.focus_project_activity": 11,
  "public.daily_call_queue": 12,
};

describe("řetězec migrací Drizzle", () => {
  it("journal: idx 0…n bez mezer, tag začíná číslem idx, when roste", () => {
    journal.entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
      expect(entry.tag.startsWith(`${prefix(i)}_`)).toBe(true);
      if (i > 0) expect(entry.when).toBeGreaterThan(journal.entries[i - 1].when);
    });
  });

  it("0011 = CEO přehled, 0012 = Denní volání (z main), e-shop 0013–0020 hned za nimi", () => {
    const tags = journal.entries.map((e) => e.tag);
    expect(tags[11]).toBe(CEO);
    expect(tags[12]).toBe(DAILY_CALLS);
    // Ohraničeno na vlastní (souvislý) blok e-shopu, ne na "všechno od
    // FIRST_ESHOP_IDX do konce" — po sloučení main (0020) do
    // feature/google-calendar-1-0 a přečíslování kolidující kalendářové
    // migrace na 0021 (Security Phase 21 post-implementation audit)
    // journal pokračuje DÁL za e-shopem, což je tomuto testu (ověřuje jen
    // e-shopovu vlastní migraci) mimo rozsah.
    expect(tags.slice(FIRST_ESHOP_IDX, FIRST_ESHOP_IDX + ESHOP.length)).toEqual(ESHOP);
  });

  it("ke každé položce journalu je SQL i snapshot a nic navíc", () => {
    const tags = journal.entries.map((e) => e.tag);
    for (const tag of tags) expect(existsSync(path.join(DRIZZLE_DIR, `${tag}.sql`))).toBe(true);
    const sqlFiles = readdirSync(DRIZZLE_DIR).filter((f) => f.endsWith(".sql")).sort();
    expect(sqlFiles).toEqual(tags.map((t) => `${t}.sql`).sort());
    const snapshots = readdirSync(META_DIR).filter((f) => f.endsWith("_snapshot.json")).sort();
    expect(snapshots).toEqual(tags.map((_, i) => `${prefix(i)}_snapshot.json`));
  });

  it("snapshoty: prevId = id předchozího, id jsou jedinečná", () => {
    const ids = new Set<string>();
    journal.entries.forEach((_, i) => {
      const snap = snapshot(i);
      expect(ids.has(snap.id)).toBe(false);
      ids.add(snap.id);
      if (i > 0) expect(snap.prevId).toBe(snapshot(i - 1).id);
    });
  });

  it("každý snapshot obsahuje tabulky z main od migrace, která je přidala", () => {
    for (const [table, from] of Object.entries(MAIN_TABLES)) {
      for (let i = from; i < journal.entries.length; i++) {
        expect(Object.keys(snapshot(i).tables)).toContain(table);
      }
    }
  });

  it("e-shop nemění tabulky z main (0013–0020 = stejné jako 0012)", () => {
    const base = snapshot(FIRST_ESHOP_IDX - 1).tables;
    for (let i = FIRST_ESHOP_IDX; i < journal.entries.length; i++) {
      for (const table of Object.keys(MAIN_TABLES)) expect(snapshot(i).tables[table]).toEqual(base[table]);
    }
  });

  it(
    "poslední snapshot odpovídá DB po všech migracích (tabulky a sloupce)",
    async () => {
      const { pg } = await createMigratedDb();
      const { rows } = await pg.query<{ t: string; c: string }>(
        `SELECT c.table_schema || '.' || c.table_name AS t, c.column_name AS c
           FROM information_schema.columns c
           JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
          WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'` // pohledy (order_payment_balance) snapshot nevede
      );
      const actual: Record<string, string[]> = {};
      for (const { t, c } of rows) (actual[t] ??= []).push(c);
      const expected: Record<string, string[]> = {};
      for (const [key, table] of Object.entries(snapshot(journal.entries.length - 1).tables)) {
        expected[key] = Object.values(table.columns).map((col) => col.name);
      }
      const sorted = (o: Record<string, string[]>) =>
        Object.fromEntries(Object.keys(o).sort().map((k) => [k, [...o[k]].sort()]));
      expect(sorted(actual)).toEqual(sorted(expected));
    },
    DB_TEST.timeout
  );
});
