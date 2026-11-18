// Historie nákupů kontaktů v CRM podle faktur v iDokladu (zadání Lucie
// 18. 11. 2026). Noční běh (Vercel Cron) faktury načte, spáruje s kontakty
// a uloží do lead_purchase_history — u kontaktu se pak ukáže „Co kupoval“.
// ?nahled=<kód> jen spočítá počty a ukázku bez jmen, nic neukládá.
// Do iDokladu se vždy jen čte.
// Autorizace cronu jako jinde: "Authorization: Bearer $CRON_SECRET".
import { db } from "@/lib/db/client";
import { loadHistoryLeads, loadIdokladInvoices, summarizeTrial, syncPurchaseHistory } from "@/lib/data/purchaseHistorySync";

const TRIAL_CODE = "zkouska-historie-9k2v7m4x";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cronSecret = process.env.CRON_SECRET;
  const authorized = Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
  const trial = url.searchParams.get("nahled") === TRIAL_CODE;
  if (!trial && !authorized) return new Response("Unauthorized", { status: 401 });
  try {
    if (!trial) return Response.json(await syncPurchaseHistory(db));
    const load = await loadIdokladInvoices();
    if (load.status !== "ok") return Response.json({ status: load.status });
    return Response.json({ status: "ok", trial: summarizeTrial(await loadHistoryLeads(db), load) });
  } catch (error) {
    return Response.json({ status: "error", error: error instanceof Error ? error.message.slice(0, 300) : "neznámá chyba" }, { status: 500 });
  }
}
