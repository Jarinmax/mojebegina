// Chlazená přeprava podle hmotnosti (ESHOP_WEIGHT_SHIPPING=on) nad PGlite
// s katalogem jako v Production (skripty 31–61) a hmotnostmi ze skriptu
// docs/eshop-production/41_hmotnosti.sql:
// 1) balíček 40/41/42/49 — přesně soubory pro Neon SQL Editor,
// 2) katalog (hmotnosti jen se zapnutým režimem, bez sloupce nespadne),
// 3) cena na serveru (priceCart / validateCheckoutInput): hranice pásem,
//    součty různých SKU, nad 150 kg a bez hmotnosti → individuální domluva,
//    osobní odběr zdarma, jen česká PSČ, výchozí paušál beze změny,
// 4) zobrazená cena (výpočet pokladny v prohlížeči) = cena serveru,
// 5) stav Production (bez sloupce, bez přepínače): paušál, weight_g se nečte,
// 6) uložená objednávka přes ovladač Neonu = zobrazená = spočtená serverem.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { loadCatalog } from "../catalogDb";
import { createCatalogIndex, type CatalogIndex } from "../catalogIndex";
import { priceCart } from "../pricing";
import { resolveCartLines } from "../cart";
import { validateCheckoutInput, type CheckoutInput } from "../checkout";
import { getShippingMethod, quoteShipping, shippingMethodsFor, shippingModeFromEnv } from "../shipping";
import { shippingPageFor, OPERATOR } from "../infoPages";
import { createMigratedDb } from "./helpers/migratedDb";

const DB_TEST = { timeout: 180_000 };
const ROOT = path.join(__dirname, "../../..");
const production = (name: string) => readFileSync(path.join(ROOT, "docs/eshop-production", name), "utf8");
const CATALOG = ["31_sirupy.sql", "41_polevky.sql", "51_caje.sql", "61_zmrzliny.sql"];
const BEFORE_WEIGHTS = "0020_eshop_1_0_payments_invoicing";

/** Stav Production 11. 10. 2026: migrace do 0020 + katalogové skripty, bez weight_g. */
async function productionLikeDb() {
  const created = await createMigratedDb(BEFORE_WEIGHTS);
  for (const name of CATALOG) await created.pg.exec(readFileSync(path.join(ROOT, "docs/eshop-catalog", name), "utf8"));
  // testovací data: neověřené alergeny jako ověřené, ať jde vše objednat (blokaci hlídá allergenGate.test.ts)
  await created.pg.exec(`UPDATE products SET allergens = '{}' WHERE allergens IS NULL`);
  return created;
}

async function check(pg: PGlite, name: string): Promise<string> {
  const { rows } = await pg.query<Record<string, unknown>>(production(name).replace(/--[^\n]*\n/g, ""));
  return Object.values(rows[0]).map(String).join(" | ");
}

