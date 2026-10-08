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

/** Zbytek fáze A: katalogy (sirupy, polévky, čaje) + platby krok A — v tomto pořadí. */
export const PHASE_A_REST = [
  "docs/eshop-catalog/31_sirupy.sql",
  "docs/eshop-catalog/41_polevky.sql",
  "docs/eshop-catalog/51_caje.sql",
  "docs/eshop-payments/11_migration.sql",
];

/**
 * Chráněný zbytek fáze A pro Production main v JEDNÉ transakci: obsah
 * skriptů beze změny (jen bez jejich vlastních BEGIN/COMMIT), na začátku
 * pojistka — větev main (neon.timeline_id) a stav PO migracích 0013–0019
 * a PŘED katalogem / platbami. Chyba kdekoli = nic se nezmění.
 */
export function guardedPhaseARestSql(timelineId = PRODUCTION_MAIN.timelineId) {
  const parts = PHASE_A_REST.map((file) => {
    const body = read(file)
      .split("\n")
      .filter((line) => !/^\s*(BEGIN|COMMIT)\s*;\s*$/.test(line))
      .join("\n")
      .trim();
    return `-- ===== ${file} =====\n${body}\n`;
  });
  const guard = `DO $guard$
DECLARE
  timeline text := current_setting('neon.timeline_id', true);
BEGIN
  IF timeline IS DISTINCT FROM '${timelineId}' THEN
    RAISE EXCEPTION 'STOP: tohle NENÍ Production větev main (neon.timeline_id = %). Nic se nezměnilo.', coalesce(timeline, 'neznámý');
  END IF;
  IF (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') < 24
     OR NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
    RAISE EXCEPTION 'STOP: chybí migrace 0013–0019 (nejdřív 11_migrations_0013_0019_MAIN.sql). Nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments')
     OR (SELECT count(*) FROM products) <> 7 THEN
    RAISE EXCEPTION 'STOP: katalog nebo platby už běžely (nebo neočekávaný stav). Nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'OK: Production main po migracích 0013–0019 — pokračuji katalogem a platbami (krok A).';
END
$guard$;`;
  return (
    `-- PRODUCTION main — fáze A, zbytek: katalog Sirupy + Polévky + Čaje a platby krok A S POJISTKOU\n` +
    `-- (VYGENEROVÁNO scripts/eshop-production/build-sql.mjs z ${PHASE_A_REST.join(", ")}).\n` +
    `-- Obsah skriptů beze změny, jen v JEDNÉ transakci. Jako první krok kontrola: větev main\n` +
    `-- (neon.timeline_id ${timelineId}) + stav po migracích 0013–0019. Jinak „STOP“ a NIC se nezmění.\n` +
    `-- Spouštět CELÉ najednou v Neon SQL Editoru. Kontroly po: 32_sirupy_after (sloupce produkty | baleni_celkem\n` +
    `-- budou 25 | 36, protože se počítají až po polévkách a čajích), 42_polevky_after, 52_caje_after, eshop-payments/12_after.\n\n` +
    `BEGIN;\n\n-- ===== POJISTKA: jen Production main, jen jednou =====\n${guard}\n\n${parts.join("\n")}\nCOMMIT;\n`
  );
}

/**
 * Platby krok B (povinný VS u e-shopové objednávky) pro Production main —
 * PŘED první e-shopovou objednávkou (rozhodnutí vedení 7. 10. 2026: pojistka
 * VS musí platit dřív, než se zapne ESHOP_PUBLIC / ESHOP_ORDER_WRITE).
 * Obsah docs/eshop-payments/21_migration.sql beze změny (bez BEGIN/COMMIT),
 * na začátku pojistka: větev main, krok A hotový, krok B ještě ne, žádná
 * e-shopová objednávka. Chyba kdekoli = nic se nezmění.
 */
export function guardedPaymentsBSql(timelineId = PRODUCTION_MAIN.timelineId) {
  const file = "docs/eshop-payments/21_migration.sql";
  const lines = read(file).split("\n");
  // úvodní komentář souboru platí pro Preview (pořadí „až po objednávce“) — v Production verzi ho nahrazuje hlavička níže
  const firstCode = lines.findIndex((line) => line.trim() !== "" && !line.trim().startsWith("--"));
  const body = lines
    .slice(firstCode)
    .filter((line) => !/^\s*(BEGIN|COMMIT)\s*;\s*$/.test(line))
    .join("\n")
    .trim();
  const guard = `DO $guard$
DECLARE
  timeline text := current_setting('neon.timeline_id', true);
BEGIN
  IF timeline IS DISTINCT FROM '${timelineId}' THEN
    RAISE EXCEPTION 'STOP: tohle NENÍ Production větev main (neon.timeline_id = %). Nic se nezměnilo.', coalesce(timeline, 'neznámý');
  END IF;
  IF to_regclass('public.payments') IS NULL OR to_regclass('public.payment_vs_seq') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'payment_vs') THEN
    RAISE EXCEPTION 'STOP: chybí platby krok A (nejdřív 13_katalog_a_platby_A_MAIN.sql). Nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_eshop_requires_vs') THEN
    RAISE EXCEPTION 'STOP: krok B už běžel (pojistka orders_eshop_requires_vs existuje). Nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE channel = 'eshop') THEN
    RAISE EXCEPTION 'STOP: v Production už je e-shopová objednávka — nečekaný stav, nejdřív ji zkontrolovat. Nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'OK: Production main, platby krok A hotový, žádná e-shopová objednávka — zapínám povinný VS.';
END
$guard$;`;
  return (
    `-- PRODUCTION main — platby krok B: povinný VS u e-shopové objednávky, S POJISTKOU\n` +
    `-- (VYGENEROVÁNO scripts/eshop-production/build-sql.mjs z ${file}).\n` +
    `-- Spouští se PŘED první e-shopovou objednávkou. Mění jen e-shopové objednávky (teď 0)\n` +
    `-- a přidá kontrolu CHECK (channel <> 'eshop' OR payment_vs IS NOT NULL) — import The Cup se netýká.\n` +
    `-- Jako první krok kontrola: větev main (neon.timeline_id ${timelineId}), krok A hotový,\n` +
    `-- krok B ještě ne, žádná e-shopová objednávka. Jinak „STOP“ a NIC se nezmění.\n` +
    `-- Spouštět CELÉ najednou v Neon SQL Editoru. Kontrola po: docs/eshop-payments/22_after.sql\n` +
    `-- → 1 | 0 | 0 | ano | ano. Vrácení: docs/eshop-payments/29_rollback.sql (nic nemaže).\n\n` +
    `BEGIN;\n\n-- ===== POJISTKA: jen Production main, jen jednou, před první e-shopovou objednávkou =====\n${guard}\n\n` +
    `-- ===== ${file} =====\n${body}\n\nCOMMIT;\n`
  );
}

