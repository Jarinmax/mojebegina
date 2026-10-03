// ESHOP 1.0 — generuje docs/eshop-catalog/41_polevky.sql (katalog) a
// 49_polevky_rollback.sql (návrat polévek do stavu z migrace 0014).
// Texty doslova z begina.cz (snímky dodané vedením 3. 10. 2026). Co na
// begina.cz u produktu není, zůstává null → na webu „Doplníme“.
//
//   node scripts/eshop-catalog/build-polevky.mjs
// Test lib/eshop/__tests__/catalogPolevky.test.ts hlídá, že soubory = výstup.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { categorySql, imageSql, productSql, q, variantSql } from "./sql.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// Text kategorie (intro) zatím nedodán — zůstává beze změny.
export const CATEGORY = {
  detailSections: [
    {
      title: "Vhodné také pro gastro provozy a kanceláře",
      paragraphs: [
        "Polévky Begina jsou praktické řešení pro:",
        "Stačí ohřát a podávat. Díky bag-in-box balení lze polévku jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu.",
      ],
      bullets: ["kavárny", "bistra", "menší restaurace", "kanceláře", "catering"],
    },
  ],
};

// Balení 3 l — SKU je u polévek stejné jako slug (z migrace 0014), aby se
// přepsalo stávající balení a objednávky na něj dál odkazovaly.
const bagInBox = (slug, price, servings) => ({
  sku: slug,
  label: "3 l Rodinná zásoba (bag-in-box)",
  note: "Rodinné balení vhodné na několik obědů nebo večeří.",
  description:
    "Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.",
  volumeMl: 3000,
  servings,
  price,
});

// Popis: "## Nadpis" = vlastní sekce, "- " = odrážka, "**…**" = tučně (lib/eshop/productDescription.ts).
// Pořadí (sortOrder) jako v migraci 0014: Dýňová 10, Kulajda 20, Rajčatová 30.
export const SOUPS = [
  {
    slug: "dynova-polevka",
    name: "Dýňová polévka",
    sortOrder: 10,
    shortDescription: "Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.",
    highlights: ["rostlinná receptura", "přirozeně bezlepková", "z čisté filtrované vody"],
    description: [
      "Dýňová polévka s kokosovým mlékem stojí na plném a výrazném základu kvalitní dýně. Krémová struktura, jemnost kokosového mléka a pečlivě zvolené koření vytvářejí harmonickou chuť s přirozeně bohatým charakterem.",
      "**Poctivá domácí polévka, kterou máte v lednici vždy připravenou. Stačí ohřát a servírovat.**",
      "Připravujeme ji z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozené chuti jednotlivých ingrediencí.",
      "## Pro koho je vhodná",
      "- pro milovníky krémových zeleninových polévek",
      "- pro ty, kteří hledají veganskou (rostlinnou) polévku bez masa",
      "- pro rodiny, kanceláře i provozy, kde se počítá praktičnost",
      "- pro každého, kdo ocení kvalitní suroviny a čistou filtrovanou vodu",
    ],
    taste:
      "Základ tvoří kvalitní dýně, kterou doplňují brambory a pečlivě zvolené koření. Kokosové mléko zjemňuje strukturu a dodává krémovost. Chuť je vyvážená, plná a přirozeně harmonická.",
    ingredients:
      "čistá filtrovaná voda, dýně Hokkaido 39 %, kokosové mléko 15 % (kokosový extrakt 70 %, voda, emulgátor E435), brambory 9 %, cibule 4 %, olivový olej, dýňový olej, petržel kořen, mořská sůl, třtinový cukr, zázvor, lahůdkové droždí, grepová šťáva, chilli, muškátový oříšek, hřebíček, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C), přírodní aroma",
    nutrition: { energy_kj: 283, energy_kcal: 68, fat: 4.0, saturates: 2.7, carbohydrate: 7.6, sugars: 2.0, protein: 1.0, salt: 0.8, fibre: 1.1 },
    storage:
      "Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.",
    warnings: [],
    variants: [bagInBox("dynova-polevka", 379, 12)],
  },
  {
    slug: "gulasova-polevka-z-hlivy-ustricne",
    name: "Gulášová polévka z hlívy ústřičné",
    sortOrder: 40,
    photo: false, // fotka zatím chybí (na snímku z webu zakrytá ikonou lupy)
    shortDescription: "Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.",
    highlights: ["rostlinná receptura", "přirozeně bezlepková", "z čisté filtrované vody"],
    description: [
      "Gulášová polévka z hlívy ústřičné nabízí výraznou a plnou chuť. Hlíva dodává pevnou strukturu, rajčatový základ hloubku a uzená paprika charakteristickou intenzitu.",
      "**Poctivá domácí polévka, kterou máte v lednici vždy připravenou. Stačí ohřát a servírovat.**",
      "Připravujeme ji z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozené chuti jednotlivých ingrediencí.",
      "## Pro koho je vhodná",
      "- pro milovníky výrazných a sytějších chutí",
      "- pro ty, kteří hledají gulášovou polévku bez masa",
      "- pro rodiny, kanceláře i provozy, kde se počítá praktičnost",
      "- pro vegany i vegetariány",
      "- pro každého, kdo ocení kvalitní suroviny a čistou filtrovanou vodu",
    ],
    taste:
      "Má plnou a sytou chuť s výrazem uzené papriky a rajčatového základu. Hlíva ústřičná dodává přirozenou strukturu a vytváří harmonický celek. Chuť je koncentrovaná, vyvážená a příjemně zahřívací.",
    ingredients:
      "čistá filtrovaná voda, brambory 22 %, hlíva ústřičná (Pleurotus ostreatus) 8 %, cibule 5 %, rajčatový protlak 4 %, mořská sůl, dýňový olej, česnek, olivový olej, majoránka, kmín, lahůdkové droždí, paprika uzená, paprika sladká, chilli, pepř černý, skořice",
    nutrition: { energy_kj: 149, energy_kcal: 36, fat: 0.7, saturates: 0.1, carbohydrate: 5.4, sugars: 1.7, protein: 1.2, salt: 0.8, fibre: 1.1 },
    storage:
      "Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.",
    warnings: [],
    variants: [bagInBox("gulasova-polevka-z-hlivy-ustricne", 379, 12)],
  },
];

