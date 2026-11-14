// Vyhledávače (12. 11. 2026): popisy stránek, názvy a strukturovaná data
// (schema.org JSON-LD) pro begina.cz. Čisté funkce — data jen z katalogu,
// nic se nevymýšlí (žádná hodnocení, recenze ani tvrzení navíc).
import { coldShippingPrice } from "./shippingRates";
import { PUBLIC_ORIGIN } from "@/lib/site/hosts";
import { isOrderable } from "./productRules";
import type { Category, Product } from "./types";

export const HOME_TITLE = "Begina – bylinné sirupy, polévky, čaje a nápoje";
export const HOME_DESCRIPTION =
  "Bylinné sirupy, polévky, čaje, ovocné nápoje, alkoholické koktejly a zmrzliny od Beginy. Balení 3 l s kohoutkem i menší balení, doručujeme chlazenou přepravou.";

/** Markdown z popisů (**tučně**, ## nadpisy, - odrážky) → prostý text. */
export function plainText(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\*\*|__|\*|_/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Zkrácení na celé slovo (popis ve výsledcích vyhledávání ~155 znaků). */
export function truncate(text: string, max = 158): string {
  const clean = plainText(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const atWord = cut.slice(0, cut.lastIndexOf(" ") > 60 ? cut.lastIndexOf(" ") : cut.length);
  return `${atWord.replace(/[\s,;:–-]+$/, "")}…`;
}

/** První odstavec popisu, který není nadpis ani odrážka. */
function firstParagraph(lines: string[]): string | null {
  return lines.find((line) => line.trim() && !/^\s*(#|-|\*\s)/.test(line)) ?? null;
}

export function categoryDescription(category: Category, products: Product[]): string {
  const names = products.map((product) => product.name);
  const intro = firstParagraph(category.intro);
  const list = names.length ? `${category.name} Begina: ${names.join(", ")}.` : `${category.name} Begina.`;
  return truncate(intro ? `${list} ${intro}` : list);
}

export function productTitle(product: Product, category: Category | null): string {
  return category ? `${product.name} – ${category.name}` : product.name;
}

export function productDescription(product: Product): string | undefined {
  const intro = firstParagraph(product.description);
  if (intro) return truncate(intro);
  return product.shortDescription ? truncate(product.shortDescription) : undefined;
}

const absolute = (url: string) => (/^https?:\/\//.test(url) ? url : `${PUBLIC_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`);

/** JSON pro <script type="application/ld+json"> — bez „<“, aby nešlo ukončit značku. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

// Doprava a vrácení ve strukturovaných datech nabídky (Search Console 14. 11. 2026
// hlásila chybějící shippingDetails a hasMerchantReturnPolicy). Stejné údaje jako
// v Merchant Center: chlazená přeprava po ČR, vyřízení do 5 pracovních dnů
// (obchodní podmínky), přeprava 1–4 dny. Cena z ceníku pro hmotnost jednoho kusu.
function offerShippingDetails(weightGrams: number | null) {
  const price = coldShippingPrice(weightGrams ?? 0);
  if (!price.ok) return null;
  return {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: price.priceKc.toFixed(2), currency: "CZK" },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "CZ" },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 5, unitCode: "DAY" },
      transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 4, unitCode: "DAY" },
    },
  };
}

/**
 * Vrácení podle čl. VII obchodních podmínek: výrobky, které se musí od výroby
 * do spotřeby držet v chladu (údaj o skladování „před otevřením i po otevření“),
 * nelze vrátit bez udání důvodu (§ 1837 písm. e) OZ); ostatní (sirupy) do 14 dnů,
 * náklady na vrácení nese kupující. Reklamace vad tím není dotčena.
 */
export function isWithdrawalExcluded(product: Pick<Product, "foodInfo">): boolean {
  return /před otevřením i po otevření/i.test(product.foodInfo?.storage ?? "");
}

function offerReturnPolicy(product: Product) {
  const base = {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "CZ",
    merchantReturnLink: `${PUBLIC_ORIGIN}/obchodni-podminky`,
  };
  return isWithdrawalExcluded(product)
    ? { ...base, returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted" }
    : {
        ...base,
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 14,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
      };
}

export function productJsonLd(product: Product, category: Category | null) {
  const url = `${PUBLIC_ORIGIN}/produkt/${product.slug}`;
  const images = (product.gallery?.length ? product.gallery.map((photo) => photo.url) : product.image ? [product.image] : []).map(absolute);
  const availability = isOrderable(product) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
  const description = product.description.length ? truncate(product.description.filter((line) => !/^\s*#/.test(line)).join(" "), 500) : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(description ? { description } : {}),
    ...(images.length ? { image: images } : {}),
    sku: product.variants[0]?.sku,
    brand: { "@type": "Brand", name: "Begina" },
    ...(category ? { category: category.name } : {}),
    url,
    offers: product.variants.map((variant) => ({
      "@type": "Offer",
      sku: variant.sku,
      ...(variant.label ? { name: `${product.name} – ${variant.label}` } : {}),
      price: variant.priceKc.toFixed(2),
      priceCurrency: "CZK",
      availability,
      itemCondition: "https://schema.org/NewCondition",
      url,
      seller: { "@type": "Organization", name: "Begina" },
      ...(offerShippingDetails(variant.weightGrams ?? null) ? { shippingDetails: offerShippingDetails(variant.weightGrams ?? null) } : {}),
      hasMerchantReturnPolicy: offerReturnPolicy(product),
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${PUBLIC_ORIGIN}${item.path}`,
    })),
  };
}

export function organizationJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Begina",
      url: `${PUBLIC_ORIGIN}/`,
      logo: `${PUBLIC_ORIGIN}/og-begina-ctverec.png`,
      email: "info@begina.cz",
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Begina",
      url: `${PUBLIC_ORIGIN}/`,
      inLanguage: "cs",
    },
  ];
}