describe("SQL balíček hmotností (40 / 41 / 42 / 49)", DB_TEST, () => {
  let pg: PGlite;

  beforeAll(async () => {
    ({ pg } = await productionLikeDb());
  }, DB_TEST.timeout);

  it("kontrola před = stav Production: sloupec chybí, 36 aktivních SKU, všechna ze seznamu", async () => {
    expect(await check(pg, "40_hmotnosti_before.sql")).toBe("0 | 36 | 36 | 0");
  });

  it("doplnění: 36 hmotností (25× 3 kg, 7× 0,75 kg, 4× 0,5 kg), žádné aktivní balení bez hmotnosti", async () => {
    await pg.exec(production("41_hmotnosti.sql"));
    expect(await check(pg, "42_hmotnosti_after.sql")).toBe("1 | 36 | 0 | 25 | 7 | 4 | 0");
    const { rows } = await pg.query<{ sku: string; weight_g: number }>(
      `SELECT sku, weight_g FROM product_variants WHERE sku IN ('kulajda', 'lipovy-sirup-750ml', 'svarak-deluxe-500ml', 'cerny-caj-golden-nepal-3l') ORDER BY sku`
    );
    expect(rows).toEqual([
      { sku: "cerny-caj-golden-nepal-3l", weight_g: 3000 },
      { sku: "kulajda", weight_g: 3000 },
      { sku: "lipovy-sirup-750ml", weight_g: 750 },
      { sku: "svarak-deluxe-500ml", weight_g: 500 },
    ]);
  });

  it("výsledné schéma product_variants = drizzle 0021 (sloupec i pojistka > 0)", async () => {
    const shape = async (db: PGlite) =>
      (
        await db.query(`
          SELECT 'col' AS k, column_name AS n, data_type || ':' || is_nullable AS d FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'product_variants'
          UNION ALL SELECT 'con', conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'product_variants'::regclass
          ORDER BY 1, 2`)
      ).rows;
    const { pg: reference } = await createMigratedDb();
    expect(await shape(pg)).toEqual(await shape(reference));
    await expect(pg.exec(`UPDATE product_variants SET weight_g = 0 WHERE sku = 'kulajda'`)).rejects.toThrow(/product_variants_weight_positive/);
  });

  it("druhé spuštění se zastaví a nic nezmění", async () => {
    await expect(pg.exec(production("41_hmotnosti.sql"))).rejects.toThrow(/už existuje/);
    expect(await check(pg, "42_hmotnosti_after.sql")).toBe("1 | 36 | 0 | 25 | 7 | 4 | 0");
  });

  it("návrat odstraní sloupec; skript jde pak spustit znovu", async () => {
    await pg.exec(production("49_hmotnosti_rollback.sql"));
    expect(await check(pg, "40_hmotnosti_before.sql")).toBe("0 | 36 | 36 | 0");
    await expect(pg.exec(production("49_hmotnosti_rollback.sql"))).rejects.toThrow(/neexistuje/);
    await pg.exec(production("41_hmotnosti.sql"));
    expect(await check(pg, "42_hmotnosti_after.sql")).toBe("1 | 36 | 0 | 25 | 7 | 4 | 0");
  });

  it("chybí-li některé SKU (nebo není aktivní), skript se zastaví a nic nezmění", async () => {
    const { pg: other } = await productionLikeDb();
    await other.exec(`UPDATE product_variants SET is_active = false WHERE sku = 'kulajda'`);
    await expect(other.exec(production("41_hmotnosti.sql"))).rejects.toThrow(/chybí nebo nejsou aktivní: kulajda/);
    expect(await check(other, "40_hmotnosti_before.sql")).toBe("0 | 35 | 35 | 0");
  });
});

// Verze s pojistkou větve (Neon nastavuje neon.timeline_id; PGlite ho dostane přes set_config).
describe.each([
  ["41_hmotnosti_PREVIEW.sql", "1d684d3fc82670cfe6342261f58e1415", "70a96b3677653646e65343cae8e27182"],
  ["41_hmotnosti_MAIN.sql", "70a96b3677653646e65343cae8e27182", "1d684d3fc82670cfe6342261f58e1415"],
])("%s — běží jen na své větvi", (file, own, other) => {
  const onBranch = async (timeline: string | null) => {
    const { pg } = await productionLikeDb();
    if (timeline) await pg.query(`SELECT set_config('neon.timeline_id', $1, false)`, [timeline]);
    return pg;
  };

  it("jiná nebo neznámá větev → STOP, nic se nezmění", DB_TEST, async () => {
    for (const timeline of [other, null]) {
      const pg = await onBranch(timeline);
      await expect(pg.exec(production(file))).rejects.toThrow(/STOP: tohle NENÍ/);
      expect(await check(pg, "40_hmotnosti_before.sql")).toBe("0 | 36 | 36 | 0");
    }
  });

  it("vlastní větev → 36 hmotností jako 41_hmotnosti.sql; podruhé se zastaví", DB_TEST, async () => {
    const pg = await onBranch(own);
    await pg.exec(production(file));
    expect(await check(pg, "42_hmotnosti_after.sql")).toBe("1 | 36 | 0 | 25 | 7 | 4 | 0");
    await expect(pg.exec(production(file))).rejects.toThrow(/už existuje/);
    const reference = await onBranch(null);
    await reference.exec(production("41_hmotnosti.sql"));
    const weights = `SELECT sku, weight_g FROM product_variants ORDER BY sku`;
    expect((await pg.query(weights)).rows).toEqual((await reference.query(weights)).rows);
  });
});

