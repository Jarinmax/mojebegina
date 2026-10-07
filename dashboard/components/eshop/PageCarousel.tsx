import EshopCarousel from "./EshopCarousel";
import { getCatalog } from "@/lib/eshop/catalogServer";
import { categoryCarousel, waterCarousel } from "@/lib/eshop/pageCarousel";

// Kolotoč pod obsahem stránky (O nás, O vodě, Doprava, Obchodní podmínky,
// GDPR, produkt). Stránka kategorie ho nemá — mají tam být jen produkty té
// kategorie (rozhodnutí vedení 5. 10. 2026). Košík, pokladna a stránka
// objednávky ho nemají, aby nerozptyloval při nákupu.
export default async function PageCarousel({
  content = "categories",
}: {
  content?: "categories" | "water";
}) {
  const catalog = await getCatalog();
  const { label, tiles } = content === "water" ? waterCarousel(catalog) : categoryCarousel(catalog);
  // Stejná šířka jako textové stránky — i na širší stránce kategorie
  // a produktu pruh s názvem zakryje název zapečený ve fotce kategorie.
  return (
    <div className="max-w-3xl mx-auto">
      <EshopCarousel label={label} tiles={tiles} />
    </div>
  );
}
