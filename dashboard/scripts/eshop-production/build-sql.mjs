// ESHOP 1.0 — sestaví SQL pro Production z HOTOVÝCH souborů v repozitáři,
// aby se nic nepřepisovalo ručně (a nic se neodchýlilo od Preview):
//   docs/eshop-production/11_migrations_0013_0019.sql = drizzle 0013–0019
//   docs/eshop-production/19_migrations_rollback.sql  = *_down.sql v opačném pořadí
// Spuštění: node scripts/eshop-production/build-sql.mjs
// Test lib/eshop/__tests__/productionSql.test.ts hlídá, že soubory odpovídají.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

export const ESHOP_TAGS = [
  "0013_eshop_1_0_products",
  "0014_eshop_1_0_products_seed",
  "0015_eshop_1_0_order_activity_actor",
  "0016_eshop_1_0_orders_fields",
  "0017_eshop_1_0_order_items_variant",
  "0018_eshop_1_0_order_number",
  "0019_eshop_1_0_orders_guest",
];

// Návrat 0019 → 0013 (kroky návrhu: 07, 06a, 05, 04, 03, 02, 01).
export const DOWN_FILES = [
  "07_orders_guest_down.sql",
  "06a_order_number_column_down.sql",
  "05_order_items_variant_down.sql",
  "04_orders_eshop_fields_down.sql",
  "03_order_activity_actor_down.sql",
  "02_products_seed_down.sql",
  "01_products_down.sql",
];

export function migrationsSql() {
  const parts = ESHOP_TAGS.map(
    (tag) => {
      const body = read(`drizzle/${tag}.sql`).replaceAll("--> statement-breakpoint", "").trim();
      return `-- ===== ${tag}.sql =====\n${body.endsWith(";") ? body : `${body};`}\n`;
    }
  );
  return (
    `-- PRODUCTION — e-shopové migrace 0013–0019 (VYGENEROVÁNO scripts/eshop-production/build-sql.mjs).\n` +
    `-- Obsah = přesně soubory drizzle/0013–0019, stejné jako na Preview. Spouštět CELÉ najednou\n` +
    `-- v Neon SQL Editoru na větvi production (main), až po kontrole 10_before_migrations.sql.\n` +
    `-- Neon SQL Editor spouští celý vstup v jedné transakci: chyba = nic se nezmění.\n\n` +
    `BEGIN;\n\n${parts.join("\n")}\nCOMMIT;\n`
  );
}

export function rollbackSql() {
  const parts = DOWN_FILES.map((f) => {
    const body = read(`docs/eshop-schema-draft/${f}`)
      .split("\n")
      .filter((line) => !line.startsWith("-- NÁVRH") && !line.startsWith("-- Spouštět nejdřív"))
      .join("\n")
      .trim();
    return `-- ===== ${f} =====\n${body}\n`;
  });
  return (
    `-- PRODUCTION — NÁVRAT e-shopových migrací 0019 → 0013 (VYGENEROVÁNO scripts/eshop-production/build-sql.mjs).\n` +
    `-- JEN pokud se e-shop ještě nespustil: smaže katalog a e-shopová pole objednávek.\n` +
    `-- Selže (a nic nezmění), pokud už existuje objednávka bez organizace nebo jiná e-shopová data,\n` +
    `-- která by se ztratila. Před spuštěním číslování vrátit 29_numbering_rollback.sql.\n\n` +
    `BEGIN;\n\n${parts.join("\n")}\nCOMMIT;\n`
  );
}

// Production větev `main` v Neonu (ověřeno read-only 7. 10. 2026):
// neon.timeline_id je pro každou větev jiný (backup, Preview…), proto ho
// chráněná verze migrace kontroluje jako první příkaz transakce.
export const PRODUCTION_MAIN = {
  timelineId: "70a96b3677653646e65343cae8e27182",
  endpointId: "ep-orange-lake-b2zctiy8",
};

/**
 * Chráněná verze 11_migrations_0013_0019.sql pro ruční spuštění v Neon SQL
 * Editoru: uvnitř téže transakce nejdřív ověří, že běží na větvi `main`
 * (neon.timeline_id) a že Production je ve stavu před migracemi (20 tabulek,
 * žádná e-shopová tabulka, objednávky The Cup). Jinak výjimka → transakce se
 * zruší a nic se nezmění (ani na backupu, ani na Preview, ani podruhé na main).
 */
export function guardedMigrationsSql(timelineId = PRODUCTION_MAIN.timelineId) {
  const body = migrationsSql()
    .split("\n")
    .filter((line) => !line.startsWith("-- "))
    .join("\n")
    .replace(/^\s*BEGIN;\n/, "")
    .replace(/COMMIT;\n$/, "")
    .trim();
  const guard = `DO $guard$
DECLARE
  timeline text := current_setting('neon.timeline_id', true);
BEGIN
  IF timeline IS DISTINCT FROM '${timelineId}' THEN
    RAISE EXCEPTION 'STOP: tohle NENÍ Production větev main (neon.timeline_id = %). Nic se nezměnilo.', coalesce(timeline, 'neznámý');
  END IF;
  IF (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') <> 20
     OR EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'product%')
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'channel') THEN
    RAISE EXCEPTION 'STOP: Production není ve stavu před migracemi (migrace už běžela?). Nic se nezměnilo.';
  END IF;
  IF (SELECT count(*) FROM orders WHERE id IN ('329f54d5-5a7d-4522-a21e-b7ad9cde24e2', '984e3645-1f2f-4444-8e8e-eeac75165a0a')) <> 2 THEN
    RAISE EXCEPTION 'STOP: chybí objednávky The Cup — neočekávaná data. Nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'OK: Production main, stav před migracemi — pokračuji migracemi 0013–0019.';
END
$guard$;`;
  return (
    `-- PRODUCTION main — e-shopové migrace 0013–0019 S POJISTKOU (VYGENEROVÁNO scripts/eshop-production/build-sql.mjs).\n` +
    `-- Obsah migrací = přesně 11_migrations_0013_0019.sql (drizzle 0013–0019). Navíc jako PRVNÍ krok\n` +
    `-- transakce kontrola: větev main (neon.timeline_id ${timelineId}) + stav před migracemi.\n` +
    `-- Na jiné větvi (backup, Preview) nebo podruhé se transakce zastaví a NIC se nezmění.\n` +
    `-- Spouštět CELÉ najednou v Neon SQL Editoru (jedna transakce).\n\n` +
    `BEGIN;\n\n-- ===== POJISTKA: jen Production main, jen jednou =====\n${guard}\n\n${body}\n\nCOMMIT;\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(ROOT, "docs/eshop-production/11_migrations_0013_0019.sql"), migrationsSql());
  writeFileSync(join(ROOT, "docs/eshop-production/19_migrations_rollback.sql"), rollbackSql());
  writeFileSync(join(ROOT, "docs/eshop-production/11_migrations_0013_0019_MAIN.sql"), guardedMigrationsSql());
  console.log("OK: docs/eshop-production/11_migrations_0013_0019.sql, 11_migrations_0013_0019_MAIN.sql, 19_migrations_rollback.sql");
}
