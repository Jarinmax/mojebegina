import { Snowflake } from "lucide-react";
import { getCatalog } from "@/lib/eshop/catalogServer";
import CategoryTile from "@/components/eshop/CategoryTile";
import { filteredWater, whyBegina } from "@/lib/eshop/infoPages";

// Úvodní stránka záměrně stejně čistá jako dnešní begina.cz: úvodní text,
// dlaždice kategorií, "Proč Begina". Produkty jsou až na stránkách
// kategorií. Texty jsou převzaté doslova z begina.cz (lib/eshop/infoPages.ts).
export const dynamic = "force-dynamic";

export default async function EshopPage() {
  const { categories } = await getCatalog();
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-10">
      <section className="text-center max-w-3xl mx-auto">
        <h1 className="text-xl sm:text-2xl text-balance">
          Čerstvé polévky, bylinné sirupy, čaje, ovocné nápoje i alkoholické koktejly
        </h1>
        <p className="mt-3 text-neutral-600">Z pečlivě vybraných surovin a čisté filtrované vody</p>
        <p className="mt-3 font-medium">
          <Snowflake className="inline w-4 h-4 mr-1.5 align-[-2px] text-sky-300" />
          Všechny produkty doručujeme chlazenou přepravou
        </p>
      </section>

      <ul className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-6">
        {categories.map((category) => (
          <li key={category.slug}>
            <CategoryTile category={category} sizes="(min-width: 1024px) 220px, (min-width: 640px) 33vw, 50vw" />
          </li>
        ))}
      </ul>

      <section className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-8 text-center">
        {[
          { title: "Proč Begina", items: whyBegina },
          { title: "Čistá filtrovaná voda", items: filteredWater },
        ].map((block) => (
          <div key={block.title}>
            <h2 className="font-medium text-lg mb-3">{block.title}</h2>
            <ul className="flex flex-col gap-2 text-neutral-700">
              {block.items.map((item) => (
                <li key={item}>✓ {item}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
