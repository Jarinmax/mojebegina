// Jarda — upozornění na naplánovaný hovor 1.0. Jednou denně (Vercel Cron,
// viz vercel.json) — každému vlastníkovi s dnešním naplánovaným hovorem a
// aspoň jedním uloženým odběrem pošle JEDNO shrnující push upozornění.
// Hobby plán Vercelu dovoluje jen 1 spuštění cronu/den — proto souhrn, ne
// upozornění přesně v čase hovoru (schváleno, Fáze 1; Vercel Pro = další
// krok, až se ověří, že tohle Jardovi vyhovuje).
//
// Autorizace: Vercel k cronu automaticky posílá "Authorization: Bearer
// $CRON_SECRET" (env proměnná, kterou je potřeba nastavit) — bez shody se
// nic neposílá. Mimo Vercel Cron (ruční GET bez hlavičky) = 401.
import { getScheduledCallsGroupedByOwnerToday } from "@/lib/data/scheduledCallReminders";
import { getSubscriptionsForOwners, deleteSubscriptionByEndpoint, type OwnerSubscription } from "@/lib/data/pushSubscriptions";
import { sendPushNotification } from "@/lib/data/pushSend";
import { formatPragueDateTime } from "@/lib/data/callActivityValidation";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function summaryText(calls: { displayName: string; scheduledCallAt: Date }[]): { title: string; body: string } {
  const first = calls[0];
  const time = formatPragueDateTime(first.scheduledCallAt).slice(11);
  if (calls.length === 1) {
    return { title: `Hovor dnes v ${time}`, body: `${first.displayName} — klepněte a zavolejte.` };
  }
  return {
    title: `${calls.length} naplánované hovory dnes`,
    body: `První v ${time} — ${first.displayName}. Otevřete Moji práci pro celý přehled.`,
  };
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const grouped = await getScheduledCallsGroupedByOwnerToday();
  if (grouped.size === 0) {
    return Response.json({ owners: 0, sent: 0, failed: 0 });
  }

  const subscriptions = await getSubscriptionsForOwners([...grouped.keys()]);
  const byOwner = new Map<string, OwnerSubscription[]>();
  for (const sub of subscriptions) {
    const list = byOwner.get(sub.userId) ?? [];
    list.push(sub);
    byOwner.set(sub.userId, list);
  }

  let sent = 0;
  let failed = 0;
  for (const [ownerUserId, calls] of grouped) {
    const ownerSubs = byOwner.get(ownerUserId) ?? [];
    if (ownerSubs.length === 0) continue;

    const { title, body } = summaryText(calls);
    for (const sub of ownerSubs) {
      const result = await sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        { title, body, url: "/prace" }
      );
      if (result.ok) {
        sent += 1;
      } else {
        failed += 1;
        if (result.gone) {
          await deleteSubscriptionByEndpoint(sub.endpoint);
        } else {
          console.error("Odeslání upozornění na hovor selhalo", result.error);
        }
      }
    }
  }

  return Response.json({ owners: grouped.size, sent, failed });
}