describe("katalog: hmotnosti jen se zapnutým režimem", DB_TEST, () => {
  it("před migrací (sloupec chybí) katalog funguje, hmotnosti null → chlazená přeprava nedostupná", async () => {
    const { db } = await productionLikeDb();
    const catalog = await loadCatalog(db, { weights: true });
    const variants = catalog.products.flatMap((p) => p.variants);
    expect(variants).toHaveLength(36);
    expect(variants.every((v) => v.weightGrams === null)).toBe(true);
    const result = priceCart([{ sku: "kulajda", quantity: 1 }], "rozvoz", createCatalogIndex(catalog), { shippingMode: "weight" });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/neznáme hmotnost.*individuálně/) });
  });

  it("po skriptu 41: s { weights: true } hmotnosti z DB, bez něj null (výchozí stav beze změny)", async () => {
    const { pg, db } = await productionLikeDb();
    await pg.exec(production("41_hmotnosti.sql"));
    const weighed = (await loadCatalog(db, { weights: true })).products.flatMap((p) => p.variants);
    expect(Object.fromEntries(weighed.map((v) => [v.sku, v.weightGrams]))).toMatchObject({
      kulajda: 3000,
      "lipovy-sirup-750ml": 750,
      "kosmopolitan-500ml": 500,
    });
    expect(weighed.every((v) => v.weightGrams! > 0)).toBe(true);
    const plain = (await loadCatalog(db)).products.flatMap((p) => p.variants);
    expect(plain.every((v) => v.weightGrams === null)).toBe(true);
  });

  it("jiná chyba DB než chybějící sloupec se neschová", async () => {
    const { pg, db } = await productionLikeDb();
    await pg.exec(`ALTER TABLE product_variants ADD COLUMN weight_g text`);
    await pg.exec(`UPDATE product_variants SET weight_g = 'x'`);
    // text místo čísla projde dotazem, ale ne kontrolou ceny: neznámá hmotnost nesmí dát cenu
    const index = createCatalogIndex(await loadCatalog(db, { weights: true }));
    expect(priceCart([{ sku: "kulajda", quantity: 1 }], "rozvoz", index, { shippingMode: "weight" }).ok).toBe(false);
    await pg.exec(`DROP TABLE product_images CASCADE`);
    await expect(loadCatalog(db, { weights: true })).rejects.toThrow();
  });
});

