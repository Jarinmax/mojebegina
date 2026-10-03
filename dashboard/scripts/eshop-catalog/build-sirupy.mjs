// ESHOP 1.0 — generuje docs/eshop-catalog/31_sirupy.sql z dat níže.
// Texty doslova z begina.cz (snímky dodané vedením 3. 10. 2026). Co na
// begina.cz u produktu není, zůstává null → na webu „Doplníme“.
//
//   node scripts/eshop-catalog/build-sirupy.mjs   (přepíše 31_sirupy.sql)
// Test lib/eshop/__tests__/catalogSirupy.test.ts hlídá, že soubor = výstup.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CATEGORY = {
  intro: [
    "Bylinné sirupy Begina připravujeme řemeslně z mimořádně silných výluhů a čisté filtrované vody, která nechává vyniknout přirozenou chuť každé ingredience. Jako český výrobce klademe důraz na čistotu složení – naše sirupy jsou bez umělých aromat, barviv a zbytečných konzervantů.",
    "Každá receptura je navržena tak, aby chutě harmonicky vynikly v domácích limonádách, horkých nápojích i při dalším použití v kuchyni a zachovaly si svou plnost, svěžest a jedinečný charakter.",
    "Pro dokonalý zážitek doporučujeme naše zlaté pravidlo ředění 1:10, se kterým si vytvoříte poctivý domácí drink s duší přírody.",
  ],
  // Společné pro všechny sirupy (zobrazí se na detailu každého z nich).
  detailSections: [
    {
      title: "Vhodné také pro gastro provozy a kanceláře",
      paragraphs: [
        "Sirupy Begina jsou praktické řešení pro:",
        "Stačí zalít horkou nebo studenou perlivou vodou. Díky bag-in-box balení lze sirup jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu.",
      ],
      bullets: ["kavárny", "bistra", "menší restaurace", "kanceláře", "catering"],
    },
  ],
};

// Balení — stejná u všech sirupů (cena 3 l podle produktu).
export const VARIANTS = [
  {
    suffix: "3l",
    label: "3 l Rodinná zásoba (bag-in-box)",
    note: "Až 150 nápojů",
    description:
      "Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.",
    volumeMl: 3000,
    servings: 150,
    price: (product) => product.price3l,
  },
  {
    suffix: "750ml",
    label: "750 ml Praktické balení",
    note: "Až 37 nápojů",
    description: "Lehké a nerozbitné balení vhodné na cesty, do práce nebo pro menší spotřebu.",
    volumeMl: 750,
    servings: 37,
    price: () => 199,
  },
];

// Popis: "## Nadpis" = vlastní sekce, "- " = odrážka, "**…**" = tučně (lib/eshop/productDescription.ts).
const MIX = "**Stačí smíchat s vodou a během chvíle vznikne poctivá domácí limonáda nebo hřejivý bylinný nápoj.**";
const highlights = (extractPercent) => [
  `${extractPercent} % bylinného výluhu`,
  "z čisté filtrované vody",
  "bez umělých aromat a barviv",
  "až 150 nápojů z jednoho balení",
];
const shortDescription = (pricePerDrink) =>
  `Až 150 nápojů z jednoho balení (při doporučeném ředění 1:10). 200 ml nápoje při 3l balení vyjde přibližně na ${pricePerDrink} Kč.`;

const EMPTY = {
  shortDescription: null,
  highlights: [],
  description: [],
  taste: null,
  ingredients: null,
  nutrition: null,
  storage: null,
};

