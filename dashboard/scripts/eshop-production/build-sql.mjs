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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(ROOT, "docs/eshop-production/11_migrations_0013_0019.sql"), migrationsSql());
  writeFileSync(join(ROOT, "docs/eshop-production/19_migrations_rollback.sql"), rollbackSql());
  console.log("OK: docs/eshop-production/11_migrations_0013_0019.sql, 19_migrations_rollback.sql");
}
