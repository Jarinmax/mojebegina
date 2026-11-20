// Partnerský program — měsíční vyhodnocení (Vercel Cron, viz vercel.json).
// Dva běhy denně, každý dělá něco jen ve správný den (pražský čas):
//   ?beh=vecer  (17:00 UTC)  — upozornění, když někdo přesáhl 20 000 Kč;
//                              poslední den měsíce navíc report na info@begina.cz,
//   ?beh=pulnoc (23:05 UTC)  — první den měsíce: založí kódy
//                              a rozešle e-maily klientům (jinak jen upozorní).
// Pevné úrovně 3 / 5 / 7 % odcházejí automaticky; individuální sleva nad 20 000 Kč
// jen po zadání procenta v MojeBegina (partnerMonthlyServer.ts).
// Autorizace jako u ostatních cronů: "Authorization: Bearer $CRON_SECRET".
import { db } from "@/lib/db/client";
import { daysInMonth } from "@/lib/eshop/partnerMonthly";
import { alertIndividualLimit, finalizePartnerMonth, pragueYearMonth, reportPartnerMonth } from "@/lib/eshop/partnerMonthlyServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const now = new Date();
  const today = pragueYearMonth(now);
  const run = new URL(request.url).searchParams.get("beh");

  if (run === "pulnoc") {
    if (today.day !== 1) return Response.json({ run, skipped: "není první den měsíce" });
    return Response.json({ run, ...(await finalizePartnerMonth(db, now)) });
  }
  if (run === "vecer") {
    const alert = await alertIndividualLimit(db, now);
    const lastDay = today.day === daysInMonth(today);
    const report = lastDay ? await reportPartnerMonth(db, now) : null;
    return Response.json({ run, alert, report });
  }
  return new Response("Neznámý běh", { status: 400 });
}
