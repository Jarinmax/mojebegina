// ESHOP — generuje katalog Ovocných nápojů (docs/eshop-catalog/7x_*):
//   71_ovocne_napoje.sql            3 produkty SKRYTÉ (is_active = false) —
//                                   na webu nejsou, nejdou objednat
//   73_ovocne_napoje_zverejneni.sql zveřejnění (+ text kategorie); ODMÍTNE,
//                                   dokud některý produkt nemá ověřené alergeny
//   79_ovocne_napoje_rollback.sql   skryje produkty i text kategorie
//
// Texty, ceny a fotky doslova z begina.cz (WooCommerce Store API
// /wp-json/wc/store/v1/products a stránky produktů, staženo 10. 10. 2026).
// Na begina.cz NENÍ uvedeno: alergeny, trvanlivost (datum / počet dní) —
// zůstávají NULL („Doplníme“ / „Ověřujeme“), nic se nevymýšlí. Alergeny
// doplní vedení do ALLERGENS níže (kódy z lib/db/schema.ts ALLERGEN_CODES,
// [] = ověřeno bez alergenů) a skript se vygeneruje znovu.
//
//   node scripts/eshop-catalog/build-ovocne-napoje.mjs
// Test lib/eshop/__tests__/catalogOvocneNapoje.test.ts hlídá, že soubory = výstup.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { arr, categorySql, imageSql, productSql, q, variantSql } from "./sql.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Ověřené alergeny od vedení — ZATÍM ŽÁDNÉ (undefined = neověřeno = NULL).
 * Příklad po ověření: { "cervankove-nebe": [], "dum-u-jezera": [], "malinovy-svarak-nealko": [] }
 */
export const ALLERGENS = {};

