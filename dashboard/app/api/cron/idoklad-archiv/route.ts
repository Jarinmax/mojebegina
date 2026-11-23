// Archiv iDokladu do MojeBegina (Lucie 23. 11. 2026, iDoklad končí 4. 12.):
// každý běh načte seznam dokladů a stáhne další dávku PDF (lib/eshop/invoicing/idokladArchive.ts).
// Autorizace: Vercel Cron (Bearer CRON_SECRET), nebo ?kod= pro ruční dávku
// během převodu (jen import a počty, žádné osobní údaje ve výstupu).
import { db } from "@/lib/db/client";
import { idokladArchiveStatus, importIdokladArchive } from "@/lib/eshop/invoicing/idokladArchive";

const RUN_CODE = "archiv-80a909f0ce9d8db1";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cronSecret = process.env.CRON_SECRET;
  const cron = Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (!cron && url.searchParams.get("kod") !== RUN_CODE) return new Response("Unauthorized", { status: 401 });
  try {
    if (url.searchParams.get("jen") === "stav") return Response.json(await idokladArchiveStatus(db));
    const limit = Number(url.searchParams.get("pdf") ?? "") || undefined;
    const run = await importIdokladArchive(db, { pdfLimit: limit });
    return Response.json({ ...run, pdfFailed: run.pdfFailed.length, status: run.status });
  } catch (error) {
    return Response.json({ status: "error", error: error instanceof Error ? error.message.slice(0, 300) : "neznámá chyba" }, { status: 500 });
  }
}
