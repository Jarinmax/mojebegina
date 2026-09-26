// E-shop 1.0 (náhled) — katalog produktů pro veřejný e-shop na /eshop.
//
// Zatím STATICKÝ zdroj pravdy v kódu, stejný princip jako
// lib/content/companyOverview.ts. Centrální databáze produktů (receptura,
// náklady, sklad — viz oblast "Produkty" v Řízení firmy) je samostatná
// budoucí fáze; až vznikne, stačí nahradit obsah tohoto souboru dotazem se
// stejným tvarem dat.
//
// Nic se nevymýšlí. Zdroje:
//   - polévky: názvy a cena 379 Kč ze skutečných objednávek v DB
//     (order_items), balení neznámé,
//   - alkoholické koktejly: stránky begina.cz (texty doslova, fotky
//     oříznuté ze screenshotů, které poslal Jaroslav 26. 9. 2026);
//     u Granátového Bonda chybí úvodní popis a přednosti.
// Údaje, které neznáme, jsou `null` a e-shop je zobrazuje jako "Doplníme".
// U potravin jsou povinné PŘED nákupem (nařízení EU 1169/2011), proto
// `isFoodInfoComplete` hlídá, jestli je produkt připravený na ostrý prodej.

export type FoodInfo = {
  ingredients: string | null;
  /** Alergeny podle přílohy II nařízení 1169/2011; prázdné pole = žádné. */
  allergens: string[] | null;
  nutritionPer100g: string | null;
  storage: string | null;
  shelfLife: string | null;
};

// Kategorie podle stávajícího webu begina.cz.
export type CategorySlug = "polevky" | "sirupy" | "caje" | "ovocne-napoje" | "koktejly";

export type DetailSection = { title: string; paragraphs: string[]; bullets: string[] };

export type Category = {
  slug: CategorySlug;
  name: string;
  /** Dlaždice na úvodní stránce — oříznuto ze screenshotu begina.cz,
   *  název je v obrázku zapečený a dlaždice ho překrývá vlastním pruhem. */
  image: string;
  intro: string[];
  /** Společné sekce na detailu každého produktu kategorie. */
  detailSections: DetailSection[];
  /** Prodej jen osobám starším 18 let — pokladna vyžaduje potvrzení. */
  ageRestricted: boolean;
};

export const AGE_RESTRICTION_NOTICE = "Prodej alkoholických nápojů osobám mladším 18 let je zakázán.";

export const categories: Category[] = [
  {
    slug: "polevky",
    name: "Čerstvé polévky",
    image: "/eshop/kategorie-polevky.jpg",
    intro: [],
    detailSections: [],
    ageRestricted: false,
  },
  {
    slug: "sirupy",
    name: "Bylinné sirupy",
    image: "/eshop/kategorie-sirupy.jpg",
    intro: [],
    detailSections: [],
    ageRestricted: false,
  },
  {
    slug: "caje",
    name: "Čaje",
    image: "/eshop/kategorie-caje.jpg",
    intro: [],
    detailSections: [],
    ageRestricted: false,
  },
  {
    slug: "ovocne-napoje",
    name: "Ovocné nápoje",
    image: "/eshop/kategorie-ovocne-napoje.jpg",
    intro: [],
    detailSections: [],
    ageRestricted: false,
  },
  {
    slug: "koktejly",
    name: "Alkoholické koktejly",
    image: "/eshop/kategorie-koktejly.jpg",
    intro: [
      "Alkoholické koktejly Begina spojují kvalitní destiláty, čisté ovocné šťávy a precizně vyvážené chutě.",
      "Každý nápoj je postavený tak, aby působil přirozeně, čistě a zároveň výrazně.",
    ],
    detailSections: [
      {
        title: "Vhodné také pro gastro provozy a kanceláře",
        paragraphs: [
          "Alkoholické koktejly Begina jsou praktické řešení pro:",
          "Díky bag-in-box balení lze koktejl jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu.",
        ],
        bullets: ["kavárny", "bistra", "menší restaurace", "kanceláře", "catering"],
      },
    ],
    ageRestricted: true,
  },
];

/** Jedna prodejní varianta (balení) produktu — to, co je v košíku. */
export type Variant = {
  /** Unikátní napříč katalogem, klíč řádku košíku. */
  sku: string;
  /** null = balení zatím neznáme */
  label: string | null;
  detail: string | null;
  /** Delší popis balení pro detail produktu. */
  description: string | null;
  priceKc: number;
};

export type Product = {
  slug: string;
  name: string;
  category: CategorySlug;
  shortDescription: string | null;
  highlights: string[];
  description: string[];
  /** "Jak chutná …" */
  taste: string | null;
  warnings: string[];
  /** cesta v /public, null = zástupná ikonka */
  image: string | null;
  variants: Variant[];
  /** % obj.; u nealkoholických produktů se nepoužívá */
  alcoholPercent: number | null;
  foodInfo: FoodInfo;
};

