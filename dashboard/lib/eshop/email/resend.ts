// ESHOP 1.0 — odeslání e-mailu přes Resend REST API (bez další knihovny).
// https://resend.com/docs/api-reference/emails/send-email
//
// Idempotency-Key: stejný e-mail k téže objednávce Resend do 24 hodin
// podruhé neodešle, ani kdyby se odeslání omylem zopakovalo.
// Nikdy nevyhazuje výjimku — chyba se vrátí jako { ok: false }.

/** Vložený obrázek: v HTML se odkazuje jako <img src="cid:{contentId}">. */
export type InlineImage = { filename: string; contentBase64: string; contentId: string };

export type EmailMessage = {
  from: string;
  to: string[];
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  inlineImages?: InlineImage[];
};

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export type EmailTransport = (message: EmailMessage, idempotencyKey: string) => Promise<SendResult>;

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export function resendTransport(apiKey: string, fetchImpl: typeof fetch = fetch): EmailTransport {
  return async (message, idempotencyKey) => {
    try {
      const response = await fetchImpl(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from: message.from,
          to: message.to,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.inlineImages?.length
            ? {
                attachments: message.inlineImages.map((image) => ({
                  filename: image.filename,
                  content: image.contentBase64,
                  content_id: image.contentId,
                })),
              }
            : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = (await response.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
      if (!response.ok || !body?.id) {
        return { ok: false, error: `Resend ${response.status}: ${body?.message ?? body?.name ?? "bez odpovědi"}` };
      }
      return { ok: true, id: body.id };
    } catch (error) {
      return { ok: false, error: `Resend nedostupný: ${error instanceof Error ? error.message : String(error)}` };
    }
  };
}