export function polevkySql() {
  const out = [];
  const w = (s) => out.push(s);
  w(`-- ESHOP 1.0 — katalog: Čerstvé polévky (${SOUPS.map((s) => s.name).join(", ")})
-- a společná sekce detailu polévek. VYGENEROVÁNO skriptem
-- scripts/eshop-catalog/build-polevky.mjs — ručně neupravovat.
-- Texty doslova z begina.cz (produktové stránky dodané vedením 3. 10.
-- 2026): popis, chuť, pro koho, balení, složení, výživa na 100 ml
-- (vč. vlákniny), skladování. Alergeny a trvanlivost web neuvádí = „Doplníme“.
-- Ostatní polévky zůstávají, jak jsou (doplní se, až budou podklady).
--
-- Spouští vedení v Neon SQL Editoru CELÝ soubor najednou (jedna
-- transakce: chyba = nic se nezmění). Idempotentní — opakované spuštění
-- nic nezdvojí, jen přepíše texty na aktuální. Kontrola před:
-- 40_polevky_before.sql, po: 42_polevky_after.sql. Fotky jsou v kódu
-- (public/eshop/<slug>.jpg). Vrácení: 49_polevky_rollback.sql.
BEGIN;
`);
  w(categorySql("polevky", CATEGORY));
  for (const soup of SOUPS) {
    w(productSql(soup, "polevky", soup.sortOrder));
    soup.variants.forEach((v, j) => w(variantSql(soup.slug, v, (j + 1) * 10)));
    if (soup.photo !== false) w(imageSql(soup));
  }
  w("COMMIT;\n");
  return out.join("\n");
}

/** Vrácení: příkazy z migrace 0014 pro tyto polévky + smazání nově přidaných údajů. */
export function polevkyRollbackSql() {
  const seed = readFileSync(join(HERE, "../../drizzle/0014_eshop_1_0_products_seed.sql"), "utf8");
  const slugs = SOUPS.map((s) => s.slug);
  const isSeeded = (slug) => seed.includes(`'${slug}'`);
  const added = slugs.filter((slug) => !isSeeded(slug));
  const fromSeed = seed
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => /^INSERT INTO "(products|product_variants)"/.test(s) && slugs.some((slug) => s.includes(`'${slug}'`)));
  const list = slugs.map(q).join(", ");
  return `-- ESHOP 1.0 — vrácení 41_polevky.sql: polévky ${SOUPS.map((s) => s.name).join(", ")}
-- zpět do stavu z migrace 0014 (krátký popis, balení bez názvu, cena), bez
-- nových textů, výživy a fotky; nově přidané polévky se skryjí; společná
-- sekce kategorie se odebere. Nic
-- jiného se nemaže, objednávky zůstávají v pořádku. VYGENEROVÁNO skriptem
-- scripts/eshop-catalog/build-polevky.mjs. Opětovné spuštění 41 vše vrátí.
BEGIN;
${fromSeed.map((s) => `${s}\n`).join("\n")}
UPDATE "products" SET "nutrition" = NULL, "nutrition_basis" = NULL, "updated_at" = now()
WHERE "slug" IN (${list});

DELETE FROM "product_images" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" IN (${list}))
  AND "url" IN (${SOUPS.map((s) => q(`/eshop/${s.slug}.jpg`)).join(", ")});

${
  added.length
    ? `-- Polévky, které v migraci 0014 nejsou: jen skrýt (objednávky zůstanou v pořádku).
UPDATE "product_variants" SET "is_active" = false, "updated_at" = now()
WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" IN (${added.map(q).join(", ")}));
UPDATE "products" SET "is_active" = false, "updated_at" = now() WHERE "slug" IN (${added.map(q).join(", ")});

`
    : ""
}UPDATE "product_categories" SET "detail_sections" = NULL, "updated_at" = now() WHERE "slug" = 'polevky';
COMMIT;
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = join(HERE, "../../docs/eshop-catalog");
  writeFileSync(join(dir, "41_polevky.sql"), polevkySql());
  writeFileSync(join(dir, "49_polevky_rollback.sql"), polevkyRollbackSql());
  console.log("zapsáno 41_polevky.sql, 49_polevky_rollback.sql");
}
