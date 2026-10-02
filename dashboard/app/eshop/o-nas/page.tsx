import type { Metadata } from "next";
import InfoPageView from "@/components/eshop/InfoPageView";
import CategoryCarousel from "@/components/eshop/CategoryCarousel";
import { getCatalog } from "@/lib/eshop/catalogServer";
import { INFO_PAGES } from "@/lib/eshop/infoPages";

const page = INFO_PAGES.about;

export const metadata: Metadata = { title: page.title, description: page.description };

// Pod textem kolotoč kategorií jako na begina.cz/o-nas (data z katalogu v DB).
export default async function Page() {
  const { categories } = await getCatalog();
  return (
    <InfoPageView page={page}>
      <CategoryCarousel label="Naše produkty" categories={categories.filter((c) => c.image)} />
    </InfoPageView>
  );
}
