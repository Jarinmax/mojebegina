// /sitemap.xml na begina.cz (proxy.ts sem přepíše /sitemap.xml): úvod,
// kategorie s produkty, aktivní produkty (i ty, které zatím nejdou
// objednat — stránka existuje) a informační stránky. Adresy vždy na
// https://begina.cz. Na jiné doméně neexistuje.
import { getCatalog } from "@/lib/eshop/catalogServer";
import { INFO_PAGES } from "@/lib/eshop/infoPages";
import { currentSite } from "@/lib/eshop/siteServer";
import { isEshopPublic } from "@/lib/eshop/storeMode";
import { sitemapXml } from "@/lib/site/seo";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isEshopPublic() || (await currentSite()) !== "public") {
    return new Response("Not Found", { status: 404 });
  }
  const catalog = await getCatalog();
  const withProducts = new Set(catalog.products.map((product) => product.category));
  const paths = [
    "/",
    ...catalog.categories.filter((category) => withProducts.has(category.slug)).map((category) => `/kategorie/${category.slug}`),
    ...catalog.products.map((product) => `/produkt/${product.slug}`),
    ...Object.values(INFO_PAGES).map((page) => page.path),
  ];
  return new Response(sitemapXml(paths), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
