import ShopLink from "./ShopLink";
import Image from "next/image";
import { stripCategories, type HomeCategory } from "@/lib/eshop/homeNav";

// Pruh kategorií s kreslenými ikonami pod hero (návrh úvodní stránky).
// Na počítači kompaktní, aby byl vidět hned po otevření stránky (spolu s hero).
// Mobil a tablet na výšku: dvě řady po třech; od md jedna řada všech šesti.
export default function CategoryIconStrip({ id, categories }: { id: string; categories: HomeCategory[] }) {
  return (
    <nav id={id} aria-label="Kategorie" className="bg-[#FBF8F3] scroll-mt-20">
      <ul className="max-w-5xl mx-auto px-2 py-6 sm:py-8 lg:py-4 flex flex-wrap justify-center gap-y-6">
        {stripCategories(categories).map((category, i) => (
          <li
            key={category.slug}
            className={`w-1/3 md:w-auto md:flex-1 md:min-w-0 ${i > 0 ? "md:border-l md:border-dashed md:border-[#D9CFBF]" : ""}`}
          >
            <ShopLink
              href={`/kategorie/${category.slug}`}
              className="group flex flex-col items-center gap-2 px-2 text-center"
            >
              {/* Všechny ikony mají stejné plátno (stejná zem i výška), takže
                  je stačí zobrazit ve stejné výšce — optická velikost sedí. */}
              <span className="h-[4.5rem] sm:h-20 lg:h-[clamp(4.5rem,11.5vh,6.5rem)] flex items-end">
                <Image
                  src={category.icon}
                  alt=""
                  width={category.iconSize?.[0] ?? 200}
                  height={category.iconSize?.[1] ?? 240}
                  sizes="(min-width: 1024px) 110px, 80px"
                  className="h-full w-auto transition-transform duration-200 group-hover:-translate-y-1"
                />
              </span>
              <span className="text-base leading-[1.35] font-medium text-[#4F5B2B] group-hover:underline underline-offset-4">
                {category.stripLabel}
              </span>
            </ShopLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
