// Měření e-shopu — týdenní report na info@begina.cz (Vercel Cron, pondělí
// 15:00 UTC = 16:00 v zimě / 17:00 v létě pražského času, viz vercel.json).
// Posílá jen interní e-mail; zákazníkům nic. Autorizace jako u ostatních
// cronů: "Authorization: Bearer $CRON_SECRET".
import { emailConfig } from "@/lib/eshop/email/config";
import { resendTransport } from "@/lib/eshop/email/resend";
import { buildFunnelReport } from "@/lib/eshop/funnelReport";
import { loadFunnelWeeks } from "@/lib/eshop/funnelServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const weeks = await loadFunnelWeeks();
  if (!weeks) return Response.json({ sent: false, reason: "tabulka měření neexistuje" });
  const config = emailConfig();
  if (!config || config.internalTo.length === 0) return Response.json({ sent: false, reason: "e-mail není nastaven" });
  const report = buildFunnelReport(weeks.week, weeks.previous);
  const result = await resendTransport(config.apiKey)(
    { from: config.from, to: config.internalTo, replyTo: config.replyTo, ...report },
    `mereni-eshopu-${weeks.week[0]?.day ?? "x"}`,
  );
  if (!result.ok) console.error("Měření e-shopu: report se nepodařilo odeslat", result.error.slice(0, 200));
  return Response.json({ sent: result.ok, week: weeks.week[0]?.day });
}