const UNKNOWN_FOOD_INFO: FoodInfo = {
  ingredients: null,
  allergens: null,
  nutritionPer100g: null,
  storage: null,
  shelfLife: null,
};

function soup(slug: string, name: string, shortDescription: string): Product {
  return {
    slug,
    name,
    category: "polevky",
    shortDescription,
    highlights: [],
    description: [],
    taste: null,
    warnings: [],
    image: null,
    variants: [{ sku: slug, label: null, detail: null, description: null, priceKc: 379 }],
    alcoholPercent: null,
    foodInfo: UNKNOWN_FOOD_INFO,
  };
}

// Balení koktejlů podle stránek Svařák Deluxe a Lady Carneval na begina.cz.
// Cena 3 l balení je potvrzená cenou za nápoj uvedenou na webu
// (15 × 33,30 Kč ≈ 499 Kč, 15 × 53,30 Kč ≈ 799 Kč). Všechny čtyři
// koktejly mají na webu stejná dvě balení.
function cocktailVariants(slug: string, price3lKc: number, price500mlKc: number): Variant[] {
  return [
    {
      sku: `${slug}-3l`,
      label: "3 l Rodinná zásoba (bag-in-box)",
      detail: "Až 15 nápojů po 200 ml",
      description:
        "Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.",
      priceKc: price3lKc,
    },
    {
      sku: `${slug}-500ml`,
      label: "500 ml Praktické balení",
      detail: "2–3 nápoje",
      description: "Lehké a nerozbitné balení vhodné na cesty nebo pro menší spotřebu.",
      priceKc: price500mlKc,
    },
  ];
}

const COCKTAIL_STORAGE =
  "Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě.";

const COCKTAIL_WARNINGS = ["Není určeno pro děti, těhotné a kojící ženy."];