// Text kategorie z begina.cz/kategorie-produktu/ovocne-napoje (10. 10. 2026).
export const CATEGORY = {
  intro: [
    "Poctivé ovocné prémiové nápoje Begina připravujeme z ovocných šťáv na základě čisté filtrované vody, která nechává vyniknout přirozené chuti každé ingredience. Jako česká značka si zakládáme na tom, aby každá receptura byla vyvážená a přinášela maximum chuti přímo z přírody.",
    "Jsou zcela bez přidaného cukru, protože veškerá jejich sladkost pochází výhradně z ovoce. Jedinečný charakter a podmanivou vůni jim dodáváme šetrným zpracováním vybraných přírodních složek. Harmonicky vyniknou ve studené i teplé variantě a zachovávají si svou plnost, svěžest a poctivý charakter.",
  ],
  detailSections: [
    {
      title: "Vhodné také pro gastro provozy a kanceláře",
      paragraphs: [
        "Ovocné nápoje Begina jsou praktické řešení pro:",
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

// Popis: "## Nadpis" = vlastní sekce, "- " = odrážka, "**…**" = tučně (lib/eshop/productDescription.ts).
export const DRINKS = [
  {
    slug: "cervankove-nebe",
    name: "Červánkové nebe",
    sortOrder: 10,
    wooId: 659,
    shortDescription: "Až 12 nápojů (29 Kč za nápoj). Jeden nápoj = 250 ml.",
    highlights: ["z čisté filtrované vody", "bez umělých aromat a barviv", "vyvážená, přirozená chuť"],
    description: [
      "Jablečno-malinový nápoj Červánkové nebe propojuje plnost ovoce s jemným citrusovým akcentem. Chuť je šťavnatá, harmonická a krásně vyvážená – s lehkostí, ke které se rádi vracíte.",
      "**Prémiový nápoj, který máte v lednici vždy připravený. Stačí podávat vychlazený.**",
      "Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.",
      "## Moderní alternativa limonád",
      "Jablečno-malinový nápoj Červánkové nebe představuje lehkou a moderní alternativu klasických sladkých limonád. Spojuje přirozenou ovocnou plnost s jemnou svěžestí a působí vyváženě a kultivovaně.",
      "Je ideální pro každodenní osvěžení i slavnostní příležitosti. Díky různým velikostem balení se hodí jak pro jednotlivce, tak pro rodinné posezení nebo větší setkání s přáteli.",
      "## Pro koho je vhodný",
      "- pro ty, kdo mají rádi šťavnatou a přirozeně ovocnou chuť",
      "- jako lehké osvěžení během dne",
      "- k posezení s přáteli",
      "- jako základ pro míchané nápoje",
    ],
    taste:
      "Jablečno-malinový nápoj Červánkové nebe má šťavnatý, harmonický charakter. Jablečno-malinová plnost se přirozeně propojuje s jemnou citrusovou linkou a vytváří hladký, vyvážený dojem. Chuť je kulatá, ovocně hluboká a mimořádně pitelná. Je to ten typ nápoje, který si nalijete znovu dřív, než si uvědomíte, že sklenka je prázdná.",
    ingredients:
      "čistá filtrovaná voda, jablečno-malinová šťáva, citronová šťáva, regulátor kyselosti: kyselina citronová; antioxidant: kyselina askorbová (vitamin C), přírodní aroma",
    nutrition: { energy_kj: 86, energy_kcal: 20, fat: 0, saturates: 0, carbohydrate: 5.1, sugars: 5, protein: 0, salt: 0 },
    storage: STORAGE,
    warnings: [],
    variants: [bagInBox("cervankove-nebe", 349, 12)],
  },
  {
    slug: "dum-u-jezera",
    name: "Dům u jezera",
    sortOrder: 20,
    wooId: 421,
    shortDescription: "Až 12 nápojů (29 Kč za nápoj). Jeden nápoj = 250 ml.",
    highlights: ["z čisté filtrované vody", "bez umělých aromat a barviv", "vyvážená, přirozená chuť"],
    description: [
      "Grepový nápoj Dům u jezera spojuje výraznou citrusovou svěžest s jemnou jablečnou plností. Výsledkem je harmonická chuť, která připomíná letní střik nebo dobře vychlazenou sklenku vína.",
      "**Prémiový nápoj, který máte v lednici vždy připravený. Stačí podávat vychlazený.**",
      "Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.",
      "## Moderní alternativa limonád",
      "Grepový nápoj Dům u jezera představuje lehkou a moderní alternativu klasických sladkých limonád. Spojuje výraznou grepovou svěžest s jemnou jablečnou plností a působí vyváženě a přirozeně.",
      "Je ideální pro každodenní osvěžení i slavnostní příležitosti. Díky různým velikostem balení se hodí jak pro jednotlivce, tak pro rodinné posezení nebo větší setkání s přáteli.",
      "## Pro koho je vhodný",
      "- pro ty, kdo mají rádi svěží a výraznější chuť",
      "- jako lehké osvěžení během dne",
      "- k posezení s přáteli",
      "- jako základ pro míchané nápoje",
    ],
    taste:
      "Grepový nápoj dům u jezera má výrazný, osvěžující charakter. Grepová svěžest se přirozeně propojuje s jemnou jablečnou plností a vytváří lehký, čistý dojem. Chuť připomíná letní střik nebo dobře vychlazenou sklenku vína a působí svěže a energicky.",
    ingredients:
      "čistá filtrovaná voda, grepová šťáva, jablečná šťáva, citronová šťáva, regulátor kyselosti: kyselina citronová; antioxidant: kyselina askorbová (vitamin C), přírodní aroma",
    nutrition: { energy_kj: 52, energy_kcal: 12, fat: 0, saturates: 0, carbohydrate: 2.9, sugars: 2.9, protein: 0, salt: 0 },
    storage: STORAGE,
    warnings: [],
    variants: [bagInBox("dum-u-jezera", 349, 12)],
  },
  {
    slug: "malinovy-svarak-nealko",
    name: "Malinový svařák – nealko",
    sortOrder: 30,
    wooId: 1208,
    shortDescription: "Až 15 nápojů (26,60 Kč za nápoj). Jeden nápoj = 200 ml.",
    highlights: ["z čisté filtrované vody", "bez umělých aromat a barviv", "vyvážená, plná chuť"],
    description: [
      "Malinový svařák nealko v sobě spojuje jemnost ovocných tónů s hloubkou tradičního koření. Sladké maliny a jablka se prolínají s nádechem pomeranče, zatímco hřebíček, skořice a badyán dodávají nápoji jeho charakteristickou, harmonickou chuť.",
      "Ideální pro klidné večery, zimní atmosféru i chvíle, kdy si chcete dopřát něco výjimečného.",
      "**Prémiový nápoj, který máte v lednici vždy připravený. Stačí jemně ohřát nebo podávat vychlazený.**",
      "Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechá vyniknout přirozený charakter jednotlivých ingrediencí.",
    ],
    taste:
      "Malinový svařák nealko má jemně ovocný, plný a hřejivý charakter. Sladké maliny a jablka se přirozeně doplňují s citrusovým tónem pomeranče, zatímco hřebíček, skořice a badyán dodávají nápoji jeho typickou, příjemně kořeněnou hloubku. Chuť je harmonická, vyvážená a působí příjemným a hřejivým dojmem.",
    ingredients:
      "čistá filtrovaná voda, jablečná šťáva, malinová šťáva, pomerančová šťáva, hřebíček, skořice, badyán, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)",
    nutrition: { energy_kj: 128, energy_kcal: 30, fat: 0, saturates: 0, carbohydrate: 7.3, sugars: 7.1, protein: 0, salt: 0 },
    storage: STORAGE,
    warnings: [],
    variants: [bagInBox("malinovy-svarak-nealko", 399, 15)],
  },
];

const withAllergens = (drink) => (drink.slug in ALLERGENS ? { ...drink, allergens: ALLERGENS[drink.slug] } : drink);
const SLUGS = () => DRINKS.map((d) => q(d.slug)).join(", ");

/** 71: produkty, balení a fotky — SKRYTÉ. Kategorie se nemění (na webu se nic neobjeví). */
export function ovocneNapojeSql() {
  const out = [];
  const w = (s) => out.push(s);
  w(`-- ESHOP — katalog: Ovocné nápoje (${DRINKS.map((d) => d.name).join(", ")}).
-- VYGENEROVÁNO skriptem scripts/eshop-catalog/build-ovocne-napoje.mjs — ručně neupravovat.
-- Texty, ceny, složení, výživa na 100 ml a skladování doslova z begina.cz
-- (WooCommerce, 10. 10. 2026). Alergeny a trvanlivost begina.cz neuvádí →
-- NULL (neověřeno).
--
-- Produkty vzniknou SKRYTÉ (is_active = false): na webu nejsou a nejdou
-- objednat. Kategorie se nemění. Zveřejnění: 73_ovocne_napoje_zverejneni.sql
-- (jen s ověřenými alergeny). Idempotentní; spouští se CELÝ soubor najednou.
-- Kontrola před: 70_ovocne_napoje_before.sql, po: 72_ovocne_napoje_after.sql.
BEGIN;
`);
  for (const drink of DRINKS.map(withAllergens)) {
    w(productSql({ ...drink, active: false }, "ovocne-napoje", drink.sortOrder));
    drink.variants.forEach((v, j) => w(variantSql(drink.slug, v, (j + 1) * 10)));
    w(imageSql(drink));
  }
  w("COMMIT;\n");
  return out.join("\n");
}

/**
 * 73: zveřejnění — text kategorie + produkty viditelné. Pojistka: odmítne,
 * dokud kterýkoli z produktů nemá ověřené alergeny (NULL), takže nikdy
 * nezveřejní produkt, který by nešel objednat kvůli neověřeným údajům.
 */
export function ovocneNapojeZverejneniSql() {
  const allergenUpdates = DRINKS.filter((d) => d.slug in ALLERGENS).map(
    (d) => `UPDATE "products" SET "allergens" = ${arr(ALLERGENS[d.slug])}, "updated_at" = now() WHERE "slug" = ${q(d.slug)};\n`
  );
  return `-- ESHOP — zveřejnění Ovocných nápojů (po 71_ovocne_napoje.sql).
-- VYGENEROVÁNO skriptem scripts/eshop-catalog/build-ovocne-napoje.mjs — ručně neupravovat.
-- Zapíše ověřené alergeny (ALLERGENS ve skriptu), text kategorie a zapne
-- produkty. POJISTKA: dokud některý produkt nemá ověřené alergeny, skončí
-- chybou a NIC se nezmění (jedna transakce).
BEGIN;
${allergenUpdates.join("")}DO $$
BEGIN
  IF (SELECT count(*) FROM "products" WHERE "slug" IN (${SLUGS()})) <> ${DRINKS.length} THEN
    RAISE EXCEPTION 'STOP: chybí produkty — nejdřív 71_ovocne_napoje.sql';
  END IF;
  IF EXISTS (SELECT 1 FROM "products" WHERE "slug" IN (${SLUGS()}) AND "allergens" IS NULL) THEN
    RAISE EXCEPTION 'STOP: neověřené alergeny — doplnit ALLERGENS ve skriptu a vygenerovat znovu';
  END IF;
END $$;
${categorySql("ovocne-napoje", CATEGORY)}UPDATE "products" SET "is_active" = true, "updated_at" = now() WHERE "slug" IN (${SLUGS()});
COMMIT;
`;
}

/** 79: vrácení — produkty skryté, text kategorie pryč. Nic se nemaže. */
export function ovocneNapojeRollbackSql() {
  return `-- ESHOP — vrácení 71/73: Ovocné nápoje zmizí z e-shopu (is_active = false),
-- text kategorie se odebere. Nic se nemaže. VYGENEROVÁNO skriptem
-- scripts/eshop-catalog/build-ovocne-napoje.mjs.
BEGIN;
UPDATE "products" SET "is_active" = false, "updated_at" = now() WHERE "slug" IN (${SLUGS()});
UPDATE "product_categories" SET "intro" = '{}'::text[], "detail_sections" = NULL, "updated_at" = now() WHERE "slug" = 'ovocne-napoje';
COMMIT;
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = join(HERE, "../../docs/eshop-catalog");
  writeFileSync(join(dir, "71_ovocne_napoje.sql"), ovocneNapojeSql());
  writeFileSync(join(dir, "73_ovocne_napoje_zverejneni.sql"), ovocneNapojeZverejneniSql());
  writeFileSync(join(dir, "79_ovocne_napoje_rollback.sql"), ovocneNapojeRollbackSql());
  console.log("zapsáno 71, 73, 79");
}
