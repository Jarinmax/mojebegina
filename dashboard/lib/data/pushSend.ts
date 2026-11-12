// Jarda — upozornění na naplánovaný hovor 1.0. Tenký wrapper nad web-push —
// jediné místo, které volá webpush.sendNotification, aby se "endpoint
// zmizel" (404/410 — prohlížeč/zařízení odběr sám zrušilo) řešilo na
// jednom místě (volající pak mrtvý odběr smaže, viz pushSubscriptions.ts).
import "server-only";
import webpush from "web-push";
import { pushConfig } from "./pushConfig";

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url: string };
export type PushSendResult = { ok: true } | { ok: false; gone: boolean; error: string };

export async function sendPushNotification(target: PushTarget, payload: PushPayload): Promise<PushSendResult> {
  const config = pushConfig();
  if (!config) {
    return { ok: false, gone: false, error: "Push notifikace nejsou nastavené (chybí VAPID klíče)." };
  }

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload)
    );
    return { ok: true };
  } catch (error) {
    const statusCode = error instanceof Error && "statusCode" in error ? (error as { statusCode?: number }).statusCode : undefined;
    const gone = statusCode === 404 || statusCode === 410;
    return { ok: false, gone, error: error instanceof Error ? error.message : "Neznámá chyba při odesílání upozornění." };
  }
}
