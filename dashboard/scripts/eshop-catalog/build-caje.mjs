// ESHOP 1.0 — generuje docs/eshop-catalog/51_caje.sql (katalog) a
// 59_caje_rollback.sql (čaje skryje). Texty doslova z begina.cz (snímky
// dodané vedením 3. 10. 2026). Co na begina.cz u produktu není, zůstává
// null → na webu „Doplníme“.
//
//   node scripts/eshop-catalog/build-caje.mjs
// Test lib/eshop/__tests__/catalogCaje.test.ts hlídá, že soubory = výstup.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { categorySql, imageSql, productSql, q, variantSql } from "./sql.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// Text kategorie z begina.cz/kategorie-produktu/caje (snímek vedení 5. 10. 2026).
export const CATEGORY = {
  intro: [
    "Čaje Begina jsou hotové nápoje připravené z kvalitních bylin a pečlivě vybraných surovin na základě čisté filtrované vody.",
    "Každá receptura je navržena tak, aby nabízela plnou, vyváženou chuť bez nutnosti další úpravy. Stačí nalít, vychutnat horké nebo ledové a nechat vyniknout jejich přirozenou hloubku a harmonii.",
  ],
  detailSections: [
    {
      title: "Vhodné také pro gastro provozy a kanceláře",
      paragraphs: [
        "Čaje Begina jsou praktické řešení pro:",
        "Díky bag-in-box balení lze nápoj jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu.",
      ],
      bullets: ["kavárny", "bistra", "menší restaurace", "kanceláře", "catering"],
    },
  ],
};

const bagInBox = (slug, price, servings) => ({
  sku: `${slug}-3l`,
  label: "3 l Rodinná zásoba (bag-in-box)",
  note: "Ideální pro sdílení nebo více příležitostí.",
  description:
    "Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.",
  volumeMl: 3000,
  servings,
  price,
});

const STORAGE =
  "Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.";

// Údaje vedení 5. 10. 2026: čaje jsou bez alergenů, trvanlivost 2 měsíce
// při skladování v lednici do 4 °C.
const TEA_COMMON = {
  allergens: [],
  shelfLifeDays: 60,
  shelfLifeNote: "Do 2 měsíců při skladování v lednici do 4 °C.",
};

// Popis: "## Nadpis" = vlastní sekce, "- " = odrážka, "**…**" = tučně (lib/eshop/productDescription.ts).
export const TEAS = [
  {
    ...TEA_COMMON,
    slug: "bylinny-caj-saman",
    name: "Bylinný čaj Šaman",
    sortOrder: 10,
    shortDescription: "Až 12 nápojů (24,10 Kč za nápoj). Jeden nápoj = 250 ml.",
    highlights: ["z čisté filtrované vody", "bez umělých aromat a barviv", "hluboká, vyvážená chuť"],
    description: [
      "Bylinný čaj Šaman spojuje zemitou hloubku šípku a čagy s jemnou energií ženšenu a hřejivým tónem zázvoru. Výsledkem je harmonická, plná chuť s dlouhým dozvukem.",
      "Chuť působí klidně, vyrovnaně a soustředěně.",
      "**Prémiový bylinný čaj, který máte v lednici vždy připravený. Stačí ohřát nebo podávat vychlazený – ideálně ve sklenici s ledem.**",
      "Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.",
    ],
    taste:
      "Bylinný čaj Šaman má plnou, harmonickou chuť s výraznou hloubkou. V úvodu se objevuje jemná ovocnost šípku, která přechází do zemitých tónů čagy a ženšenu. Závěr doplňuje hřejivý nádech zázvoru, který chuť uzavírá do vyváženého, soustředěného celku.",
    ingredients:
      "čistá filtrovaná voda, třtinový cukr, citronová šťáva, šípek (Rosa canina), čaga (Inonotus obliquus), ženšen pravý (Panax ginseng), zázvor (Zingiber officinale), regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)",
    nutrition: { energy_kj: 98, energy_kcal: 23, fat: 0, saturates: 0, carbohydrate: 5.7, sugars: 5.7, protein: 0, salt: 0 },
    storage: STORAGE,
    warnings: ["Není vhodné pro děti do 3 let, těhotné a kojící ženy."],
    variants: [bagInBox("bylinny-caj-saman", 289, 12)],
  },
  {
    ...TEA_COMMON,
    slug: "zazvorovy-caj",
    name: "Zázvorový čaj",
    sortOrder: 20,
    shortDescription: "Až 12 nápojů (20,80 Kč za nápoj). Jeden nápoj = 250 ml.",
    highlights: ["z čisté filtrované vody", "bez umělých aromat a barviv", "výrazná, plná chuť"],
    description: [
      "Zázvorový čaj spojuje výraznou chuť zázvoru se svěžím nádechem citronu a jemně vyváženým profilem.",
      "Výsledkem je plná, čistá chuť s příjemně osvěžujícím dojmem.",
      "**Čaj, který máte v lednici vždy připravený. Stačí ohřát nebo podávat vychlazený – ideálně ve sklenici s ledem.**",
      "Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.",
    ],
    taste: "Výrazná chuť zázvoru se svěžím nádechem citronu působí vyváženě a příjemně zahřívajícím dojmem.",
    ingredients:
      "čistá filtrovaná voda, třtinový cukr, citronová šťáva, zázvor (Zingiber officinale), regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)",
    nutrition: { energy_kj: 94, energy_kcal: 22, fat: 0, saturates: 0, carbohydrate: 5.6, sugars: 5.6, protein: 0, salt: 0 },
    storage: STORAGE,
    warnings: [],
    variants: [bagInBox("zazvorovy-caj", 249, 12)],
  },
  {
    ...TEA_COMMON,
    slug: "lipovy-caj",
    name: "Lipový čaj",
    sortOrder: 30,
    photo: false, // fotka čeká (snímek poslaný během práce se neuložil)
    shortDescription: "Až 12 nápojů (21,60 Kč za nápoj). Jeden nápoj = 250 ml.",
    highlights: ["z čisté filtrované vody", "bez umělých aromat a barviv", "čistá, vyvážená chuť"],
    description: [
      "Lipový čaj přináší jemnou a harmonickou chuť lipového květu s lehce nasládlým charakterem a příjemně hladkým dozvukem. Výsledkem je plná, čistá chuť s jemným květinovým charakterem a přirozenou lehkostí.",
      "Chuť působí jemně, hladce a harmonicky.",
      "**Bylinný čaj, který máte v lednici vždy připravený. Stačí ohřát nebo podávat vychlazený – ideálně ve sklenici s ledem.**",
      "Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.",
    ],
    taste:
      "Lipový čaj má jemnou, hladkou chuť s lehce nasládlým charakterem a typickým květinovým nádechem. Chuť působí čistě, vyváženě a harmonicky.",
    ingredients:
      "čistá filtrovaná voda, třtinový cukr, citronová šťáva, lipový květ (Tiliae flos), regulátor kyselosti: kyselina citronová; antioxidant: kyselina askorbová (vitamin C)",
    nutrition: { energy_kj: 94, energy_kcal: 22, fat: 0, saturates: 0, carbohydrate: 5.6, sugars: 5.6, protein: 0, salt: 0 },
    storage: STORAGE,
    warnings: [],
    variants: [bagInBox("lipovy-caj", 259, 12)],
  },
];