/**
 * Kategorie „Zmrzliny“ pro Production main (rozhodnutí vedení 8. 10. 2026):
 * obsah docs/eshop-catalog/61_zmrzliny.sql + pojistka — větev main, katalog
 * po fázi A (kategorie polévky…koktejly), zmrzliny ještě nejsou.
 */
export function guardedIceCreamCategorySql(timelineId = PRODUCTION_MAIN.timelineId) {
  const file = "docs/eshop-catalog/61_zmrzliny.sql";
  const lines = read(file).split("\n");
  const firstCode = lines.findIndex((line) => line.trim() !== "" && !line.trim().startsWith("--"));
  const body = lines
    .slice(firstCode)
    .filter((line) => !/^\s*(BEGIN|COMMIT)\s*;\s*$/.test(line))
    .join("\n")
    .trim();
  const guard = `DO $guard$
DECLARE
  timeline text := current_setting('neon.timeline_id', true);
BEGIN
  IF timeline IS DISTINCT FROM '${timelineId}' THEN
    RAISE EXCEPTION 'STOP: tohle NENÍ Production větev main (neon.timeline_id = %). Nic se nezměnilo.', coalesce(timeline, 'neznámý');
  END IF;
  IF (SELECT count(*) FROM product_categories WHERE slug IN ('polevky', 'sirupy', 'caje', 'ovocne-napoje', 'koktejly')) <> 5 THEN
    RAISE EXCEPTION 'STOP: katalog není ve stavu po fázi A (chybí některá z 5 kategorií). Nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM product_categories WHERE slug = 'zmrzliny') THEN
    RAISE EXCEPTION 'STOP: kategorie Zmrzliny už existuje. Nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'OK: Production main — přidávám kategorii Zmrzliny (bez produktů).';
END
$guard$;`;
  return (
    `-- PRODUCTION main — nová kategorie „Zmrzliny“ (viditelná, zatím bez produktů), S POJISTKOU\n` +
    `-- (VYGENEROVÁNO scripts/eshop-production/build-sql.mjs z ${file}).\n` +
    `-- Jako první krok kontrola: větev main (neon.timeline_id ${timelineId}), katalog po fázi A,\n` +
    `-- Zmrzliny ještě nejsou. Jinak „STOP“ a NIC se nezmění. Spouštět CELÉ najednou v Neon SQL Editoru.\n` +
    `-- Kontrola po: docs/eshop-catalog/62_zmrzliny_after.sql → 1 | Zmrzliny | 60 | ano | 0 | 6 | ano.\n` +
    `-- Vrácení: docs/eshop-catalog/69_zmrzliny_rollback.sql (skryje, nic nemaže).\n\n` +
    `BEGIN;\n\n-- ===== POJISTKA: jen Production main, jen jednou =====\n${guard}\n\n` +
    `-- ===== ${file} =====\n${body}\n\nCOMMIT;\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(ROOT, "docs/eshop-production/11_migrations_0013_0019.sql"), migrationsSql());
  writeFileSync(join(ROOT, "docs/eshop-production/19_migrations_rollback.sql"), rollbackSql());
  writeFileSync(join(ROOT, "docs/eshop-production/11_migrations_0013_0019_MAIN.sql"), guardedMigrationsSql());
  writeFileSync(join(ROOT, "docs/eshop-production/13_katalog_a_platby_A_MAIN.sql"), guardedPhaseARestSql());
  writeFileSync(join(ROOT, "docs/eshop-production/15_platby_B_MAIN.sql"), guardedPaymentsBSql());
  writeFileSync(join(ROOT, "docs/eshop-production/17_kategorie_zmrzliny_MAIN.sql"), guardedIceCreamCategorySql());
  console.log("OK: docs/eshop-production/11_migrations_0013_0019.sql, 11_migrations_0013_0019_MAIN.sql, 19_migrations_rollback.sql, 13_katalog_a_platby_A_MAIN.sql, 15_platby_B_MAIN.sql, 17_kategorie_zmrzliny_MAIN.sql");
}
