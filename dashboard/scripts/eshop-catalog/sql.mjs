// ESHOP 1.0 — společné stavební bloky katalogových skriptů (docs/eshop-catalog).
// Každý příkaz je idempotentní (ON CONFLICT / WHERE NOT EXISTS), takže skript
// jde spustit opakovaně a jen přepíše texty na aktuální.

export const q = (s) => (s === null || s === undefined ? "NULL" : `'${String(s).replaceAll("'", "''")}'`);
export const arr = (xs) => (xs.length ? `ARRAY[${xs.map(q).join(", ")}]::text[]` : "'{}'::text[]");
export const json = (v) => (v === null || v === undefined ? "NULL" : `${q(JSON.stringify(v))}::jsonb`);

/** Text a společné sekce kategorie; `intro` / `detailSections` neuvedené = beze změny. */
export function categorySql(slug, { intro, detailSections }) {
  const sets = [];
  if (intro) sets.push(`"intro" = ${arr(intro)}`);
  if (detailSections) sets.push(`"detail_sections" = ${json(detailSections)}`);
  return `UPDATE "product_categories" SET ${sets.join(",\n  ")}, "updated_at" = now()
WHERE "slug" = ${q(slug)};
`;
}

/** Produkt (vytvoří nebo přepíše texty, znovu zapne prodej). */
export function productSql(p, categorySlug, sortOrder) {
  return `INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = ${q(categorySlug)}), ${q(p.slug)}, ${q(p.name)},
  ${q(p.shortDescription)}, ${arr(p.description)}, ${arr(p.highlights)},
  ${q(p.taste)}, ${q(p.ingredients)}, ${json(p.nutrition)}, ${p.nutrition ? "'100ml'" : "NULL"}, ${q(p.storage)}, ${arr(p.warnings)}, ${sortOrder})
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();
`;
}

/** Balení produktu podle SKU (stávající SKU = přepsání téhož balení). */
export function variantSql(productSlug, { sku, label, note, description, volumeMl, servings, price }, sortOrder) {
  return `INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = ${q(productSlug)}), ${q(sku)}, ${q(label)}, ${q(note)},
  ${q(description)}, ${volumeMl}, ${servings}, ${price}, ${sortOrder})
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();
`;
}

/** Hlavní fotka produktu (public/eshop/<slug>.jpg), jen pokud ještě není. */
export function imageSql(p) {
  const url = `/eshop/${p.slug}.jpg`;
  return `INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", ${q(url)}, ${q(p.name)}, 0 FROM "products" WHERE "slug" = ${q(p.slug)}
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = ${q(p.slug)} AND pi."url" = ${q(url)});
`;
}
