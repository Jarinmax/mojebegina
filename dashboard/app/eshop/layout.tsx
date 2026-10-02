import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import logoMark from "@/public/logo-begina-mark.png";
import CartLink from "@/components/eshop/CartLink";
import CatalogProvider from "@/components/eshop/CatalogProvider";
import PreviewBanner from "@/components/eshop/PreviewBanner";
import EshopFooter from "@/components/eshop/EshopFooter";
import { isEshopPublic, storeMode } from "@/lib/eshop/storeMode";
import { getCatalog } from "@/lib/eshop/catalogServer";
import CatalogUnavailable from "@/components/eshop/CatalogUnavailable";

// E-shop 1.0 (náhled) — veřejná část bez přihlášení. Žádná stránka pod
// /eshop nevolá requireCustomerContext ani nečte session. Dokud jde
// o náhled, nesmí se indexovat.
export const metadata: Metadata = {
  title: {
    default: "E-shop Begina",
    template: "%s | E-shop Begina",
  },
  description: "Polévky Begina s doručením.",
  robots: { index: false, follow: false },
};

// Katalog se čte z DB při každém požadavku — build DB nepotřebuje a změna
// v katalogu se projeví hned.
export const dynamic = "force-dynamic";

const EMPTY_CATALOG = { categories: [], products: [] };

export default async function EshopLayout({ children }: LayoutProps<"/eshop">) {
  // Production do spuštění: celý /eshop jako neexistující (404), bez dotazu do DB.
  if (!isEshopPublic()) {
    notFound();
  }
  // error.tsx chytá chyby stránek, ne tohoto layoutu — nedostupnou DB (nebo
  // chybějící migrace 0013/0014 na dané větvi) proto řeší layout sám:
  // zákazník uvidí zprávu, chyba jde do serverového logu.
  const catalog = await getCatalog().catch((error: unknown) => {
    console.error("E-shop: katalog z DB se nepodařilo načíst", error);
    return null;
  });
  return (
    <CatalogProvider catalog={catalog ?? EMPTY_CATALOG}>
    <div className="min-h-screen flex flex-col bg-white text-begina-primary-900">
      <PreviewBanner mode={storeMode()} />
      <header className="border-b border-neutral-200 bg-white sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/eshop" className="flex items-center gap-2.5" aria-label="Begina.cz — úvod">
            <Image src={logoMark} alt="" className="h-9 w-auto" priority />
            <span className="flex flex-col leading-tight">
              <span className="font-serif text-lg tracking-wide uppercase">Begina.cz</span>
              <span className="text-[11px] italic text-neutral-500">Když rozhoduje chuť</span>
            </span>
          </Link>
          <CartLink />
        </div>
      </header>

      <main className="flex-1">{catalog ? children : <CatalogUnavailable />}</main>

      <EshopFooter />
    </div>
    </CatalogProvider>
  );
}