export const products: Product[] = [
  soup("dynova-polevka", "Dýňová polévka", "Krémová polévka z dýně."),
  soup("kulajda", "Kulajda", "Tradiční jihočeská polévka."),
  soup("rajcatova-polevka", "Rajčatová polévka", "Polévka z rajčat."),
  {
    slug: "svarak-deluxe",
    name: "Svařák Deluxe",
    category: "koktejly",
    shortDescription: "Výrazný zahřívací nápoj z červeného vína s ovocem a kořením.",
    highlights: ["bez umělých aromat a barviv", "plná, vyvážená chuť", "stačí jemně ohřát"],
    description: [
      "Svařák Deluxe je výrazný zahřívací nápoj, ve kterém se propojuje kvalitní červené víno s ovocnými tóny pomeranče, grepu a citronu. Koření jako skořice, hřebíček, badyán, kardamom, zázvor a vanilka dotváří jeho charakter a přináší bohatý chuťový zážitek.",
      "Každý doušek působí příjemným a hřejivým dojmem a přirozeně zapadá do zimní atmosféry i večerní pohody.",
      "Prémiový nápoj, který máte v lednici vždy připravený. Stačí ohřát. Výborný i chlazený s ledem.",
    ],
    taste:
      "Plná a vyvážená chuť červeného vína s jemnými tóny pomeranče, grepu a citronu, doplněná hřejivým kořením, které vytváří bohatý a harmonický chuťový zážitek.",
    warnings: COCKTAIL_WARNINGS,
    image: "/eshop/svarak-deluxe.jpg",
    variants: cocktailVariants("svarak-deluxe", 499, 129),
    alcoholPercent: 7.5,
    foodInfo: {
      ingredients:
        "červené víno, pomerančová šťáva, grepová šťáva, citronová šťáva, třtinový cukr, skořice, zázvor, kardamom, hřebíček, badyán, vanilka, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)",
      allergens: null,
      nutritionPer100g: null,
      storage: COCKTAIL_STORAGE,
      shelfLife: null,
    },
  },
  {
    slug: "lady-carneval",
    name: "Lady Carneval",
    category: "koktejly",
    shortDescription: "Grepový koktejl s vodkou a Aperolem.",
    // Na begina.cz je navíc "bez umělých aromat a barviv" — záměrně
    // vynecháno, protože složení (Aperol) obsahuje aromata a barviva
    // E110, E124. Rozhodne vedení, viz ESHOP_ROADMAP.md.
    highlights: ["z čisté filtrované vody", "ideální pro podávání s ledem", "plná, osvěžující chuť"],
    description: [
      "Grepový alkoholický koktejl Lady Carneval v sobě spojuje kvalitní vodku, italský Aperol a grepovou šťávu. Vzniká tak harmonický drink s výrazným citrusovým charakterem.",
      "Každý doušek přináší osvěžující chuťový zážitek, který se hodí pro chvíle s přáteli i jako stylové osvěžení pro každou příležitost.",
      "Prémiový nápoj, který máte v lednici vždy připravený. Stačí nalít do sklenice s ledem.",
      "Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.",
    ],
    taste:
      "Grepový alkoholický koktejl Lady Carneval má výraznou citrusovou chuť s příjemnou svěžestí grepu a jemně nasládlým dozvukem. Vyvážené spojení vodky, Aperolu a ovocných tónů vytváří harmonický a osvěžující drink, který působí lehce a elegantně.",
    warnings: COCKTAIL_WARNINGS,
    image: "/eshop/lady-carneval.jpg",
    variants: cocktailVariants("lady-carneval", 799, 169),
    alcoholPercent: 7.2,
    foodInfo: {
      ingredients:
        "čistá filtrovaná voda, vodka, grepová šťáva, Aperol (pitná voda, cukr, líh, aromata, barviva: E110, E124), citronová šťáva, třtinový cukr, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)",
      allergens: null,
      nutritionPer100g: null,
      storage: COCKTAIL_STORAGE,
      shelfLife: null,
    },
  },
  {
    slug: "granatovy-bond",
    name: "Granátový Bond",
    category: "koktejly",
    shortDescription: "Ovocný koktejl s vodkou a granátovým jablkem.",
    // Přednosti a úvodní popis z horní části stránky zatím nemáme.
    highlights: [],
    description: [],
    taste:
      "Granátový Bond má plnou, ovocnou chuť s výrazným tónem granátového jablka, který se postupně rozvíjí do jemně nasládlého a hladkého závěru. Jako alkoholický koktejl s granátovým jablkem působí elegantně, intenzivně a zanechává dlouhý, příjemný dozvuk.",
    warnings: COCKTAIL_WARNINGS,
    image: "/eshop/granatovy-bond.jpg",
    variants: cocktailVariants("granatovy-bond", 799, 169),
    alcoholPercent: 6.7,
    foodInfo: {
      ingredients:
        "čistá filtrovaná voda, vodka, šťáva z granátového jablka, třtinový cukr, citronová šťáva, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)",
      allergens: null,
      nutritionPer100g: null,
      storage: COCKTAIL_STORAGE,
      shelfLife: null,
    },
  },
  {
    slug: "kosmopolitan",
    name: "Kosmopolitan",
    category: "koktejly",
    shortDescription: "Brusinkový koktejl s vodkou a citrusy.",
    highlights: [
      "z čisté filtrované vody",
      "ideální pro podávání s ledem",
      "bez umělých aromat a barviv",
      "plná, osvěžující chuť",
    ],
    description: [
      "Kosmopolitan je ikonický alkoholický koktejl, který spojuje kvalitní vodku, brusinkovou a citronovou šťávu. Vzniká tak harmonický drink s výrazným ovocně-citrusovým charakterem a jemně nasládlým dozvukem.",
      "Každý doušek přináší osvěžující chuťový zážitek, který se hodí pro chvíle s přáteli i jako stylové osvěžení pro každou příležitost.",
      "Prémiový nápoj, který máte v lednici vždy připravený. Stačí nalít do sklenice s ledem.",
      "Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.",
    ],
    taste:
      "Kosmopolitan má výraznou ovocně-citrusovou chuť se svěžestí brusinek a jemně nasládlým dozvukem. Působí lehce, elegantně a dodává každému okamžiku nádech sebevědomí a stylu.",
    warnings: COCKTAIL_WARNINGS,
    image: "/eshop/kosmopolitan.jpg",
    variants: cocktailVariants("kosmopolitan", 799, 169),
    alcoholPercent: 6.3,
    foodInfo: {
      ingredients:
        "čistá filtrovaná voda, brusinková šťáva, jablečná šťáva, vodka, citronová šťáva, třtinový cukr, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C), přírodní aroma",
      allergens: null,
      nutritionPer100g: null,
      storage: COCKTAIL_STORAGE,
      shelfLife: null,
    },
  },
];

export function findCategory(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}

export function getCategory(slug: CategorySlug): Category {
  const category = categories.find((c) => c.slug === slug);
  if (!category) {
    throw new Error(`Neznámá kategorie ${slug}`);
  }
  return category;
}

export function productsInCategory(category: CategorySlug): Product[] {
  return products.filter((product) => product.category === category);
}

export function getProduct(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug);
}

export function getVariant(sku: string): { product: Product; variant: Variant } | undefined {
  for (const product of products) {
    const variant = product.variants.find((v) => v.sku === sku);
    if (variant) {
      return { product, variant };
    }
  }
  return undefined;
}

export function isAgeRestricted(product: Product): boolean {
  return getCategory(product.category).ageRestricted;
}

export function lowestPriceKc(product: Product): number {
  return Math.min(...product.variants.map((variant) => variant.priceKc));
}

/** Název řádku do košíku/objednávky — snapshot jako order_items.name. */
export function lineName(product: Product, variant: Variant): string {
  return variant.label ? `${product.name} — ${variant.label}` : product.name;
}

export function isFoodInfoComplete(product: Product): boolean {
  const info = product.foodInfo;
  return (
    product.variants.every((variant) => variant.label !== null) &&
    (!isAgeRestricted(product) || product.alcoholPercent !== null) &&
    info.ingredients !== null &&
    info.allergens !== null &&
    info.nutritionPer100g !== null &&
    info.storage !== null &&
    info.shelfLife !== null
  );
}
