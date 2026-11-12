// /feed-google.xml na begina.cz — katalog pro Google Merchant Center
// (lib/eshop/feeds.ts). Jen na veřejné doméně, jako sitemap.xml.
import { getCatalog } from "@/lib/eshop/catalogServer";
import { googleMerchantFeed } from "@/lib/eshop/feeds";
import { currentSite } from "@/lib/eshop/siteServer";
import { isEshopPublic } from "@/lib/eshop/storeMode";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isEshopPublic() || (await currentSite()) !== "public") {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(googleMerchantFeed(await getCatalog()), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
