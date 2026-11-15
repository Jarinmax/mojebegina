// Fio banka — párování příchozích plateb s objednávkami e-shopu (Vercel Cron,
// viz vercel.json; několik běhů denně). Logika a pravidla: lib/eshop/fioSync.ts.
// Autorizace jako u ostatních cronů: "Authorization: Bearer $CRON_SECRET".
import { db } from "@/lib/db/client";
import { getAppOrigin } from "@/lib/appOrigin";
import { syncFioPayments } from "@/lib/eshop/fioSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await syncFioPayments(db, new Date(), { baseUrl: await getAppOrigin() });
  return Response.json(result);
}
