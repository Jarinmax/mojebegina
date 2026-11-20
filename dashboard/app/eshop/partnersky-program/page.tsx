import type { Metadata } from "next";
import { pageShareMeta } from "@/lib/eshop/shareMeta";
import { INFO_PAGES } from "@/lib/eshop/infoPages";

const page = INFO_PAGES.partner;

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  alternates: { canonical: page.path },
  ...pageShareMeta(page.title, page.description, page.path),
};

// Vlastní rozložení (14. 11. 2026, Lucie): jeden vycentrovaný sloupec —
// úrovně a pod nimi podmínky, kompaktně, aby se program na počítači vešel
// na obrazovku. Texty jsou v lib/eshop/infoPages.ts (INFO_PAGES.partner).
export default function Page() {
  const [benefits, tiers, conditions, shipping] = page.blocks ?? [];
  return (
    <article className="max-w-3xl mx-auto px-4 py-6 text-neutral-700 leading-relaxed">
      <header className="text-center">
        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-begina-primary-900">{page.title}</h1>
        {page.subtitle && <p className="mt-1 text-sm text-neutral-500">{page.subtitle}</p>}
        <ul className="mt-2 flex flex-col sm:flex-row sm:flex-wrap sm:justify-center gap-x-6 gap-y-1 max-w-xl mx-auto">
          {benefits?.items?.map((item) => <li key={item}>✔ {item}</li>)}
        </ul>
      </header>
      <section className="mt-5 max-w-xl mx-auto">
        <h2 className="font-medium text-lg text-begina-primary-900 mb-1.5 text-center">{tiers?.heading}</h2>
        <table className="w-full border-separate border-spacing-y-1">
          <tbody>
            {tiers?.rows?.map(([left, right]) => (
              <tr key={left} className="bg-neutral-50">
                <th scope="row" className="text-left font-normal px-4 py-1.5 rounded-l-lg">{left}</th>
                <td className="text-right font-medium text-begina-primary-900 px-4 py-1.5 rounded-r-lg">{right}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {/* stejná šířka jako tabulka úrovní — odrážky začínají pod jejím levým okrajem */}
      <section className="mt-5 max-w-xl mx-auto">
        <h2 className="font-medium text-lg text-begina-primary-900 mb-1.5 text-center">{conditions?.heading}</h2>
        <ul className="flex flex-col gap-1.5 list-disc pl-5 leading-snug">
          {conditions?.items?.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
      <p className="mt-4 max-w-xl mx-auto text-center text-sm text-neutral-600">
        <strong className="font-medium text-begina-primary-900">{shipping?.heading}:</strong> {shipping?.paragraphs?.[0]}{" "}
        {shipping?.afterParagraphs?.[0]}
      </p>
    </article>
  );
}
