import Image from "next/image";
import Link from "next/link";
import type { HomeCategory } from "@/lib/eshop/homeNav";

// Pruh kategorií s kreslenými ikonami pod hero (návrh úvodní stránky).
export default function CategoryIconStrip({ id, categories }: { id: string; categories: HomeCategory[] }) {
  return (
    <nav id={id} aria-label="Kategorie" className="bg-[#FBF8F3] scroll-mt-20">
      <ul className="max-w-5xl mx-auto px-2 py-6 sm:py-8 flex flex-wrap justify-center gap-y-6">
        {categories.map((category, i) => (
          <li
            key={category.slug}
            className={`w-1/3 sm:w-auto sm:flex-1 ${i > 0 ? "sm:border-l sm:border-dashed sm:border-[#D9CFBF]" : ""}`}
          >
            <Link
              href={`/eshop/kategorie/${category.slug}`}
              className="group flex flex-col items-center gap-2 px-2 text-center"
            >
              <span className="h-20 sm:h-24 flex items-end">
                <Image
                  src={category.icon}
                  alt=""
                  width={140}
                  height={110}
                  className="max-h-full w-auto transition-transform duration-200 group-hover:-translate-y-1"
                />
              </span>
              <span className="text-sm sm:text-base font-medium text-[#5E6B34] group-hover:underline underline-offset-4">
                {category.stripLabel}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
