import Link from "next/link";
import { Check, Snowflake } from "lucide-react";
import { categories, productsInCategory } from "@/lib/eshop/catalog";
import { formatKc } from "@/lib/format";
import ProductImage from "@/components/eshop/ProductImage";
import AddToCartButton from "@/components/eshop/AddToCartButton";

// Texty v úvodu a v "Proč Begina" jsou převzaté doslova ze stávajícího
// begina.cz, aby náhled mluvil stejným jazykem jako dnešní web.
const whyBegina = [
  "pečlivý výběr kvalitních surovin",
  "promyšlené kombinace chutí",
  "důraz na vyváženost receptur",
  "poctivá česká výroba",
];

const filteredWater = [
  "je základem každé naší receptury",
  "nechává vyniknout přirozenou chuť surovin",
  "pomáhá zachovat čistý a vyvážený chuťový profil",
];

export default function EshopPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
      <section className="mb-6 sm:mb-8 text-center max-w-2xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3 text-balance">
          Čerstvé polévky, bylinné sirupy, čaje, ovocné nápoje i alkoholické koktejly
        </h1>
        <p className="text-neutral-600">Z pečlivě vybraných surovin a čisté filtrované vody</p>
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium">
          <Snowflake className="w-4 h-4 text-neutral-500" />
          Všechny produkty doručujeme chlazenou přepravou
        </p>
      </section>

      <nav aria-label="Kategorie" className="mb-8 sm:mb-10 -mx-4 px-4 overflow-x-auto">
        <ul className="flex sm:justify-center gap-2 w-max sm:w-auto mx-auto">
          {categories.map((category) => (
            <li key={category.slug}>
              <a
                href={`#${category.slug}`}
                className="block whitespace-nowrap border border-neutral-200 rounded-full px-3.5 py-1.5 text-sm hover:border-begina-primary-900"
              >
                {category.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-12">
        {categories.map((category) => {
          const items = productsInCategory(category.slug);
          return (
            <section key={category.slug} id={category.slug} className="scroll-mt-20" aria-labelledby={`${category.slug}-title`}>
              <h2 id={`${category.slug}-title`} className="text-xl font-semibold tracking-tight mb-4">
                {category.name}
              </h2>
              {items.length === 0 ? (
                <p className="border border-dashed border-neutral-300 rounded-2xl px-4 py-6 text-sm text-neutral-500 text-center">
                  Nabídku doplníme.
                </p>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {items.map((product) => (
                    <li key={product.slug} className="flex flex-col border border-neutral-200 rounded-2xl p-3 bg-white">
                      <Link href={`/eshop/produkt/${product.slug}`} className="group flex flex-col flex-1">
                        <ProductImage name={product.name} />
                        <div className="px-1 pt-3 flex-1">
                          <h3 className="font-medium group-hover:underline underline-offset-2">{product.name}</h3>
                          <p className="text-sm text-neutral-500 mt-0.5">{product.shortDescription}</p>
                        </div>
                      </Link>
                      <div className="px-1 pt-3 flex items-center justify-between gap-3">
                        <p className="font-semibold tabular-nums">{formatKc(product.priceKc)}</p>
                        <div className="w-32">
                          <AddToCartButton slug={product.slug} name={product.name} compact />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <section className="mt-14 border-t border-neutral-200 pt-10 grid grid-cols-1 sm:grid-cols-2 gap-8">
        {[
          { title: "Proč Begina", items: whyBegina },
          { title: "Čistá filtrovaná voda", items: filteredWater },
        ].map((block) => (
          <div key={block.title}>
            <h2 className="font-semibold mb-3">{block.title}</h2>
            <ul className="flex flex-col gap-2 text-neutral-700">
              {block.items.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="w-4 h-4 mt-1 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
