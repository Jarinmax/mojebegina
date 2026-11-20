// /llms.txt na begina.cz (20. 11. 2026): krátký popis Beginy pro jazykové modely
// a odkazy na hlavní stránky. Text v lib/site/llmsTxt.ts.
import { currentSite } from "@/lib/eshop/siteServer";
import { isEshopPublic } from "@/lib/eshop/storeMode";
import { llmsTxt } from "@/lib/site/llmsTxt";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isEshopPublic() || (await currentSite()) !== "public") return new Response("Not Found", { status: 404 });
  return new Response(llmsTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
