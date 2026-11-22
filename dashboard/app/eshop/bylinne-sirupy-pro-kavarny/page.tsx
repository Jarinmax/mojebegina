import type { Metadata } from "next";
import { pageShareMeta } from "@/lib/eshop/shareMeta";
import { notFound } from "next/navigation";
import LandingPageView from "@/components/eshop/LandingPageView";
import { findLandingPage } from "@/lib/eshop/landingPages";
import { applyFuelSurchargeFromDb } from "@/lib/eshop/fuelSurchargeServer";

const page = findLandingPage("/bylinne-sirupy-pro-kavarny");

export const metadata: Metadata = page ? { title: page.title, description: page.description, alternates: { canonical: page.path }, ...pageShareMeta(page.title, page.description, page.path) } : {};

export default async function Page() {
  // aktuální palivový příplatek (MojeBegina) před výpočtem ceny nápoje s dopravou (22. 11. 2026)
  await applyFuelSurchargeFromDb();
  const live = findLandingPage("/bylinne-sirupy-pro-kavarny");
  if (!live) notFound();
  return <LandingPageView page={live} />;
}
