// Testovací DB: PGlite (Postgres v paměti) + VŠECHNY migrace z drizzle/
// v pořadí journalu — stejné soubory, které se aplikují na Neon. Nikdy se
// nepřipojuje k Neonu.
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";

const DRIZZLE_DIR = path.join(__dirname, "../../../../drizzle");

export const migrationTags: string[] = JSON.parse(
  readFileSync(path.join(DRIZZLE_DIR, "meta/_journal.json"), "utf8")
).entries.map((entry: { tag: string }) => entry.tag);

export function migrationSql(tag: string): string {
  return readFileSync(path.join(DRIZZLE_DIR, `${tag}.sql`), "utf8");
}

export async function applyMigration(pg: PGlite, tag: string) {
  for (const statement of migrationSql(tag).split("--> statement-breakpoint")) {
    if (statement.trim()) {
      await pg.exec(statement);
    }
  }
}

/** Nová DB s migracemi až po `upTo` včetně (výchozí: všechny). */
export async function createMigratedDb(upTo?: string) {
  const pg = new PGlite();
  for (const tag of migrationTags) {
    await applyMigration(pg, tag);
    if (tag === upTo) break;
  }
  return { pg, db: drizzle(pg, { schema }) };
}

const NUMBERING_SQL = path.join(__dirname, "../../../../docs/eshop-schema-draft/06b_order_number_cutover_up.sql");

/** Skript 06b (zapnutí číslování) se startem řady — stejný soubor, který se spouští na Neonu. */
export function orderNumberingSql(start: number): string {
  return readFileSync(NUMBERING_SQL, "utf8").replaceAll("<MAX_WOO_ORDER_NUMBER>", String(start));
}

export async function applyOrderNumbering(pg: PGlite, start: number) {
  await pg.exec(orderNumberingSql(start));
}