// Pořadí jako na begina.cz/kategorie-produktu/sirupy.
export const SYRUPS = [
  {
    ...EMPTY,
    slug: "bylinny-sirup-saman",
    name: "Bylinný sirup Šaman",
    price3l: 549,
    shortDescription: shortDescription("3,70"),
    highlights: highlights(40),
    description: [
      "Bylinný sirup Šaman je výrazný sirup s hlubokým a soustředěným charakterem. Základ tvoří šípek, který doplňují čaga a ženšen, zatímco zázvor dodává chuti jemný kořeněný tón. Výsledkem je vyvážená a kultivovaná chuť s dlouhým dozvukem.",
      MIX,
      "Připravujeme jej z mimořádně silného bylinného výluhu (40 %), kvalitního třtinového cukru a čisté filtrované vody.",
    ],
  },
  {
    ...EMPTY,
    slug: "zazvorovy-sirup",
    name: "Zázvorový sirup",
    price3l: 499,
    shortDescription: shortDescription("3,30"),
    highlights: highlights(39),
    description: [
      "Zázvorový sirup je poctivý sirup s intenzivním řízem a hřejivým charakterem. Tento tradiční sirup v sobě nese sílu přírody a výraznou chuť zázvoru. Vyniká přirozeně kořenitou chutí a svěžím dozvukem.",
      MIX,
      "Připravujeme jej z mimořádně silného bylinného výluhu (39 %), kvalitního třtinového cukru a čisté filtrované vody.",
      "## Pro koho je vhodný",
      "- **Pro milovníky výrazných chutí:** ideální pro ty, kteří mají rádi přirozeně kořenité nápoje.",
      "- **Pro domácí přípravu nápojů:** skvělý základ pro poctivé domácí limonády i hřejivé nápoje.",
      "- **Pro gastro provozy:** kvalitní a ekonomický základ pro prémiové domácí nápoje.",
      "## Jak sirup používat",
      "- **Osvěžující domácí limonáda:** smíchejte s perlivou vodou, ledem a plátkem citronu.",
      "- **Hřejivý nápoj:** přidejte do horké vody pro příjemně kořenitý nápoj.",
      "- **V kuchyni:** skvěle dochutí čaje, dezerty nebo jogurt s ovocem.",
      "**Zlaté pravidlo Beginy:** doporučený poměr je **1:10**",
      "Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.",
    ],
    taste:
      "Chuť je intenzivní, přímá a autenticky pálivá, přesně tak, jak to od poctivého zázvoru čekáte. Má plné a výrazné tělo, které v nápoji zůstává krásně čitelné až do posledního doušku. Působí svěže, s jemně zemitým závěrem, který příjemně zahřeje v horkém nápoji a osvěží v ledové limonádě.",
    ingredients:
      "třtinový cukr, bylinný výluh 39 % (čistá filtrovaná voda, zázvor (Zingiber officinale)), citronová šťáva 12 %, antioxidant: kyselina askorbová (vitamin C)",
    nutrition: { energy_kj: 1105, energy_kcal: 260, fat: 0, saturates: 0, carbohydrate: 65, sugars: 64, protein: 0, salt: 0 },
    storage:
      "Skladujte v suchu a temnu při teplotě do 25 °C. Po otevření uchovávejte v chladu a dobře uzavřeném obalu a spotřebujte do 3 měsíců od otevření. Před použitím protřepejte. Případný sediment je přirozenou součástí bylinného výluhu.",
  },
  {
    ...EMPTY,
    slug: "lipovy-sirup",
    name: "Lipový sirup",
    price3l: 549,
    shortDescription: shortDescription("3,70"),
    highlights: highlights(39),
    description: [
      "Lipový sirup nabízí jemnou, medovou a uklidňující chuť v každé kapce. Tato zlatavá radost v sobě nese klid letního podvečera a poctivost tradičního bylinkářství.",
      MIX,
      "Připravujeme jej z mimořádně silného bylinného výluhu (39 %), kvalitního třtinového cukru a čisté filtrované vody.",
      "## Pro koho je vhodný",
      "- **Pro děti i dospělé:** díky své jemnosti a přirozeně nasládlému profilu chutná celé rodině.",
      "- **Pro chvíle relaxace:** ideální součást Vašeho rituálu pro zpomalení a pohodu po náročném dni.",
      "- **Pro tvořivé barmany:** skvělý základ pro originální domácí limonády.",
      "## Jak sirup používat",
      "- **Osvěžující domácí limonáda:** smíchejte s perlivou vodou, ledem a snítkou máty.",
      "- **Hřejivý nápoj:** přidejte do horké vody pro chvíle pohody a zahřátí.",
      "**Zlaté pravidlo Beginy:** doporučený poměr je **1:10**",
      "Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.",
    ],
    taste:
      "Chuť je hluboká, medově jemná a přirozeně harmonická. Lípa je tradiční bylinka s konejšivým charakterem, která v nápojích působí velmi lehce a zanechá hebký pocit na patře.",
    ingredients:
      "třtinový cukr, bylinný výluh 39 % (čistá filtrovaná voda, lipový květ (Tiliae flos)), citronová šťáva 12 %, antioxidant: kyselina askorbová (vitamin C)",
    nutrition: { energy_kj: 1105, energy_kcal: 260, fat: 0, saturates: 0, carbohydrate: 65, sugars: 64, protein: 0, salt: 0 },
    storage:
      "Skladujte v suchu a temnu při teplotě do 25 °C. Po otevření uchovávejte v dobře uzavřeném obalu v chladu a temnu a spotřebujte do 3 měsíců. Před použitím protřepejte. Případný sediment je přirozenou součástí bylinného výluhu.",
  },
  { ...EMPTY, slug: "ibiskovy-sirup", name: "Ibiškový sirup", price3l: 499 },
  { ...EMPTY, slug: "sipkovy-sirup", name: "Šípkový sirup", price3l: 499 },
  { ...EMPTY, slug: "hermankovy-sirup", name: "Heřmánkový sirup", price3l: 549 },
  { ...EMPTY, slug: "medunkovy-sirup-s-levanduli", name: "Meduňkový sirup s levandulí", price3l: 549 },
];

