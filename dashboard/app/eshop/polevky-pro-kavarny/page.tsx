import type { Metadata } from "next";
import { pageShareMeta } from "@/lib/eshop/shareMeta";
import { notFound } from "next/navigation";
import LandingPageView from "@/components/eshop/LandingPageView";
import { findLandingPage } from "@/lib/eshop/landingPages";
import { applyFuelSurchargeFromDb } from "@/lib/eshop/fuelSurchargeServer";
import { withSoupPackLead } from "@/lib/eshop/soupPackFaq";
import { loadSoupPackOffer } from "@/lib/eshop/soupPackOfferServer";

const page = findLandingPage("/polevky-pro-kavarny");

export const metadata: Metadata = page ? { title: page.title, description: page.description, alternates: { canonical: page.path }, ...pageShareMeta(page.title, page.description, page.path) } : {};

export default async function Page() {
  // aktuální palivový příplatek (MojeBegina) před výpočtem tabulky porcí
  await applyFuelSurchargeFromDb();
  const live = findLandingPage("/polevky-pro-kavarny");
  if (!live) notFound();
  // ochutnávka polévek na začátek odpovědi o ochutnávce (24. 11. 2026)
  const faq = withSoupPackLead(live.faq, await loadSoupPackOffer());
  return <LandingPageView page={{ ...live, faq }} />;
}
