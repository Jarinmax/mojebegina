// ESHOP 1.0 — tvar katalogu, se kterým pracuje e-shop za běhu. Plní ho
// VÝHRADNĚ databáze (catalogDb.ts → loadCatalog). lib/eshop/catalog.ts má
// vlastní typy a slouží jen jako zdroj prvního naplnění DB (migrace 0013).
//
// Modul nesmí importovat nic z MojeBegina (lib/data, lib/auth) — e-shop
// musí jít později oddělit do samostatné aplikace beze změn.

export type DetailSection = { title: string; paragraphs: string[]; bullets: string[] };

export type Category = {
  slug: string;
  name: string;
  image: string | null;
  intro: string[];
  /** Společné sekce na detailu každého produktu kategorie. */
  detailSections: DetailSection[];
  /** Odvozeno: kategorie obsahuje aspoň jeden 18+ produkt. */
  ageRestricted: boolean;
};

export type Variant = {
  sku: string;
  /** null = balení zatím neznámé */
  label: string | null;
  detail: string | null;
  description: string | null;
  priceKc: number;
  volumeMl: number | null;
  servings: number | null;
};

export type FoodInfo = {
  ingredients: string | null;
  /** Česky pojmenované alergeny; null = zatím neznámé, [] = bez alergenů. */
  allergens: string[] | null;
  nutritionPer100g: string | null;
  storage: string | null;
  shelfLife: string | null;
};

export type Product = {
  slug: string;
  name: string;
  /** slug kategorie */
  category: string;
  shortDescription: string | null;
  highlights: string[];
  description: string[];
  taste: string | null;
  warnings: string[];
  image: string | null;
  variants: Variant[];
  alcoholPercent: number | null;
  isAgeRestricted: boolean;
  foodInfo: FoodInfo;
};

export type Catalog = { categories: Category[]; products: Product[] };