describe("cena dopravy na serveru — režim podle hmotnosti", DB_TEST, () => {
  let index: CatalogIndex;
  const price = (cart: { sku: string; quantity: number }[], method = "rozvoz") =>
    priceCart(cart, method, index, { shippingMode: "weight" });
  const shippingKc = (cart: { sku: string; quantity: number }[]) => {
    const result = price(cart);
    if (!result.ok) throw new Error(result.error);
    return [result.value.weightGrams, result.value.shippingKc];
  };

  beforeAll(async () => {
    const { pg, db } = await productionLikeDb();
    await pg.exec(production("41_hmotnosti.sql"));
    index = createCatalogIndex(await loadCatalog(db, { weights: true }));
  }, DB_TEST.timeout);

  it.each([
    ["1× polévka 3 l", [{ sku: "kulajda", quantity: 1 }], 3000, 267],
    ["1× sirup 750 g", [{ sku: "lipovy-sirup-750ml", quantity: 1 }], 750, 267],
    ["4× 3 l + 3× 750 g = 14,25 kg (poslední pod hranicí)", [{ sku: "kulajda", quantity: 4 }, { sku: "zazvorovy-sirup-750ml", quantity: 3 }], 14_250, 267],
    ["5× 3 l z různých SKU = přesně 15 kg", [{ sku: "kulajda", quantity: 2 }, { sku: "lipovy-caj-3l", quantity: 2 }, { sku: "sipkovy-sirup-3l", quantity: 1 }], 15_000, 379],
    ["6× 3 l + 1× 500 ml = 18,5 kg", [{ sku: "dynova-polevka", quantity: 6 }, { sku: "kosmopolitan-500ml", quantity: 1 }], 18_500, 379],
    ["6× 3 l + 4× 500 ml = 20 kg", [{ sku: "dynova-polevka", quantity: 6 }, { sku: "kosmopolitan-500ml", quantity: 4 }], 20_000, 491],
    ["33× 3 l + 1× 750 g = 99,75 kg", [{ sku: "kulajda", quantity: 33 }, { sku: "lipovy-sirup-750ml", quantity: 1 }], 99_750, 1277],
    ["33× 3 l + 2× 500 ml = 100 kg (pásmo 11)", [{ sku: "kulajda", quantity: 33 }, { sku: "lady-carneval-500ml", quantity: 2 }], 100_000, 1839],
    ["50× 3 l = přesně 150 kg", [{ sku: "kulajda", quantity: 25 }, { sku: "svarak-deluxe-3l", quantity: 25 }], 150_000, 1839],
  ])("%s", (_name, cart, grams, kc) => {
    expect(shippingKc(cart)).toEqual([grams, kc]);
  });

  it("součet: zboží + doprava = celkem", () => {
    const result = price([{ sku: "kulajda", quantity: 5 }]);
    expect(result).toMatchObject({ ok: true, value: { subtotalKc: 5 * 379, shippingKc: 379, totalKc: 5 * 379 + 379 } });
  });

  it("150,5 kg (50× 3 l + 1× 500 ml) → chlazenou přepravu nelze objednat, výzva k individuální domluvě", () => {
    const result = price([{ sku: "kulajda", quantity: 50 }, { sku: "kosmopolitan-500ml", quantity: 1 }]);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Objednávka váží 150,5 kg") });
    if (result.ok) return;
    expect(result.error).toContain("nad 150 kg nelze objednat automaticky");
    expect(result.error).toContain(OPERATOR.email);
    expect(result.error).toContain(OPERATOR.phone);
    expect(result.error).toContain("osobní vyzvednutí ve Viticích");
  });

  it("položka bez hmotnosti → cenu nejde určit, chlazená přeprava se nenabídne (nic se nedopočítává)", () => {
    const [product, variant] = [index.getProduct("kulajda")!, index.getVariant("kulajda")!.variant];
    const withoutWeight = createCatalogIndex({
      ...index.catalog,
      products: index.catalog.products.map((p) =>
        p === product ? { ...p, variants: p.variants.map((v) => (v === variant ? { ...v, weightGrams: null } : v)) } : p
      ),
    });
    const result = priceCart([{ sku: "kulajda", quantity: 1 }, { sku: "lipovy-caj-3l", quantity: 1 }], "rozvoz", withoutWeight, {
      shippingMode: "weight",
    });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/^U položky Kulajda — 3 l .* zatím neznáme hmotnost.*individuálně/) });
  });

  it("osobní odběr ve Viticích zdarma vždy — i nad 150 kg a bez hmotnosti", () => {
    for (const cart of [[{ sku: "kulajda", quantity: 1 }], [{ sku: "kulajda", quantity: 60 }]]) {
      expect(price(cart, "osobni-odber")).toMatchObject({ ok: true, value: { shippingKc: 0, weightGrams: null } });
    }
    const pickup = getShippingMethod("osobni-odber", "weight")!;
    expect(quoteShipping(pickup, [{ sku: "x", name: "X", quantity: 1, weightGrams: null }], "weight", OPERATOR)).toEqual({
      available: true,
      priceKc: 0,
      weightGrams: null,
    });
  });

  it("výchozí režim (paušál) beze změny: 99 Kč bez ohledu na hmotnost", () => {
    for (const quantity of [1, 60]) {
      expect(priceCart([{ sku: "kulajda", quantity }], "rozvoz", index)).toMatchObject({ ok: true, value: { shippingKc: 99, weightGrams: null } });
    }
  });

  describe("pokladna (validateCheckoutInput) — cena jen ze serveru, doručení jen v ČR", () => {
    const input = (overrides: Partial<CheckoutInput>): CheckoutInput => ({
      cart: JSON.stringify([{ sku: "kulajda", quantity: 5 }]),
      name: "Jana Nováková",
      email: "jana@example.cz",
      phone: "+420 777 123 456",
      shippingMethodId: "rozvoz",
      paymentMethodId: "prevod",
      street: "Prvního pluku 14",
      city: "Praha",
      zip: "186 00",
      note: "",
      termsAccepted: true,
      ageConfirmed: true,
      ...overrides,
    });
    const validate = (overrides: Partial<CheckoutInput> = {}) =>
      validateCheckoutInput(input(overrides), index, { shippingMode: "weight" });

    it("15 kg chlazenou přepravou → 379 Kč spočtené serverem", () => {
      expect(validate()).toMatchObject({ ok: true, value: { pricedCart: { shippingKc: 379, totalKc: 5 * 379 + 379, weightGrams: 15_000 } } });
    });

    it("cenu dopravy z formuláře server neslyší (pole navíc nic nemění)", () => {
      const tampered = { ...input({}), shippingKc: "0", priceKc: "1" } as CheckoutInput;
      expect(validateCheckoutInput(tampered, index, { shippingMode: "weight" })).toMatchObject({
        ok: true,
        value: { pricedCart: { shippingKc: 379 } },
      });
    });

    it("nad 150 kg pokladna objednávku chlazenou přepravou odmítne, osobním odběrem přijme", () => {
      const heavy = JSON.stringify([{ sku: "kulajda", quantity: 51 }]);
      expect(validate({ cart: heavy })).toEqual({ ok: false, error: expect.stringContaining("individuálně") });
      expect(validate({ cart: heavy, shippingMethodId: "osobni-odber" })).toMatchObject({ ok: true, value: { pricedCart: { shippingKc: 0 } } });
    });

    it.each(["110 00", "79001", "186 00"])("české PSČ %s projde", (zip) => {
      expect(validate({ zip }).ok).toBe(true);
    });

    it.each(["811 01", "04001", "960 01"])("slovenské PSČ %s → doručujeme jen v ČR", (zip) => {
      expect(validate({ zip })).toEqual({ ok: false, error: "Doručujeme jen v České republice — zadejte prosím české PSČ." });
    });
  });
});

