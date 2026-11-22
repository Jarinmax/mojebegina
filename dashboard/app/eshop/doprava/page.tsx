import type { Metadata } from "next";
import { pageShareMeta } from "@/lib/eshop/shareMeta";
import InfoPageView from "@/components/eshop/InfoPageView";
import PageCarousel from "@/components/eshop/PageCarousel";
import { INFO_PAGES, shippingPageFor } from "@/lib/eshop/infoPages";
import { shippingModeFromEnv, zasilkovnaEnabledFromEnv } from "@/lib/eshop/shipping";
import { applyFuelSurchargeFromDb } from "@/lib/eshop/fuelSurchargeServer";

const page = INFO_PAGES.shipping;

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  alternates: { canonical: page.path },
  ...pageShareMeta(page.title, page.description, page.path),
};

export default async function Page() {
  // ceník s aktuálním palivovým příplatkem z MojeBegina
  await applyFuelSurchargeFromDb();
  return (
    // Ceník podle hmotnosti jen s ESHOP_WEIGHT_SHIPPING=on (jinak dosavadní text).
    <InfoPageView page={shippingPageFor(shippingModeFromEnv(), { zasilkovna: zasilkovnaEnabledFromEnv() })}>
      <PageCarousel />
    </InfoPageView>
  );
}
