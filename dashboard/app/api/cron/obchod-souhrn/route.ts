// Denní souhrn zápisů obchodníků k leadům (Lucie 24. 11. 2026) — e-mail na
// info@begina.cz v 19:00 pražského času. Vercel Cron běží v UTC, proto dvakrát
// (17:01 a 18:01 UTC, viz vercel.json) a pošle se jen v běhu, kdy je v Praze 19 h.
// Když za den nikdo nic nezapsal, nic se neposílá. ?vynutit=1 pošle hned.
import { emailConfig } from "@/lib/eshop/email/config";
import { resendTransport } from "@/lib/eshop/email/resend";
import { pragueDate, pragueHour } from "@/lib/eshop/overdueOrders";
import { buildLeadDigestEmail } from "@/lib/obchod/leadDigest";
import { loadTodayLeadEntries } from "@/lib/obchod/leadDigestServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const now = new Date();
  const force = new URL(request.url).searchParams.get("vynutit") === "1";
  if (!force && pragueHour(now) !== 19) return Response.json({ sent: false, reason: "v Praze není 19 h" });
  const today = pragueDate(now);
  const entries = await loadTodayLeadEntries(today);
  const dayLabel = `${Number(today.slice(8, 10))}. ${Number(today.slice(5, 7))}.`;
  const email = buildLeadDigestEmail(entries, dayLabel);
  if (!email) return Response.json({ sent: false, reason: "dnes žádné zápisy" });
  const config = emailConfig();
  if (!config || config.internalTo.length === 0) return Response.json({ sent: false, reason: "e-mail není nastaven" });
  const result = await resendTransport(config.apiKey)(
    { from: config.from, to: config.internalTo, replyTo: config.replyTo, ...email },
    `obchod-souhrn-${today}`,
  );
  if (!result.ok) console.error("Souhrn zápisů obchodníků: e-mail se nepodařilo odeslat", result.error.slice(0, 200));
  return Response.json({ sent: result.ok, entries: entries.length });
}