/** Cena, kterou ukáže pokladna v prohlížeči (CheckoutForm: resolveCartLines → quoteShipping). */
function displayedShipping(index: CatalogIndex, cart: { sku: string; quantity: number }[], method: string) {
  const lines = resolveCartLines(cart, index);
  const shipping = shippingMethodsFor("weight").find((m) => m.id === method)!;
  const quote = quoteShipping(
    shipping,
    lines.map((l) => ({ sku: l.sku, name: l.name, quantity: l.quantity, weightGrams: l.variant.weightGrams })),
    "weight",
    OPERATOR
  );
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotalKc, 0);
  return quote.available ? { shippingKc: quote.priceKc, totalKc: subtotal + quote.priceKc } : { unavailable: quote.message };
}

describe("zobrazená cena v pokladně = cena spočtená serverem", DB_TEST, () => {
  let index: CatalogIndex;

  beforeAll(async () => {
    const { pg, db } = await productionLikeDb();
    await pg.exec(production("41_hmotnosti.sql"));
    index = createCatalogIndex(await loadCatalog(db, { weights: true }));
  }, DB_TEST.timeout);

  // Košík přesně dané hmotnosti z balení 3 kg (polévka), 0,75 kg (sirup) a 0,5 kg (koktejl).
  const cartOf = (grams: number) => {
    for (let syrups = 0; syrups < 4; syrups++)
      for (let cocktails = 0; cocktails < 6; cocktails++) {
        const rest = grams - syrups * 750 - cocktails * 500;
        if (rest >= 0 && rest % 3000 === 0)
          return [
            { sku: "kulajda", quantity: rest / 3000 },
            { sku: "lipovy-sirup-750ml", quantity: syrups },
            { sku: "kosmopolitan-500ml", quantity: cocktails },
          ].filter((line) => line.quantity > 0);
      }
    throw new Error(`${grams} g nejde složit`);
  };
  // každá hranice pásma: poslední možná hmotnost pod ní (−0,25 kg) a přesně na ní; oba způsoby doručení
  const carts: [string, { sku: string; quantity: number }[]][] = [];
  for (const kg of [15, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
    carts.push([`${kg - 0.25} kg`, cartOf(kg * 1000 - 250)]);
    carts.push([`${kg} kg`, cartOf(kg * 1000)]);
  }
  carts.push(["150 kg", [{ sku: "kulajda", quantity: 50 }]]);
  carts.push(["150,5 kg", [{ sku: "kulajda", quantity: 50 }, { sku: "granatovy-bond-500ml", quantity: 1 }]]);
  carts.push(["mix 7 SKU", [
    { sku: "kulajda", quantity: 2 }, { sku: "lipovy-caj-3l", quantity: 1 }, { sku: "sipkovy-sirup-3l", quantity: 1 },
    { sku: "zazvorovy-sirup-750ml", quantity: 2 }, { sku: "svarak-deluxe-500ml", quantity: 3 }, { sku: "kosmopolitan-3l", quantity: 1 },
    { sku: "cerny-caj-golden-nepal-3l", quantity: 1 },
  ]]);

  it.each(carts)("%s — chlazená přeprava i osobní odběr", (_name, cart) => {
    for (const method of ["rozvoz", "osobni-odber"]) {
      const shown = displayedShipping(index, cart, method);
      const server = priceCart(cart, method, index, { shippingMode: "weight" });
      if ("unavailable" in shown) {
        expect(server).toEqual({ ok: false, error: shown.unavailable });
      } else {
        expect(server).toMatchObject({ ok: true, value: shown });
      }
    }
  });

  it("hranice pásem dávají ceník WooCommerce", () => {
    const kc = (cart: { sku: string; quantity: number }[]) => {
      const r = priceCart(cart, "rozvoz", index, { shippingMode: "weight" });
      return r.ok ? [r.value.weightGrams, r.value.shippingKc] : r.error;
    };
    const byName = Object.fromEntries(carts.map(([n, c]) => [n, kc(c)]));
    expect(byName).toMatchObject({
      "14.75 kg": [14_750, 267], "15 kg": [15_000, 379],
      "19.75 kg": [19_750, 379], "20 kg": [20_000, 491],
      "29.75 kg": [29_750, 491], "30 kg": [30_000, 604],
      "39.75 kg": [39_750, 604], "40 kg": [40_000, 716],
      "49.75 kg": [49_750, 716], "50 kg": [50_000, 828],
      "59.75 kg": [59_750, 828], "60 kg": [60_000, 940],
      "69.75 kg": [69_750, 940], "70 kg": [70_000, 1053],
      "79.75 kg": [79_750, 1053], "80 kg": [80_000, 1165],
      "89.75 kg": [89_750, 1165], "90 kg": [90_000, 1277],
      "99.75 kg": [99_750, 1277], "100 kg": [100_000, 1839],
      "150 kg": [150_000, 1839],
    });
    expect(byName["150,5 kg"]).toEqual(expect.stringContaining("nelze objednat automaticky"));
  });
});

describe("Production: bez přepínače i bez sloupce weight_g beze změny", DB_TEST, () => {
  it("katalog nečte weight_g, pokladna účtuje 99 Kč, nad 150 kg dál objednatelné, uložená cena 99 Kč", async () => {
    const { pg, db } = await productionLikeDb(); // = Production: sloupec weight_g neexistuje
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mode = shippingModeFromEnv({ VERCEL_ENV: "production" }); // přepínač v Production nenastaven
    expect(mode).toBe("flat");
    const index = createCatalogIndex(await loadCatalog(db, { weights: mode === "weight" }));
    // dotaz na hmotnosti se vůbec nespustil (jinak by chybějící sloupec ohlásil varování)
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    for (const quantity of [1, 51]) {
      expect(priceCart([{ sku: "kulajda", quantity }], "rozvoz", index, { shippingMode: mode })).toMatchObject({
        ok: true,
        value: { shippingKc: 99, weightGrams: null },
      });
    }
    // ani zapnutý přepínač bez migrace nic nerozbije: katalog běží, chlazená přeprava jen nedostupná
    const weighed = createCatalogIndex(await loadCatalog(db, { weights: true }));
    expect(priceCart([{ sku: "kulajda", quantity: 1 }], "osobni-odber", weighed, { shippingMode: "weight" }).ok).toBe(true);
    expect(priceCart([{ sku: "kulajda", quantity: 1 }], "rozvoz", weighed, { shippingMode: "weight" }).ok).toBe(false);
    const { rows } = await pg.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'product_variants' AND column_name = 'weight_g'`);
    expect(rows).toEqual([{ n: 0 }]);
  });
});

describe("přepínač ESHOP_WEIGHT_SHIPPING a texty", () => {
  it("jen přesně „on“ zapíná ceník podle hmotnosti; výchozí = paušál", () => {
    expect(shippingModeFromEnv({})).toBe("flat");
    expect(shippingModeFromEnv({ ESHOP_WEIGHT_SHIPPING: "1" })).toBe("flat");
    expect(shippingModeFromEnv({ ESHOP_WEIGHT_SHIPPING: "ON" })).toBe("flat");
    expect(shippingModeFromEnv({ ESHOP_WEIGHT_SHIPPING: "on" })).toBe("weight");
  });

  it("nabídka: osobní odběr zdarma v obou režimech; paušál beze změny", () => {
    expect(shippingMethodsFor("flat").map((m) => [m.id, m.priceKc])).toEqual([["osobni-odber", 0], ["rozvoz", 99]]);
    expect(shippingMethodsFor("weight")[0]).toEqual(shippingMethodsFor("flat")[0]);
    expect(shippingMethodsFor("weight")[1].description).toContain("v České republice");
  });

  it("stránka Doprava: v režimu podle hmotnosti celý ceník z shippingRates.ts, nad 150 kg individuálně; bez dopravy zdarma", () => {
    const page = shippingPageFor("weight");
    const text = JSON.stringify(page.blocks);
    expect(text).toContain("0–14,99 kg — 267");
    expect(text).toContain("100–150 kg — 1");
    expect(text).toContain("839 Kč");
    expect(text).toContain("Objednávky nad 150 kg");
    expect(text).toContain("Doručujeme jen v České republice.");
    expect(text).not.toMatch(/zdarma od|doprava zdarma/i);
    expect(JSON.stringify(shippingPageFor("flat").blocks)).not.toContain("Ceník chlazené přepravy");
  });
});

// Skutečný kód aplikace přes ovladač Neonu nad PGlite (katalog jako v
// Production + skript 41): katalog → pokladna → zápis objednávky.
describe("uložená objednávka = cena dopravy spočtená serverem", { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  beforeAll(async () => {
    process.env.E2E_CATALOG_SQL = CATALOG.join(",");
    process.env.E2E_WEIGHTS = "1";
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
  }, 120_000);

  it("6× 3 l + 1× 750 g = 18,75 kg → orders.shipping_kc = 379, celkem = zboží + 379", async () => {
    const { saveEshopOrder } = await import("../orderWrite");
    const index = createCatalogIndex(await loadCatalog(db, { weights: true }));
    const checkout = validateCheckoutInput(
      {
        cart: JSON.stringify([{ sku: "kulajda", quantity: 6 }, { sku: "lipovy-sirup-750ml", quantity: 1 }]),
        name: "Jana Nováková",
        email: "jana@example.cz",
        phone: "+420 777 123 456",
        shippingMethodId: "rozvoz",
        paymentMethodId: "prevod",
        street: "Prvního pluku 14",
        city: "Praha",
        zip: "18600",
        note: "",
        termsAccepted: true,
        ageConfirmed: true,
      },
      index,
      { shippingMode: "weight" }
    );
    if (!checkout.ok) throw new Error(checkout.error);
    const orderId = "5f1c2b7e-8a0d-4c3e-9b1a-2d6e4f8a0c11";
    const saved = await saveEshopOrder(db, orderId, checkout.value);
    expect(saved).toMatchObject({ ok: true });
    const { rows } = await db.execute(
      sql`SELECT subtotal_kc, shipping_kc, total_kc, shipping_method_code FROM orders WHERE id = ${orderId}`
    );
    const subtotal = checkout.value.pricedCart.subtotalKc;
    expect(rows).toEqual([{ subtotal_kc: subtotal, shipping_kc: 379, total_kc: subtotal + 379, shipping_method_code: "rozvoz" }]);
    // to, co zákazník viděl v pokladně, je přesně to, co je uložené
    const shown = displayedShipping(index, [{ sku: "kulajda", quantity: 6 }, { sku: "lipovy-sirup-750ml", quantity: 1 }], "rozvoz");
    expect(shown).toEqual({ shippingKc: rows[0].shipping_kc, totalKc: rows[0].total_kc });
  });
});
