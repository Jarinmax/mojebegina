import type { Metadata } from "next";
import { INFO_PAGES } from "@/lib/eshop/infoPages";

const page = INFO_PAGES.partner;

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  alternates: { canonical: page.path },
};

// Vlastní rozložení (14. 11. 2026): na počítači úrovně vlevo a podmínky
// vpravo, aby se celý program vešel na obrazovku bez posouvání. Texty jsou
// v lib/eshop/infoPages.ts (INFO_PAGES.partner), tady se nic nepřepisuje.
export default function Page() {
  const [benefits, tiers, conditions, shipping] = page.blocks ?? [];
  return (
    <article className="max-w-5xl mx-auto px-4 py-6 sm:py-8 text-neutral-700 leading-relaxed">
      <h1 className="text-2xl leading-tight font-semibold tracking-tight text-begina-primary-900">{page.title}</h1>
      {page.subtitle && <p className="mt-1 text-sm text-neutral-500">{page.subtitle}</p>}
      <ul className="mt-3 flex flex-col sm:flex-row sm:flex-wrap gap-x-6 gap-y-1">
        {benefits?.items?.map((item) => <li key={item}>✔ {item}</li>)}
      </ul>
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
        <section>
          <h2 className="font-medium text-lg text-begina-primary-900 mb-2">{tiers?.heading}</h2>
          <table className="w-full border-separate border-spacing-y-1">
            <tbody>
              {tiers?.rows?.map(([left, right]) => (
                <tr key={left} className="bg-neutral-50">
                  <th scope="row" className="text-left font-normal px-3 py-2 rounded-l-lg">{left}</th>
                  <td className="font-medium text-begina-primary-900 px-3 py-2 rounded-r-lg">{right}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h2 className="font-medium text-lg text-begina-primary-900 mb-2">{conditions?.heading}</h2>
          <ul className="flex flex-col gap-1.5 list-disc pl-5">
            {conditions?.items?.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      </div>
      <p className="mt-5">
        <strong className="font-medium text-begina-primary-900">{shipping?.heading}:</strong> {shipping?.paragraphs?.[0]}{" "}
        {shipping?.afterParagraphs?.[0]}
      </p>
    </article>
  );
}
