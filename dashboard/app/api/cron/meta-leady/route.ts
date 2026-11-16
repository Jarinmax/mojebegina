// Leady z formuláře Meta → CRM (Vercel Cron, několik běhů denně, viz
// vercel.json). Logika: lib/data/metaLeads.ts. Autorizace jako u ostatních
// cronů: "Authorization: Bearer $CRON_SECRET".
import { db } from "@/lib/db/client";
import { importMetaLeads } from "@/lib/data/metaLeads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await importMetaLeads(db);
  if (result.status === "error") console.error("meta-leady cron", result.error);
  return Response.json(
    result.status === "ok"
      ? { status: "ok", rowsRead: result.rowsRead, created: result.created.length, matched: result.matched.length, alreadyImported: result.alreadyImported, skipped: result.skipped.length }
      : result
  );
}
