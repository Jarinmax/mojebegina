import { applyFuelSurchargeFromDb } from "@/lib/eshop/fuelSurchargeServer";
import type { Metadata } from "next";
import { pageShareMeta } from "@/lib/eshop/shareMeta";
import InfoPageView from "@/components/eshop/InfoPageView";
import ShopLink from "@/components/eshop/ShopLink";
import { FAQ_CTA, FAQ_ITEMS, FAQ_PAGE, faqBlocks } from "@/lib/eshop/faq";
import { withSoupPackLead } from "@/lib/eshop/soupPackFaq";
import { loadSoupPackOffer } from "@/lib/eshop/soupPackOfferServer";
import { faqJsonLd, jsonLd } from "@/lib/eshop/seo";

// Časté otázky (Lucie 20. 11. 2026) — texty a strukturovaná data FAQPage z lib/eshop/faq.ts.
export const metadata: Metadata = {
  title: FAQ_PAGE.title,
  description: FAQ_PAGE.description,
  alternates: { canonical: FAQ_PAGE.path },
  ...pageShareMeta(FAQ_PAGE.title, FAQ_PAGE.description, FAQ_PAGE.path),
};

export default async function Page() {
  await applyFuelSurchargeFromDb();
  // ochutnávka polévek na začátek odpovědi o ochutnávce, ceny z katalogu a dopravy (24. 11. 2026)
  const items = withSoupPackLead(FAQ_ITEMS, await loadSoupPackOffer());
  const page = { ...FAQ_PAGE, blocks: faqBlocks(items) };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqJsonLd(items)) }} />
      <InfoPageView page={page}>
        <p className="mt-8">
          <ShopLink href={FAQ_CTA.href} className="inline-block rounded-full bg-[#A51C1C] px-6 py-3 text-base font-semibold text-white hover:bg-[#8A1717]">
            {FAQ_CTA.text}
          </ShopLink>
        </p>
      </InfoPageView>
    </>
  );
}
