import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import logoMark from "@/public/logo-begina-mark.png";
import CartLink from "@/components/eshop/CartLink";
import CatalogProvider from "@/components/eshop/CatalogProvider";
import { EshopBaseProvider } from "@/components/eshop/EshopBase";
import ShopLink from "@/components/eshop/ShopLink";
import { currentSite, eshopBase } from "@/lib/eshop/siteServer";
import { indexingEnabled } from "@/lib/site/flags";
import { PUBLIC_ORIGIN } from "@/lib/site/hosts";
import PreviewBanner from "@/components/eshop/PreviewBanner";
import EshopFooter from "@/components/eshop/EshopFooter";
import { isEshopPublic, storeMode } from "@/lib/eshop/storeMode";
import { MOJE_BEGINA_LINK, availableHomeCategories, mainMenu } from "@/lib/eshop/homeNav";
import MainNav from "@/components/eshop/MainNav";
import { INFO_PAGES } from "@/lib/eshop/infoPages";
import { getCatalog } from "@/lib/eshop/catalogServer";
import CatalogUnavailable from "@/components/eshop/CatalogUnavailable";
import Marketing from "@/components/eshop/Marketing";
import { marketingConfig } from "@/lib/eshop/marketing";
import { SHARE_DESCRIPTION, SHARE_TITLE, brandShareMeta } from "@/lib/eshop/shareMeta";

// E-shop — veřejná část bez přihlášení. Žádná stránka pod /eshop nevolá
// requireCustomerContext ani nečte session. Na begina.cz běží tytéž stránky
// bez prefixu /eshop (proxy.ts). Indexovat smí vyhledávač jen begina.cz
// a jen s ESHOP_INDEXING=on; kanonické adresy vždy na https://begina.cz.
export async function generateMetadata(): Promise<Metadata> {
  const index = (await currentSite()) === "public" && indexingEnabled();
  return {
    metadataBase: new URL(PUBLIC_ORIGIN),
    title: {
      default: SHARE_TITLE,
      template: "%s | E-shop Begina",
    },
    description: SHARE_DESCRIPTION,
    // náhled při sdílení: logo Begina (lib/eshop/shareMeta.ts); produkty mají vlastní
    ...brandShareMeta(),
    robots: index ? { index: true, follow: true } : { index: false, follow: false },
  };
}

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
  // Menu podle zadání Lucie (6. 11. 2026): kategorie z katalogu, nápoje
  // v rozbalovací nabídce, za nimi rozbalovací „O nás“ (Náš příběh, O vodě,
  // O balení) a MojeBegina (9. 11. 2026).
  const menu = mainMenu(availableHomeCategories((catalog ?? EMPTY_CATALOG).categories.map((c) => c.slug)), [
    {
      kind: "group",
      label: "O nás",
      items: [
        { kind: "link", href: INFO_PAGES.about.path, label: "Náš příběh" },
        { kind: "link", href: INFO_PAGES.water.path, label: "O vodě" },
        { kind: "link", href: INFO_PAGES.packaging.path, label: "O balení" },
      ],
    },
    MOJE_BEGINA_LINK,
  ]);
  // Cookie lišta a Meta Pixel — jen se zapnutým přepínačem (výchozí vypnuto).
  const marketing = marketingConfig();
  return (
    <EshopBaseProvider base={await eshopBase()}>
    <CatalogProvider catalog={catalog ?? EMPTY_CATALOG}>
    <div data-eshop className="min-h-screen flex flex-col bg-white text-begina-primary-900">
      <PreviewBanner mode={storeMode()} />
      <header className="border-b border-neutral-200 bg-white sticky top-0 z-20 print:hidden">
        <div className="max-w-6xl mx-auto px-4 h-16 xl:h-[5.25rem] flex items-center justify-between gap-4 xl:gap-6">
          {/* Počítač (xl+): logo větší (9. 11. 2026: +20 %, pak značka ještě +15 %;
              soubor loga nemá prázdné okraje, zvětšuje se skutečná značka).
              Mobil a tablet beze změny. */}
          <ShopLink href="/" className="flex items-center gap-2.5 xl:gap-3 shrink-0" aria-label="Begina.cz — úvod">
            <Image src={logoMark} alt="" className="h-9 xl:h-[3.1rem] w-auto" priority />
            <span className="flex flex-col leading-tight">
              <span className="font-serif text-lg xl:text-[1.55rem] tracking-wide uppercase">Begina.cz</span>
              <span className="text-[11px] xl:text-[15px] italic text-neutral-500">Když rozhoduje chuť</span>
            </span>
          </ShopLink>
          <MainNav entries={menu} variant="desktop" />
          <div className="flex items-center gap-1 shrink-0">
            <CartLink />
            {/* Mobil a tablet: menu pod ikonou ☰ (košík zůstává v záhlaví). */}
            <MainNav entries={menu} variant="mobile" />
          </div>
        </div>
      </header>

      <main className="flex-1">{catalog ? children : <CatalogUnavailable />}</main>

      <EshopFooter cookieSettings={marketing !== null} />
      {marketing && <Marketing config={marketing} />}
    </div>
    </CatalogProvider>
    </EshopBaseProvider>
  );
}
