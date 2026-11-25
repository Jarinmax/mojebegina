// SEO – noční stažení pozic z Google Search Console do seo_gsc_daily (25. 11. 2026, Lucie).
// Stahuje posledních 10 dní (Google data za poslední dny ještě doplňuje) a přepíše je.
// Autorizace jako u ostatních cronů: "Authorization: Bearer $CRON_SECRET".
import { fetchSearchAnalytics, parseServiceAccount } from "@/lib/seo/gsc";
import { gscTableExists, saveGscRows } from "@/lib/seo/gscServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const account = parseServiceAccount(process.env.GSC_SERVICE_ACCOUNT_JSON);
  if (!account) return Response.json({ ok: false, reason: "GSC_SERVICE_ACCOUNT_JSON chybí nebo je vadný" });
  if (!(await gscTableExists())) return Response.json({ ok: false, reason: "tabulka seo_gsc_daily chybí (skript 158)" });

  const url = new URL(request.url);
  const backDays = Math.min(480, Math.max(3, Number(url.searchParams.get("dni")) || 10));
  const end = new Date();
  const start = new Date(end.getTime() - backDays * 86_400_000);
  try {
    const rows = await fetchSearchAnalytics(account, isoDay(start), isoDay(end));
    const saved = await saveGscRows(rows);
    return Response.json({ ok: true, from: isoDay(start), to: isoDay(end), rows: saved });
  } catch (error) {
    console.error("SEO GSC:", String(error).slice(0, 300));
    return Response.json({ ok: false, reason: String(error).slice(0, 300) }, { status: 502 });
  }
}
