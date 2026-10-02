import type { Metadata } from "next";
import InfoPageView from "@/components/eshop/InfoPageView";
import { INFO_PAGES } from "@/lib/eshop/infoPages";

const page = INFO_PAGES.shipping;

export const metadata: Metadata = { title: page.title, description: page.description };

export default function Page() {
  return <InfoPageView page={page} />;
}
