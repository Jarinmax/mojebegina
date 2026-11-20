// Klíč IndexNow na https://begina.cz/<klíč>.txt (lib/site/indexNow.ts). Vyhledávač si
// jím ověří, že ohlášení změn posílá vlastník webu.
import { currentSite } from "@/lib/eshop/siteServer";
import { INDEXNOW_KEY } from "@/lib/site/indexNow";

export const dynamic = "force-dynamic";

export async function GET() {
  if ((await currentSite()) !== "public") return new Response("Not Found", { status: 404 });
  return new Response(INDEXNOW_KEY, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
