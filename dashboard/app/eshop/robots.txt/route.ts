// /robots.txt na begina.cz (proxy.ts sem přepíše /robots.txt). Na jiné
// doméně (moje.begina.cz/eshop/robots.txt) neexistuje.
import { currentSite } from "@/lib/eshop/siteServer";
import { isEshopPublic } from "@/lib/eshop/storeMode";
import { indexingEnabled } from "@/lib/site/flags";
import { publicRobotsTxt } from "@/lib/site/seo";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isEshopPublic() || (await currentSite()) !== "public") {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(publicRobotsTxt(indexingEnabled()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
