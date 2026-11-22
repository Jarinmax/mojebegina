import { Check } from "lucide-react";
import ShopLink from "@/components/eshop/ShopLink";
import PortionPriceTable from "@/components/eshop/PortionPriceTable";
import { faqJsonLd, jsonLd, breadcrumbJsonLd } from "@/lib/eshop/seo";
import { LANDING_TASTING_LINK, type LandingPage } from "@/lib/eshop/landingPages";

// Stránka pro konkrétní dotaz (20. 11. 2026): úvod, výhody, otázky a odpovědi,
// odkazy na produkty a ochutnávku. Data: lib/eshop/landingPages.ts.
export default function LandingPageView({ page }: { page: LandingPage }) {
  return (
    <article className="max-w-3xl mx-auto w-full px-4 py-8 sm:py-12 flex flex-col gap-8 text-[#2A2622]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqJsonLd(page.faq)) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd([{ name: "Begina", path: "/" }, { name: page.title, path: page.path }])) }}
      />
      <header>
        <h1 className="font-serif text-3xl sm:text-4xl leading-tight text-balance">{page.title}</h1>
        {page.intro.map((paragraph) => (
          <p key={paragraph} className="mt-3 text-lg leading-normal text-neutral-700">
            {paragraph}
          </p>
        ))}
        {page.ctas ? (
          // dvě tlačítka: vzorky / domluvit dodávky (dokument ChatGPT, 22. 11. 2026)
          <div className="mt-5 flex flex-wrap gap-3">
            {page.ctas.map((cta, i) => (
              <ShopLink
                key={cta.href}
                href={cta.href}
                className={
                  i === 0
                    ? "inline-flex items-center justify-center rounded-lg bg-[#A51C1C] hover:bg-[#8C1717] text-white font-semibold px-6 h-12 text-base"
                    : "inline-flex items-center justify-center rounded-lg border-2 border-[#5E6B34] text-[#4A5527] hover:bg-[#FAF6EF] font-semibold px-6 h-12 text-base"
                }
              >
                {cta.label}
              </ShopLink>
            ))}
          </div>
        ) : (
          <ShopLink href={LANDING_TASTING_LINK.href} className="mt-5 inline-flex items-center justify-center rounded-lg bg-[#A51C1C] hover:bg-[#8C1717] text-white font-semibold px-6 h-12 text-base">
            {LANDING_TASTING_LINK.label}
          </ShopLink>
        )}
      </header>

      {page.priceTable && (
        <section>
          <h2 className="font-serif text-2xl mb-4">{page.priceTable.title}</h2>
          <PortionPriceTable rows={page.priceTable.rows} kind={page.priceTable.kind} />
          <p className="mt-3 text-sm leading-normal text-neutral-600">{page.priceTable.note}</p>
        </section>
      )}

      <section>
        <h2 className="font-serif text-2xl mb-4">Proč Begina</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {page.benefits.map((benefit) => (
            <li key={benefit.title} className="rounded-2xl bg-[#FAF6EF] border border-[#EDE5D8] p-4 flex gap-3">
              <Check className="flex-none w-6 h-6 text-[#5E6B34]" aria-hidden="true" />
              <div>
                <h3 className="font-semibold text-lg leading-snug">{benefit.title}</h3>
                <p className="mt-1 text-base leading-normal text-neutral-700">{benefit.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-serif text-2xl mb-4">Časté otázky</h2>
        <div className="flex flex-col gap-4">
          {page.faq.map((item) => (
            <div key={item.question}>
              <h3 className="font-semibold text-lg leading-snug">{item.question}</h3>
              <p className="mt-1 text-base leading-normal text-neutral-700">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-serif text-2xl mb-4">Produkty</h2>
        <ul className="flex flex-wrap gap-2">
          {page.links.map((link) => (
            <li key={link.href}>
              <ShopLink href={link.href} className="inline-flex rounded-full border border-[#5E6B34] px-4 py-2 text-base text-[#4A5527] hover:bg-[#FAF6EF]">
                {link.label}
              </ShopLink>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-base text-neutral-700">
          Ceny jsou stejné jako na e-shopu. Při pravidelném odběru získáte slevu 3 až 7 % v{" "}
          <ShopLink href="/partnersky-program" className="underline underline-offset-4">
            partnerském programu
          </ShopLink>
          .
        </p>
      </section>
    </article>
  );
}
