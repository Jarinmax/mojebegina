import type { Metadata } from "next";
import InfoPageView from "@/components/eshop/InfoPageView";
import PageCarousel from "@/components/eshop/PageCarousel";
import { INFO_PAGES, shippingPageFor } from "@/lib/eshop/infoPages";
import { shippingModeFromEnv } from "@/lib/eshop/shipping";

const page = INFO_PAGES.shipping;

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  alternates: { canonical: page.path },
};

export default function Page() {
  return (
    // Ceník podle hmotnosti jen s ESHOP_WEIGHT_SHIPPING=on (jinak dosavadní text).
    <InfoPageView page={shippingPageFor(shippingModeFromEnv())}>
      <PageCarousel />
    </InfoPageView>
  );
}
