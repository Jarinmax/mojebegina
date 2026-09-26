// E-shop 1.0 (náhled) — katalog produktů pro veřejný e-shop na /eshop.
//
// Zatím STATICKÝ zdroj pravdy v kódu, stejný princip jako
// lib/content/companyOverview.ts. Centrální databáze produktů (receptura,
// náklady, sklad — viz oblast "Produkty" v Řízení firmy) je samostatná
// budoucí fáze; až vznikne, stačí nahradit obsah tohoto souboru dotazem se
// stejným tvarem dat.
//
// Nic se nevymýšlí: názvy a cena 379 Kč odpovídají skutečným objednávkám
// v DB (order_items). Údaje, které zatím neznáme — velikost balení,
// složení, alergeny, výživové hodnoty, skladování, trvanlivost — jsou
// `null` a e-shop je zobrazuje jako "Doplníme". U potravin jsou tyto
// údaje povinné PŘED nákupem (nařízení EU 1169/2011), proto
// `isFoodInfoComplete` hlídá, jestli je produkt připravený na ostrý prodej.

export type FoodInfo = {
  ingredients: string | null;
  /** Alergeny podle přílohy II nařízení 1169/2011; prázdné pole = žádné. */
  allergens: string[] | null;
  nutritionPer100g: string | null;
  storage: string | null;
  shelfLife: string | null;
};

export type Product = {
  slug: string;
  name: string;
  category: "polevky";
  shortDescription: string;
  priceKc: number;
  packageLabel: string | null;
  foodInfo: FoodInfo;
};

const UNKNOWN_FOOD_INFO: FoodInfo = {
  ingredients: null,
  allergens: null,
  nutritionPer100g: null,
  storage: null,
  shelfLife: null,
};

export const products: Product[] = [
  {
    slug: "dynova-polevka",
    name: "Dýňová polévka",
    category: "polevky",
    shortDescription: "Krémová polévka z dýně.",
    priceKc: 379,
    packageLabel: null,
    foodInfo: UNKNOWN_FOOD_INFO,
  },
  {
    slug: "kulajda",
    name: "Kulajda",
    category: "polevky",
    shortDescription: "Tradiční jihočeská polévka.",
    priceKc: 379,
    packageLabel: null,
    foodInfo: UNKNOWN_FOOD_INFO,
  },
  {
    slug: "rajcatova-polevka",
    name: "Rajčatová polévka",
    category: "polevky",
    shortDescription: "Polévka z rajčat.",
    priceKc: 379,
    packageLabel: null,
    foodInfo: UNKNOWN_FOOD_INFO,
  },
];

export function getProduct(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug);
}

export function isFoodInfoComplete(product: Product): boolean {
  const info = product.foodInfo;
  return (
    product.packageLabel !== null &&
    info.ingredients !== null &&
    info.allergens !== null &&
    info.nutritionPer100g !== null &&
    info.storage !== null &&
    info.shelfLife !== null
  );
}
