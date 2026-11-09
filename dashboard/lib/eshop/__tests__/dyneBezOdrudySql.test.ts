// docs/eshop-production/75_dynova_polevka_bez_odrudy_MAIN.sql nad PGlite
// se stavem jako v Production (složení s „Hokkaido“): po skriptu „dýně 39 %“,
// zbytek složení beze změny, podruhé pojistka zastaví.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/migratedDb";

const ROOT = path.join(__dirname, "../../..");
const SCRIPT = readFileSync(path.join(ROOT, "docs/eshop-production/75_dynova_polevka_bez_odrudy_MAIN.sql"), "utf8").replace(
  "IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'",
  "IS NOT NULL AND false"
);
const PROD =
  "čistá filtrovaná voda, dýně Hokkaido 39 %, kokosové mléko 15 % (kokosový extrakt 70 %, voda, emulgátor E435), brambory 9 %, cibule 4 %, olivový olej, dýňový olej, petržel kořen, mořská sůl, třtinový cukr, zázvor, lahůdkové droždí, grepová šťáva, chilli, muškátový oříšek, hřebíček, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C), přírodní aroma";

describe("75: dýňová polévka bez odrůdy", { timeout: 120_000 }, () => {
  let pg: PGlite;
  beforeAll(async () => {
    ({ pg } = await createMigratedDb());
    await pg.exec(readFileSync(path.join(ROOT, "docs/eshop-catalog/41_polevky.sql"), "utf8"));
    await pg.query(`UPDATE products SET ingredients = $1 WHERE slug = 'dynova-polevka'`, [PROD]);
  }, 120_000);

  it("„dýně 39 %“, ostatní složení beze změny; podruhé se zastaví", async () => {
    await pg.exec(SCRIPT);
    const { rows } = await pg.query<{ ingredients: string }>(`SELECT ingredients FROM products WHERE slug = 'dynova-polevka'`);
    expect(rows[0].ingredients).toBe(PROD.replace("dýně Hokkaido 39 %", "dýně 39 %"));
    expect(rows[0].ingredients).not.toMatch(/hokkaid/i);
    await expect(pg.exec(SCRIPT)).rejects.toThrow(/Čekal jsem 1 produkt/);
    await pg.exec("ROLLBACK");
  });
});
