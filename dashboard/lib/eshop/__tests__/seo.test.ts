import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd, categoryDescription, jsonLd, organizationJsonLd, plainText, productDescription, productJsonLd, productTitle, truncate } from "../seo";
import type { Category, Product } from "../types";

const category = { slug: "sirupy", name: "Bylinné sirupy", image: null, intro: ["Bylinné sirupy připravujeme **řemeslně** z výluhů."], detailSections: [] } as unknown as Category;
const product = {
  slug: "lipovy-sirup",
  name: "Lipový sirup",
  category: "sirupy",
  shortDescription: "3 l: až 150 nápojů (cca 3,70 Kč za nápoj). 650 ml: až 32 nápojů. Při ředění 1 : 10.",
  highlights: [],
  description: ["Lipový sirup je **jemný** sirup s květinovou vůní lipového květu.", "## Pro koho je vhodný", "- pro děti i dospělé"],
  taste: null,
  warnings: [],
  image: "/eshop/sirupy/lipovy-sirup.jpg",
  gallery: [{ url: "/eshop/sirupy/lipovy-sirup.jpg", alt: "Lipový sirup" }, { url: "https://cdn.example/x.jpg", alt: null }],
  variants: [
    { sku: "lipovy-sirup-750ml", label: "650 ml", priceKc: 199 },
    { sku: "lipovy-sirup-3l", label: "3 l", priceKc: 549 },
  ],
  alcoholPercent: null,
  isAgeRestricted: false,
  foodInfo: { allergens: [] },
} as unknown as Product;

describe("seo", () => {
  it("prostý text a zkrácení na celé slovo", () => {
    expect(plainText("## Nadpis\n- **tučně** a [odkaz](https://x)")).toBe("Nadpis tučně a odkaz");
    const t = truncate("slovo ".repeat(60));
    expect(t.length).toBeLessThanOrEqual(158);
    expect(t.endsWith("…")).toBe(true);
    expect(t).not.toMatch(/\s…$/);
  });

  it("popis kategorie obsahuje názvy produktů a úvod; popis a název produktu", () => {
    const d = categoryDescription(category, [product]);
    expect(d).toBe("Bylinné sirupy Begina: Lipový sirup. Bylinné sirupy připravujeme řemeslně z výluhů.");
    expect(productDescription(product)).toBe("Lipový sirup je jemný sirup s květinovou vůní lipového květu.");
    expect(productTitle(product, category)).toBe("Lipový sirup – Bylinné sirupy");
    expect(productTitle(product, null)).toBe("Lipový sirup");
  });

  it("Product JSON-LD: nabídka za každé balení v CZK, absolutní fotky, bez vymyšlených hodnocení", () => {
    const ld = productJsonLd(product, category);
    expect(ld.offers.map((o) => [o.sku, o.price, o.priceCurrency, o.availability])).toEqual([
      ["lipovy-sirup-750ml", "199.00", "CZK", "https://schema.org/InStock"],
      ["lipovy-sirup-3l", "549.00", "CZK", "https://schema.org/InStock"],
    ]);
    expect(ld.image).toEqual(["https://begina.cz/eshop/sirupy/lipovy-sirup.jpg", "https://cdn.example/x.jpg"]);
    expect(ld.url).toBe("https://begina.cz/produkt/lipovy-sirup");
    expect(JSON.stringify(ld)).not.toMatch(/aggregateRating|review/);
    const blocked = productJsonLd({ ...product, foodInfo: { ...product.foodInfo, allergens: null } } as unknown as Product, category);
    expect(blocked.offers[0].availability).toBe("https://schema.org/OutOfStock");
  });

  it("drobečková navigace, organizace a bezpečné vložení do <script>", () => {
    expect(breadcrumbJsonLd([{ name: "Begina", path: "/" }, { name: "Bylinné sirupy", path: "/kategorie/sirupy" }]).itemListElement[1]).toEqual({
      "@type": "ListItem",
      position: 2,
      name: "Bylinné sirupy",
      item: "https://begina.cz/kategorie/sirupy",
    });
    expect(organizationJsonLd()[0]).toMatchObject({ "@type": "Organization", name: "Begina", url: "https://begina.cz/" });
    expect(jsonLd({ a: "</script><script>" })).not.toContain("</script>");
  });
});
