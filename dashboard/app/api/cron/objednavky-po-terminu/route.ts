// Objednávky po termínu (zadání Lucie 17. 11. 2026) — interní upozornění na
// info@begina.cz každý pracovní den v 11:00 pražského času. Vercel Cron běží
// v UTC, proto dvakrát (9:01 a 10:01 UTC, viz vercel.json) a pošle se jen
// v běhu, kdy je v Praze 11 h — v zimě i v létě. Víkendy a svátky nic.
// Když není co hlásit, neposílá se nic. Zákazníkům nikdy nic.
// Autorizace jako u ostatních cronů: "Authorization: Bearer $CRON_SECRET".
import { emailConfig } from "@/lib/eshop/email/config";
import { resendTransport } from "@/lib/eshop/email/resend";
import { buildOverdueEmail, isWorkingDay, pragueDate, pragueHour } from "@/lib/eshop/overdueOrders";
import { loadOverdueReport } from "@/lib/eshop/overdueOrdersServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const now = new Date();
  const today = pragueDate(now);
  const force = new URL(request.url).searchParams.get("vynutit") === "1";
  if (!force && pragueHour(now) !== 11) return Response.json({ sent: false, reason: "v Praze není 11 h" });
  if (!force && !isWorkingDay(today)) return Response.json({ sent: false, reason: "není pracovní den" });

  const report = await loadOverdueReport(now);
  const email = buildOverdueEmail(report);
  const counts = { unshipped: report.unshipped.length, undelivered: report.undelivered.length };
  if (!email) return Response.json({ sent: false, reason: "není co hlásit", ...counts });

  const config = emailConfig();
  if (!config || config.internalTo.length === 0) return Response.json({ sent: false, reason: "e-mail není nastaven", ...counts });
  const result = await resendTransport(config.apiKey)(
    { from: config.from, to: config.internalTo, replyTo: config.replyTo, ...email },
    `objednavky-po-terminu-${today}`,
  );
  if (!result.ok) console.error("Objednávky po termínu: e-mail se nepodařilo odeslat", result.error.slice(0, 200));
  return Response.json({ sent: result.ok, ...counts });
}
