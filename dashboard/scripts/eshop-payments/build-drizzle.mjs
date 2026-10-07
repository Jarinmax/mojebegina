// ESHOP 1.0 — platby a fakturace: drizzle/0020 sestavená z balíčku, který
// běží na Preview (docs/eshop-payments/11_migration.sql = krok A,
// 21_migration.sql = krok B), aby čerstvá DB (testy, budoucí Production)
// měla přesně stejné schéma jako Preview. Snapshot drizzle/meta/0020 je
// z drizzle-kit (schema.ts); názvy cizích klíčů v DB jsou postgresové
// (*_fkey), ne drizzle (*_fk) — při budoucí změně cizího klíče na to myslet.
//
//   node scripts/eshop-payments/build-drizzle.mjs
// Test lib/eshop/__tests__/paymentsMigration.test.ts hlídá, že soubor = výstup.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const DRIZZLE_TAG = "0020_eshop_1_0_payments_invoicing";

/** Tělo skriptu bez úvodních komentářů a bez BEGIN/COMMIT (drizzle si transakci řídí sám). */
function body(name) {
  const text = readFileSync(join(ROOT, "docs/eshop-payments", name), "utf8");
  const start = text.indexOf("BEGIN;\n");
  const end = text.lastIndexOf("COMMIT;");
  if (start < 0 || end < 0) throw new Error(`${name}: chybí BEGIN/COMMIT`);
  return text.slice(start + "BEGIN;\n".length, end).trim();
}

export function drizzleSql() {
  return (
    `-- ESHOP 1.0 — platby a fakturace (VYGENEROVÁNO scripts/eshop-payments/build-drizzle.mjs).\n` +
    `-- = docs/eshop-payments/11_migration.sql (krok A) + 21_migration.sql (krok B).\n` +
    `${body("11_migration.sql")}\n--> statement-breakpoint\n${body("21_migration.sql")}\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(ROOT, `drizzle/${DRIZZLE_TAG}.sql`), drizzleSql());
  console.log(`zapsáno drizzle/${DRIZZLE_TAG}.sql`);
}
