// Historie nákupů kontaktů v CRM podle faktur v iDokladu (zadání Lucie
// 18. 11. 2026). Zatím jen ZKUŠEBNÍ spárování: ?nahled=<kód> vrátí počty
// (kolik kontaktů má v iDokladu faktury) a ukázku bez jmen — nic neukládá
// a do iDokladu jen čte. Ukládání a zobrazení u kontaktu přijde podle výsledku.
// Autorizace cronu jako jinde: "Authorization: Bearer $CRON_SECRET".
import { db } from "@/lib/db/client";
import { loadHistoryLeads, loadIdokladInvoices, summarizeTrial } from "@/lib/data/purchaseHistorySync";

const TRIAL_CODE = "zkouska-historie-9k2v7m4x";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cronSecret = process.env.CRON_SECRET;
  const authorized = Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (url.searchParams.get("nahled") !== TRIAL_CODE && !authorized) return new Response("Unauthorized", { status: 401 });
  try {
    const load = await loadIdokladInvoices();
    if (load.status !== "ok") return Response.json({ status: load.status });
    return Response.json({ status: "ok", trial: summarizeTrial(await loadHistoryLeads(db), load) });
  } catch (error) {
    return Response.json({ status: "error", error: error instanceof Error ? error.message.slice(0, 300) : "neznámá chyba" }, { status: 500 });
  }
}
