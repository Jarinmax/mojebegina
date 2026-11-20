import type { Metadata } from "next";
import { pageShareMeta } from "@/lib/eshop/shareMeta";
import InfoPageView from "@/components/eshop/InfoPageView";
import PageCarousel from "@/components/eshop/PageCarousel";
import { INFO_PAGES } from "@/lib/eshop/infoPages";

const page = INFO_PAGES.packaging;

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  alternates: { canonical: page.path },
  ...pageShareMeta(page.title, page.description, page.path),
};

export default function Page() {
  return (
    <InfoPageView page={page}>
      <PageCarousel />
    </InfoPageView>
  );
}
