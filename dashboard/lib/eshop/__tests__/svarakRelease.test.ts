// Skript docs/eshop-production/52_svarak_deluxe_MAIN.sql nad kopií katalogu
// ve stavu Production (koktejly s neověřenými alergeny): uvolní jen Svařák
// Deluxe — siřičitany, složení, výživové údaje, zákonný název — a zákazník
// je uvidí na detailu produktu; ostatní produkty beze změny.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { loadCatalog } from "../catalogDb";
import { createCatalogIndex } from "../catalogIndex";
import { isOrderable } from "../productRules";
import { validateCheckoutInput } from "../checkout";
import { createMigratedDb } from "./helpers/migratedDb";

const SCRIPT = readFileSync(path.join(__dirname, "../../../docs/eshop-production/52_svarak_deluxe_MAIN.sql"), "utf8");
const MAIN = "70a96b3677653646e65343cae8e27182";
const DB_TEST = { timeout: 120_000 };

describe("Svařák Deluxe do prodeje (skript 52)", DB_TEST, () => {
  let pg: PGlite;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  const othersFingerprint = async () =>
    (
      await pg.query<{ h: string }>(
        `SELECT md5(string_agg(to_jsonb(p)::text, '|' ORDER BY p.slug)) AS h FROM products p WHERE p.slug <> 'svarak-deluxe'`
      )
    ).rows[0].h;

  beforeAll(async () => {
    ({ pg, db } = await createMigratedDb());
    // stav jako v Production main: koktejly bez ověřených alergenů a výživových údajů
    await pg.exec(`UPDATE products p SET allergens = NULL, nutrition = NULL, nutrition_basis = NULL
                   FROM product_categories c WHERE c.id = p.category_id AND c.slug = 'koktejly'`);
  }, DB_TEST.timeout);

  it("mimo Production main / Preview se zastaví a nic nezmění", async () => {
    await expect(pg.exec(SCRIPT)).rejects.toThrow(/Neznámá větev/);
    const { rows } = await pg.query<{ allergens: string[] | null }>(`SELECT allergens FROM products WHERE slug = 'svarak-deluxe'`);
    expect(rows[0].allergens).toBeNull();
  });

  it("na main: jen Svařák — siřičitany, složení bez kyseliny citronové, výživové údaje na 100 ml, zákonný název", async () => {
    const before = await othersFingerprint();
    await pg.exec(`SELECT set_config('neon.timeline_id', '${MAIN}', false)`);
    await pg.exec(SCRIPT);
    expect(await othersFingerprint()).toBe(before);

    const index = createCatalogIndex(await loadCatalog(db));
    const svarak = index.getProduct("svarak-deluxe")!;
    expect(isOrderable(svarak)).toBe(true);
    expect(svarak.isAgeRestricted).toBe(true);
    expect(svarak.alcoholPercent).toBe(7.5);
    expect(svarak.shortDescription).toBe("Aromatizovaný nápoj z vína s pomerančovou, grepovou a citronovou šťávou a kořením.");
    expect(svarak.foodInfo.allergens).toEqual(["oxid siřičitý a siřičitany"]);
    expect(svarak.foodInfo.ingredients).toContain("červené víno 63 % (obsahuje SIŘIČITANY)");
    expect(svarak.foodInfo.ingredients).not.toContain("kyselina citronová");
    expect(svarak.foodInfo.nutritionPer100g).toBe(
      "na 100 ml: energie 325 kJ / 77 kcal, tuky 0 g (z toho nasycené 0 g), sacharidy 8,7 g (z toho cukry 6,8 g), bílkoviny 0,2 g, sůl 0 g"
    );
    // ostatní koktejly zůstávají „Připravujeme“
    for (const slug of ["lady-carneval", "granatovy-bond", "kosmopolitan"]) {
      expect(isOrderable(index.getProduct(slug)!), slug).toBe(false);
    }
  });

  it("pokladna: Svařák jde objednat jen s potvrzením 18+", () => {
    // validace nad katalogem po skriptu
    return loadCatalog(db).then((catalog) => {
      const index = createCatalogIndex(catalog);
      const input = {
        cart: JSON.stringify([{ sku: "svarak-deluxe-500ml", quantity: 1 }]),
        name: "Jana Nováková",
        email: "jana@example.cz",
        phone: "+420 777 123 456",
        shippingMethodId: "osobni-odber",
        paymentMethodId: "prevod",
        street: "",
        city: "",
        zip: "",
        note: "",
        termsAccepted: true,
      };
      expect(validateCheckoutInput({ ...input, ageConfirmed: false }, index).ok).toBe(false);
      expect(validateCheckoutInput({ ...input, ageConfirmed: true }, index).ok).toBe(true);
    });
  });

  it("druhé spuštění nic nezmění", async () => {
    await expect(pg.exec(SCRIPT)).rejects.toThrow(/našel jsem 0/);
  });
});
