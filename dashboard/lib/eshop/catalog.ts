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
//     oříznuté ze screenshotů, které poslal Jaroslav 26. 9. 2026).
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

export type Category = {
  slug: CategorySlug;
  name: string;
  intro: string[];
  /** Prodej jen osobám starším 18 let — pokladna vyžaduje potvrzení. */
  ageRestricted: boolean;
};

export const AGE_RESTRICTION_NOTICE = "Prodej alkoholických nápojů osobám mladším 18 let je zakázán.";

export const categories: Category[] = [
  { slug: "polevky", name: "Čerstvé polévky", intro: [], ageRestricted: false },
  { slug: "sirupy", name: "Bylinné sirupy", intro: [], ageRestricted: false },
  { slug: "caje", name: "Čaje", intro: [], ageRestricted: false },
  { slug: "ovocne-napoje", name: "Ovocné nápoje", intro: [], ageRestricted: false },
  {
    slug: "koktejly",
    name: "Alkoholické koktejly",
    intro: [
      "Alkoholické koktejly Begina spojují kvalitní destiláty, čisté ovocné šťávy a precizně vyvážené chutě.",
      "Každý nápoj je postavený tak, aby působil přirozeně, čistě a zároveň výrazně.",
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
  priceKc: number;
};

export type Product = {
  slug: string;
  name: string;
  category: CategorySlug;
  shortDescription: string | null;
  highlights: string[];
  description: string[];
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
    warnings: [],
    image: null,
    variants: [{ sku: slug, label: null, detail: null, priceKc: 379 }],
    alcoholPercent: null,
    foodInfo: UNKNOWN_FOOD_INFO,
  };
}

// Balení koktejlů podle stránky Svařák Deluxe na begina.cz. Přiřazení cen
// k balením je odvozené z cenového rozpětí ("129 Kč – 499 Kč" při dvou
// baleních) — ověřit s vedením, stejně jako že ostatní koktejly mají
// stejná dvě balení.
function cocktailVariants(slug: string, price3lKc: number, price500mlKc: number): Variant[] {
  return [
    {
      sku: `${slug}-3l`,
      label: "3 l Rodinná zásoba (bag-in-box)",
      detail: "Až 15 nápojů po 200 ml",
      priceKc: price3lKc,
    },
    {
      sku: `${slug}-500ml`,
      label: "500 ml Praktické balení",
      detail: "2–3 nápoje",
      priceKc: price500mlKc,
    },
  ];
}

function cocktail(slug: string, name: string): Product {
  return {
    slug,
    name,
    category: "koktejly",
    shortDescription: null,
    highlights: [],
    description: [],
    warnings: [],
    image: `/eshop/${slug}.jpg`,
    variants: cocktailVariants(slug, 799, 169),
    alcoholPercent: null,
    foodInfo: UNKNOWN_FOOD_INFO,
  };
}

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
    warnings: ["Není určeno pro děti, těhotné a kojící ženy."],
    image: "/eshop/svarak-deluxe.jpg",
    variants: cocktailVariants("svarak-deluxe", 499, 129),
    alcoholPercent: 7.5,
    foodInfo: {
      ingredients:
        "červené víno, pomerančová šťáva, grepová šťáva, citronová šťáva, třtinový cukr, skořice, zázvor, kardamom, hřebíček, badyán, vanilka, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)",
      allergens: null,
      nutritionPer100g: null,
      storage:
        "Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě.",
      shelfLife: null,
    },
  },
  cocktail("lady-carneval", "Lady Carneval"),
  cocktail("granatovy-bond", "Granátový Bond"),
  cocktail("kosmopolitan", "Kosmopolitan"),
];

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
