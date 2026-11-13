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
import { categorySql, productSql, q, variantSql } from "./sql.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// Text kategorie dodal Jarin 10. 11. 2026 (doslova). „Bez lepku“, „bez barviv“
// ani „bez přidaného glutamátu“ tu záměrně nejsou — viz
// docs/eshop-production/ALERGENY_TVRZENI_POSOUZENI.md.
export const CATEGORY = {
  intro: [
    "Čerstvé polévky Begina vaříme z čisté filtrované vody, zeleniny, hub, bylinek a koření. Všechny připravujeme z rostlinných surovin, bez masa a mléčných výrobků. Každá receptura má svou vlastní chuť — od jemných zeleninových krémů po výraznou gulášovou z hlívy ústřičné.",
    "Dobrou polévku si můžete dopřát i ve dnech, kdy na vaření nezbývá čas. Stačí ohřát a podávat doma, v práci nebo u společného stolu.",
    "Z třílitrového balení s kohoutkem odeberete právě tolik, kolik potřebujete. Zbytek uložíte do chladničky a další porci máte po ruce. Méně času u plotny, více času pro Vás.",
  ],
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

// Fotografie (od 10. 11. 2026, bílý podklad, public/eshop/polevky/):
// 1. miska se surovinami = hlavní fotka (katalog, sdílení), 2. sáček
// s kohoutkem. Původní tmavé fotky s krabicí (public/eshop/<slug>.jpg)
// zůstávají v kódu, jen se už nezobrazují.
export const soupPhotos = (soup) => [
  { url: `/eshop/polevky/${soup.slug}-miska.jpg`, alt: soup.name },
  { url: `/eshop/polevky/${soup.slug}-sacek.jpg`, alt: `${soup.name} v balení s kohoutkem` },
];
// obecná fotka kategorie = hlavní fotka Dýňové polévky
export const CATEGORY_IMAGE = "/eshop/polevky/dynova-polevka-miska.jpg";

function soupPhotosSql(soup) {
  const photos = soupPhotos(soup);
  const product = `(SELECT "id" FROM "products" WHERE "slug" = ${q(soup.slug)})`;
  return [
    `DELETE FROM "product_images" WHERE "product_id" = ${product} AND "url" NOT IN (${photos.map((ph) => q(ph.url)).join(", ")});`,
    ...photos.map(
      (ph, i) => `INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT ${product}, ${q(ph.url)}, ${q(ph.alt)}, ${i}
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = ${product} AND "url" = ${q(ph.url)});
UPDATE "product_images" SET "alt" = ${q(ph.alt)}, "sort_order" = ${i} WHERE "product_id" = ${product} AND "url" = ${q(ph.url)};`
    ),
    "",
  ].join("\n");
}

// Balení 3 l — SKU je u polévek stejné jako slug (z migrace 0014), aby se
// přepsalo stávající balení a objednávky na něj dál odkazovaly.
const bagInBox = (slug, price, servings) => ({
  sku: slug,
  label: "3 l", // od 9. 11. 2026 jen objem (lib/eshop/packageLabel.ts)
  note: "Rodinné balení vhodné na několik obědů nebo večeří.",
  description:
    "3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete.", // lib/eshop/packaging.ts
  volumeMl: 3000,
  servings,
  price,
});

// Údaje vedení 3. 10. 2026: v recepturách není žádná ze složek přílohy II
// nařízení 1169/2011 (allergens: [] = řádek Alergeny se nezobrazí; žádné
// veřejné „bez alergenů“). Kontaminace lepkem u lahůdkového droždí — viz
// docs/eshop-production/ALERGENY_TVRZENI_POSOUZENI.md. Skladování
// a trvanlivost podle majitele 9. 11. 2026 (lib/eshop/soupFoodInfo.ts).
const SOUP_COMMON = {
  allergens: [],
  shelfLifeDays: 14,
  shelfLifeNote: "Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.",
};

// Texty popisu a chuti od 14. 11. 2026 schválila Lucie (bez „domácí“, bez opakování
// filtrované vody; tipy na podávání jsou doporučení). Produkce: skript 106.
// Popis: "## Nadpis" = vlastní sekce, "- " = odrážka, "**…**" = tučně (lib/eshop/productDescription.ts).
// Pořadí (sortOrder) jako v migraci 0014: Dýňová 10, Kulajda 20, Rajčatová (od 9. 11. 2026 Tomatová) 30.
export const SOUPS = [
  {
    ...SOUP_COMMON,
    slug: "dynova-polevka",
    name: "Dýňová polévka",
    sortOrder: 10,
    shortDescription: "Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.",
    highlights: ["rostlinná receptura", "z čisté filtrované vody"],
    description: [
      "Naše nejprodávanější polévka. Dýně je v ní 41 % a kokosové mléko ji zjemňuje. Zázvor, chilli, muškátový oříšek a hřebíček jí dodávají výraznou, zajímavou chuť.",
      "**Natočte si z kohoutku, ohřejte a je hotovo.**",
      "## Pro koho je vhodná",
      "- pro ty, kdo chtějí dýňovou s charakterem",
      "- pro vegany a vegetariány",
      "- na rychlý oběd doma i v práci",
    ],
    taste:
      "Krémová a plná, s kořeněným dozvukem, který příjemně prohřeje. Tip: opražená dýňová semínka nebo kapka dýňového oleje.",
    ingredients:
      "dýně 41 %, čistá filtrovaná voda, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), brambory 10 %, cibule 5 %, kořen petržele, olivový olej, dýňový olej, mořská sůl, třtinový cukr, grapefruitová šťáva, lahůdkové droždí, sušený mletý zázvor, chilli, muškátový oříšek, hřebíček, antioxidant: kyselina askorbová (vitamin C), přírodní aroma",
    // Výživa od 10. 11. 2026 (INTERNĚ, nezobrazovat): výpočtový odhad podle
    // receptury (Polevky_kalkulace(3).xlsx, čistá hmotnost 3 l = 2 855 g) a
    // dodavatelských/databázových údajů; dýně = zástupný profil Hokkaido,
    // poměr druhů dýní není stanoven. Vláknina výpočtem nepotvrzena → neuvádí se.
    nutrition: { energy_kj: 250, energy_kcal: 60, fat: 3.9, saturates: 2.5, carbohydrate: 4.7, sugars: 3.1, protein: 1.0, salt: 0.78 },
    storage:
      "Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.",
    warnings: [],
    variants: [bagInBox("dynova-polevka", 379, 12)],
  },
  {
    ...SOUP_COMMON,
    slug: "kulajda",
    name: "Kulajda",
    sortOrder: 20,
    shortDescription: "Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.",
    highlights: ["rostlinná receptura", "z čisté filtrované vody"],
    description: [
      "Krémová kulajda plná brambor a žampionů, provoněná koprem.",
      "**Natočte si z kohoutku, ohřejte a je hotovo.**",
      "## Pro koho je vhodná",
      "- pro milovníky kulajdy",
      "- pro vegany a vegetariány",
      "- na rychlý oběd doma i v práci",
    ],
    taste:
      "Hebká a sytá. Voní po houbách a kopru, česnek a kmín ji doladí. Tip: čerstvý chléb.",
    ingredients:
      "čistá filtrovaná voda, brambory 22 %, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), žampiony 7 %, cibule 5 %, olivový olej, dýňový olej, mořská sůl, kopr, česnek, kmín, lahůdkové droždí, antioxidant: kyselina askorbová (vitamin C)",
    // Výživa od 10. 11. 2026 (INTERNĚ, nezobrazovat): výpočtové průměrné hodnoty
    // podle receptury na 3 l (čistá hmotnost 2 915 g), Polevky_kalkulace(2).xlsx,
    // u olejů průměrné hodnoty. Vláknina neověřená → neuvádí se.
    nutrition: { energy_kj: 219, energy_kcal: 53, fat: 3.5, saturates: 2.4, carbohydrate: 3.9, sugars: 0.8, protein: 1.0, salt: 0.76 },
    storage:
      "Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.",
    warnings: [],
    variants: [bagInBox("kulajda", 379, 12)],
  },
  {
    ...SOUP_COMMON,
    slug: "rajcatova-polevka", // adresa a SKU beze změny (QR kódy, odkazy); název od 9. 11. 2026 Tomatová
    name: "Tomatová polévka",
    sortOrder: 30,
    shortDescription: "Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.",
    highlights: ["rostlinná receptura", "z čisté filtrované vody"],
    description: [
      "Poctivá rajská, ve které je rajčat přes třetinu. Kokosové mléko ji zjemní, libeček, kardamom a hřebíček jí dávají vlastní vůni.",
      "**Natočte si z kohoutku, ohřejte a je hotovo.**",
      "## Pro koho je vhodná",
      "- pro milovníky rajské",
      "- pro vegany a vegetariány",
      "- na rychlý oběd doma i v práci",
    ],
    taste:
      "Výrazně rajčatová, lehce nasládlá, s kořeněnou vůní. Tip: krutony, rýže nebo čerstvá bazalka.",
    ingredients:
      "čistá filtrovaná voda, pasírovaná rajčata 27 % (rajčata 99,9 %, regulátor kyselosti: kyselina citronová), rajčatový protlak 7 % (rajčatový protlak, jedlá sůl 1 %), brambory 7 %, kokosové mléko 6 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), cibule 5 %, kořen petržele, olivový olej, třtinový cukr, mořská sůl, česnek, libeček, černý pepř, kardamom, hřebíček, antioxidant: kyselina askorbová (vitamin C), přírodní aroma",
    // Výživa od 10. 11. 2026 (INTERNĚ, nezobrazovat): výpočtové průměrné hodnoty
    // podle receptury na 3 l (čistá hmotnost 3 015 g; kokosové mléko 200 ml =
    // 181 g podle vážení), Polevky_kalkulace(2).xlsx, u olejů průměrné hodnoty.
    // Vláknina neověřená → neuvádí se. „Přírodní aroma“: chybí specifikace výrobku.
    nutrition: { energy_kj: 229, energy_kcal: 54, fat: 2.9, saturates: 1.3, carbohydrate: 5.5, sugars: 4.4, protein: 1.2, salt: 0.86 },
    storage:
      "Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.",
    warnings: [],
    variants: [bagInBox("rajcatova-polevka", 379, 12)],
  },
  {
    ...SOUP_COMMON,
    slug: "rajcatova-polevka-s-cervenou-repou",
    name: "Rajčatová polévka s červenou řepou",
    sortOrder: 35,
    shortDescription: "Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.",
    highlights: ["rostlinná receptura", "z čisté filtrované vody"],
    description: [
      "Jemná rajčatová polévka, které červená řepa dává sladší chuť a sytou barvu. Brambory a kokosové mléko ji dělají krémovou.",
      "**Natočte si z kohoutku, ohřejte a je hotovo.**",
      "## Pro koho je vhodná",
      "- pro ty, kdo mají rádi jemné krémové polévky",
      "- pro vegany a vegetariány",
      "- na rychlý oběd doma i v práci",
    ],
    taste:
      "Hladká a krémová, jemnější a kulatější než klasická rajská.",
    ingredients:
      "čistá filtrovaná voda, pasírovaná rajčata 17 % (rajčata 99,9 %, regulátor kyselosti: kyselina citronová), brambory 14 %, kokosové mléko 12 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), červená řepa 9 %, cibule 5 %, rajčatový protlak 3 % (rajčatový protlak, jedlá sůl 1 %), kořen petržele, olivový olej, mořská sůl, třtinový cukr, antioxidant: kyselina askorbová (vitamin C), přírodní aroma",
    // Výživa od 10. 11. 2026 (INTERNĚ, nezobrazovat): výpočtový průměr z receptury
    // (Polevky_kalkulace(3).xlsx, čistá hmotnost 3 l = 2 940 g; kokosové mléko
    // 400 ml = 359 g podle vážení), dodavatelských údajů a databází; na 100 ml.
    // Vláknina výpočtem nepotvrzena → neuvádí se.
    nutrition: { energy_kj: 219, energy_kcal: 52, fat: 2.8, saturates: 2.1, carbohydrate: 5.1, sugars: 3.1, protein: 1.1, salt: 0.84 },
    storage:
      "Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.",
    warnings: [],
    variants: [bagInBox("rajcatova-polevka-s-cervenou-repou", 379, 12)],
  },
  {
    ...SOUP_COMMON,
    slug: "gulasova-polevka-z-hlivy-ustricne",
    name: "Gulášová polévka z hlívy ústřičné",
    sortOrder: 40,
    shortDescription: "Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.",
    highlights: ["rostlinná receptura", "z čisté filtrované vody"],
    description: [
      "Sytá, lehce pikantní gulášová polévka. Plnou chuť jí dává hlíva ústřičná, uzená paprika, majoránka a kmín.",
      "**Natočte si z kohoutku, ohřejte a je hotovo.**",
      "## Pro koho je vhodná",
      "- pro ty, kdo chtějí gulášovou bez masa",
      "- pro vegany a vegetariány",
      "- když chcete polévku, která zasytí",
    ],
    taste:
      "Výrazná a lehce pikantní, voní po uzené paprice, česneku a majoránce. Zahřeje a zasytí. Tip: čerstvý chléb.",
    ingredients:
      "čistá filtrovaná voda, brambory 19 %, hlíva ústřičná (Pleurotus ostreatus) 7 %, cibule 4 %, rajčatový protlak 3 % (rajčatový protlak, jedlá sůl 1 %), mořská sůl, dýňový olej, česnek, olivový olej, majoránka, kmín, lahůdkové droždí, uzená paprika, sladká paprika, chilli, černý pepř, antioxidant: kyselina askorbová (vitamin C), skořice",
    // Výživa od 10. 11. 2026 (INTERNĚ, nezobrazovat): výpočtový průměr podle receptury
    // (Polevky_kalkulace(3).xlsx, čistá hmotnost 3 l = 2 963 g, mořská sůl 23 g, voda doplněna na 3 l), dodavatelských údajů
    // a databází, u koření i zástupné hodnoty; na 100 ml (3 l). Vláknina nepotvrzena.
    nutrition: { energy_kj: 125, energy_kcal: 30, fat: 0.9, saturates: 0.1, carbohydrate: 4.0, sugars: 1.1, protein: 0.9, salt: 0.82 },
    storage:
      "Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.",
    warnings: [],
    variants: [bagInBox("gulasova-polevka-z-hlivy-ustricne", 379, 12)],
  },
  {
    ...SOUP_COMMON,
    slug: "spenatova-polevka",
    name: "Špenátová polévka",
    sortOrder: 50,
    shortDescription: "Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.",
    highlights: ["rostlinná receptura", "z čisté filtrované vody"],
    description: [
      "Lahodná špenátová polévka s bramborami a kokosovým mlékem, dochucená česnekem a majoránkou.",
      "**Natočte si z kohoutku, ohřejte a je hotovo.**",
      "## Pro koho je vhodná",
      "- pro milovníky špenátu s česnekem",
      "- pro vegany a vegetariány",
      "- na rychlý oběd doma i v práci",
    ],
    taste:
      "Krémová a špenátová, s česnekem v pozadí. Tip: krutony.",
    ingredients:
      "čistá filtrovaná voda, špenát 17 %, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), brambory 14 %, cibule 4 %, olivový olej, dýňový olej, mořská sůl, česnek, majoránka, kmín, antioxidant: kyselina askorbová (vitamin C)",
    // Výživa od 10. 11. 2026 (INTERNĚ, nezobrazovat): výpočtové průměrné hodnoty
    // podle receptury na 3 l ze souboru Polevky_kalkulace(2).xlsx, u olejů
    // průměrné hodnoty. Vláknina v podkladu není → neuvádí se.
    nutrition: { energy_kj: 199, energy_kcal: 48, fat: 3.4, saturates: 2.4, carbohydrate: 2.7, sugars: 0.7, protein: 1.1, salt: 0.76 },
    storage:
      "Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.",
    warnings: [],
    variants: [bagInBox("spenatova-polevka", 379, 12)],
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
-- (vč. vlákniny), skladování; alergeny (žádné) a trvanlivost 14 dnů od vedení.
-- Ostatní polévky zůstávají, jak jsou (doplní se, až budou podklady).
--
-- Spouští vedení v Neon SQL Editoru CELÝ soubor najednou (jedna
-- transakce: chyba = nic se nezmění). Idempotentní — opakované spuštění
-- nic nezdvojí, jen přepíše texty na aktuální. Kontrola před:
-- 40_polevky_before.sql, po: 42_polevky_after.sql. Fotky jsou v kódu
-- (public/eshop/polevky/<slug>-miska.jpg a -sacek.jpg). Vrácení: 49_polevky_rollback.sql.
BEGIN;
`);
  w(categorySql("polevky", CATEGORY));
  for (const soup of SOUPS) {
    w(productSql(soup, "polevky", soup.sortOrder));
    soup.variants.forEach((v, j) => w(variantSql(soup.slug, v, (j + 1) * 10)));
    if (soup.photo !== false) w(soupPhotosSql(soup));
  }
  w(`UPDATE "product_categories" SET "image_url" = ${q(CATEGORY_IMAGE)}, "updated_at" = now() WHERE "slug" = 'polevky';\n`);
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
UPDATE "products" SET "nutrition" = NULL, "nutrition_basis" = NULL, "allergens" = NULL, "shelf_life_days" = NULL, "updated_at" = now()
WHERE "slug" IN (${list});

DELETE FROM "product_images" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" IN (${list}))
  AND "url" IN (${SOUPS.flatMap((s) => [`/eshop/${s.slug}.jpg`, ...soupPhotos(s).map((ph) => ph.url)]).map(q).join(", ")});
UPDATE "product_categories" SET "image_url" = '/eshop/kategorie-polevky.jpg', "updated_at" = now() WHERE "slug" = 'polevky';

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
