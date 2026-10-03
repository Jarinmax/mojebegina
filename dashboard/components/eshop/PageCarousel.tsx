import EshopCarousel from "./EshopCarousel";
import { getCatalog } from "@/lib/eshop/catalogServer";
import { categoryCarousel, waterCarousel } from "@/lib/eshop/pageCarousel";

// Kolotoč pod obsahem stránky (O nás, O vodě, Doprava, Obchodní podmínky,
// GDPR, kategorie, produkt). Košík, pokladna a stránka objednávky ho nemají,
// aby nerozptyloval při nákupu.
export default async function PageCarousel({
  content = "categories",
  exceptCategory,
}: {
  content?: "categories" | "water";
  /** na stránce kategorie se tatáž kategorie v kolotoči neopakuje */
  exceptCategory?: string;
}) {
  const catalog = await getCatalog();
  const { label, tiles } = content === "water" ? waterCarousel(catalog) : categoryCarousel(catalog, exceptCategory);
  // Stejná šířka jako textové stránky — i na širší stránce kategorie
  // a produktu pruh s názvem zakryje název zapečený ve fotce kategorie.
  return (
    <div className="max-w-3xl mx-auto">
      <EshopCarousel label={label} tiles={tiles} />
    </div>
  );
}