const q = (s) => (s === null ? "NULL" : `'${String(s).replaceAll("'", "''")}'`);
const arr = (xs) => (xs.length ? `ARRAY[${xs.map(q).join(", ")}]::text[]` : "'{}'::text[]");
const json = (v) => (v === null ? "NULL" : `${q(JSON.stringify(v))}::jsonb`);

export function sirupySql() {
  const out = [];
  const w = (s) => out.push(s);
  w(`-- ESHOP 1.0 — katalog: Bylinné sirupy (7 produktů, 14 balení, 7 fotek),
-- text kategorie a společná sekce detailu. VYGENEROVÁNO skriptem
-- scripts/eshop-catalog/build-sirupy.mjs — ručně neupravovat.
-- Texty z begina.cz (dodané vedením 3. 10. 2026). Úplné údaje zatím:
-- Šaman (popis), Zázvorový (popis, chuť, složení, výživa, skladování),
-- Lipový (popis, chuť, složení, výživa, skladování);
-- ostatní jen název, fotka, balení. Chybějící = „Doplníme“.
--
-- Spouští vedení v Neon SQL Editoru CELÝ soubor najednou (jedna
-- transakce: chyba = nic se nezmění). Idempotentní — opakované spuštění
-- nic nezdvojí, jen přepíše texty na aktuální. Kontrola před:
-- 30_sirupy_before.sql, po: 32_sirupy_after.sql. Fotky jsou v kódu
-- (public/eshop/<slug>.jpg).
BEGIN;
`);
  w(`UPDATE "product_categories" SET "intro" = ${arr(CATEGORY.intro)},
  "detail_sections" = ${json(CATEGORY.detailSections)}, "updated_at" = now()
WHERE "slug" = 'sirupy';
`);
  SYRUPS.forEach((p, i) => {
    w(`INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), ${q(p.slug)}, ${q(p.name)},
  ${q(p.shortDescription)}, ${arr(p.description)}, ${arr(p.highlights)},
  ${q(p.taste)}, ${q(p.ingredients)}, ${json(p.nutrition)}, ${p.nutrition ? "'100ml'" : "NULL"}, ${q(p.storage)}, ${(i + 1) * 10})
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();
`);
    VARIANTS.forEach((v, j) => {
      w(`INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = ${q(p.slug)}), ${q(`${p.slug}-${v.suffix}`)}, ${q(v.label)}, ${q(v.note)},
  ${q(v.description)}, ${v.volumeMl}, ${v.servings}, ${v.price(p)}, ${(j + 1) * 10})
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();
`);
    });
    const url = `/eshop/${p.slug}.jpg`;
    w(`INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", ${q(url)}, ${q(p.name)}, 0 FROM "products" WHERE "slug" = ${q(p.slug)}
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = ${q(p.slug)} AND pi."url" = ${q(url)});
`);
  });
  w("COMMIT;\n");
  return out.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = join(dirname(fileURLToPath(import.meta.url)), "../../docs/eshop-catalog/31_sirupy.sql");
  writeFileSync(target, sirupySql());
  console.log(`zapsáno ${target}`);
}
