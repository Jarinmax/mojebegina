// ESHOP 1.0 — vygeneruje migraci 0014 (první naplnění katalogu) z
// lib/eshop/catalog.ts. NEBĚŽÍ proti DB — zapíše SQL soubor, který se
// aplikuje stejně jako ostatní migrace (ručně v Neon Console, nejdřív na
// testovací větvi). Ručně SQL neupravovat — změnit catalog.ts a spustit znovu.
//
// Spuštění:
//   npx tsx scripts/eshop-seed/generate-seed-sql.ts
//
// Idempotentní: INSERT … ON CONFLICT podle slug/sku, fotky přes WHERE NOT
// EXISTS. Opakované spuštění data aktualizuje, neduplikuje.
// Test lib/eshop/__tests__/catalogDb.test.ts hlídá, že soubor odpovídá
// aktuálnímu catalog.ts (parita DB ↔ catalog.ts).

import { writeFileSync } from "fs";
import { resolve } from "path";
import { seedRows } from "../../lib/eshop/seedFromCatalog";

export const SEED_MIGRATION_PATH = resolve(__dirname, "../../drizzle/0014_eshop_1_0_products_seed.sql");

const q = (value: string | null) => (value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`);
const num = (value: number | null) => (value === null ? "NULL" : String(value));
const textArray = (values: string[]) =>
  values.length === 0 ? "'{}'::text[]" : `ARRAY[${values.map(q).join(", ")}]::text[]`;
const json = (value: unknown) => (value === null ? "NULL" : `${q(JSON.stringify(value))}::jsonb`);

export function generateSeedSql(): string {
  const rows = seedRows();
  const statements: string[] = [];

  for (const c of rows.categories) {
    statements.push(`INSERT INTO "product_categories" ("slug", "name", "intro", "detail_sections", "image_url", "sort_order")
VALUES (${q(c.slug)}, ${q(c.name)}, ${textArray(c.intro)}, ${json(c.detailSections)}, ${q(c.imageUrl)}, ${c.sortOrder})
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "intro" = EXCLUDED."intro",
  "detail_sections" = EXCLUDED."detail_sections", "image_url" = EXCLUDED."image_url",
  "sort_order" = EXCLUDED."sort_order", "updated_at" = now();`);
  }

  for (const p of rows.products) {
    statements.push(`INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "storage_instructions", "shelf_life_note", "alcohol_percent",
  "is_age_restricted", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = ${q(p.categorySlug)}), ${q(p.slug)}, ${q(p.name)},
  ${q(p.shortDescription)}, ${textArray(p.description)}, ${textArray(p.highlights)}, ${q(p.tasteDescription)},
  ${q(p.ingredients)}, ${q(p.storageInstructions)}, ${q(p.shelfLifeNote)}, ${num(p.alcoholPercent)},
  ${p.isAgeRestricted}, ${textArray(p.warnings)}, ${p.sortOrder})
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "storage_instructions" = EXCLUDED."storage_instructions",
  "shelf_life_note" = EXCLUDED."shelf_life_note", "alcohol_percent" = EXCLUDED."alcohol_percent",
  "is_age_restricted" = EXCLUDED."is_age_restricted", "warnings" = EXCLUDED."warnings",
  "sort_order" = EXCLUDED."sort_order", "updated_at" = now();`);
  }

  for (const v of rows.variants) {
    statements.push(`INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = ${q(v.productSlug)}), ${q(v.sku)}, ${q(v.label)}, ${q(v.shortNote)},
  ${q(v.packageDescription)}, ${num(v.volumeMl)}, ${num(v.servings)}, ${v.priceB2cKc}, ${v.sortOrder})
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();`);
  }

  for (const i of rows.images) {
    statements.push(`INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", ${q(i.url)}, ${q(i.alt)}, ${i.sortOrder} FROM "products" WHERE "slug" = ${q(i.productSlug)}
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = ${q(i.productSlug)} AND pi."url" = ${q(i.url)});`);
  }

  const header = `-- ESHOP 1.0 — první naplnění katalogu. VYGENEROVÁNO z lib/eshop/catalog.ts
-- skriptem scripts/eshop-seed/generate-seed-sql.ts — ručně neupravovat.
-- ${rows.categories.length} kategorií, ${rows.products.length} produktů, ${rows.variants.length} balení (SKU), ${rows.images.length} fotek.
-- Idempotentní (ON CONFLICT / WHERE NOT EXISTS).
`;
  return header + statements.join("\n--> statement-breakpoint\n") + "\n";
}

if (require.main === module) {
  writeFileSync(SEED_MIGRATION_PATH, generateSeedSql());
  console.log(`Zapsáno: ${SEED_MIGRATION_PATH}`);
}