export function cajeSql() {
  const out = [];
  const w = (s) => out.push(s);
  w(`-- ESHOP 1.0 — katalog: Čaje (${TEAS.map((t) => t.name).join(", ")})
-- a společná sekce detailu čajů. VYGENEROVÁNO skriptem
-- scripts/eshop-catalog/build-caje.mjs — ručně neupravovat.
-- Texty doslova z begina.cz (produktové stránky dodané vedením 3. 10.
-- 2026): popis, chuť, balení, složení, výživa na 100 ml, skladování,
-- upozornění; alergeny (žádné) a trvanlivost 2 měsíce od vedení.
--
-- Spouští vedení v Neon SQL Editoru CELÝ soubor najednou (jedna
-- transakce: chyba = nic se nezmění). Idempotentní — opakované spuštění
-- nic nezdvojí, jen přepíše texty na aktuální. Kontrola před:
-- 50_caje_before.sql, po: 52_caje_after.sql. Fotky jsou v kódu
-- (public/eshop/<slug>.jpg). Vrácení: 59_caje_rollback.sql.
BEGIN;
`);
  w(categorySql("caje", CATEGORY));
  for (const tea of TEAS) {
    w(productSql(tea, "caje", tea.sortOrder));
    tea.variants.forEach((v, j) => w(variantSql(tea.slug, v, (j + 1) * 10)));
    if (tea.photo !== false) w(imageSql(tea));
  }
  w("COMMIT;\n");
  return out.join("\n");
}

/** Vrácení: čaje z e-shopu zmizí (is_active = false), společná sekce se odebere. Nic se nemaže. */
export function cajeRollbackSql() {
  const list = TEAS.map((t) => q(t.slug)).join(", ");
  return `-- ESHOP 1.0 — vrácení 51_caje.sql: čaje ${TEAS.map((t) => t.name).join(", ")} z e-shopu
-- zmizí (is_active = false), společná sekce kategorie se odebere. Nic se
-- nemaže — objednávky, které čaje obsahují, zůstanou v pořádku.
-- VYGENEROVÁNO skriptem scripts/eshop-catalog/build-caje.mjs. Opětovné
-- spuštění 51 vše vrátí.
BEGIN;
UPDATE "product_variants" SET "is_active" = false, "updated_at" = now()
WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" IN (${list}));
UPDATE "products" SET "is_active" = false, "updated_at" = now() WHERE "slug" IN (${list});
UPDATE "product_categories" SET "intro" = '{}'::text[], "detail_sections" = NULL, "updated_at" = now() WHERE "slug" = 'caje';
COMMIT;
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = join(HERE, "../../docs/eshop-catalog");
  writeFileSync(join(dir, "51_caje.sql"), cajeSql());
  writeFileSync(join(dir, "59_caje_rollback.sql"), cajeRollbackSql());
  console.log("zapsáno 51_caje.sql, 59_caje_rollback.sql");
}
