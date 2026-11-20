// IndexNow — denní ohlášení změn Bingu a dalším vyhledávačům (20. 11. 2026, Lucie).
// Ohlásí produkty změněné za posledních 25 hodin; po novém nasazení webu (build
// mladší než 25 hodin) všechny adresy ze sitemapy. Autorizace jako u ostatních
// cronů: "Authorization: Bearer $CRON_SECRET".
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { PUBLIC_ORIGIN } from "@/lib/site/hosts";
import { deployedRecently, submitIndexNow } from "@/lib/site/indexNow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const urls: string[] = [];
  try {
    const rows = (
      await db.execute(sql`
        SELECT DISTINCT p.slug FROM products p
        LEFT JOIN product_variants v ON v.product_id = p.id
        WHERE p.is_active AND (p.updated_at > now() - interval '25 hours' OR v.updated_at > now() - interval '25 hours')`)
    ).rows as { slug: string }[];
    urls.push(...rows.filter((row) => row.slug !== "ochutnavka-do-provozu").map((row) => `${PUBLIC_ORIGIN}/produkt/${row.slug}`));
  } catch (error) {
    console.error("IndexNow: změněné produkty se nepodařilo načíst", String(error).slice(0, 200));
  }
  const fresh = deployedRecently(process.env.BEGINA_BUILD_TIME, new Date(), 25);
  if (fresh) {
    try {
      const sitemap = await fetch(`${PUBLIC_ORIGIN}/sitemap.xml`, { cache: "no-store", signal: AbortSignal.timeout(10_000) }).then((r) => r.text());
      urls.push(...[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
    } catch (error) {
      console.error("IndexNow: sitemapu se nepodařilo načíst", String(error).slice(0, 200));
    }
  }
  const result = await submitIndexNow(urls);
  if (!result.ok) console.error("IndexNow: ohlášení se nepodařilo", result.status);
  return Response.json({ ...result, deployedRecently: fresh });
}
