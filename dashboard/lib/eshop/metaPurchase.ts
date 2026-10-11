// Meta „Purchase“ = DOKONČENÝ nákup: odchází ze serveru (Meta Conversions
// API) až ve chvíli, kdy je e-shopová objednávka uhrazená celá — kartou
// (webhook Stripe), převodem nebo hotově (Zapsat platbu v MojeBegina),
// nebo náhradní objednávka uhrazená převodem ze stornované. Vytvořená,
// nezaplacená ani stornovaná objednávka Purchase nikdy neposílá.
//
// Jen se souhlasem: pokladna uloží k objednávce (order_activity „created“,
// metadata.metaConsent) souhlas s reklamními cookies z CookieYes, cookie
// _fbp/_fbc a prohlížeč — a jen pokud zákazník v tu chvíli souhlasil.
// Bez záznamu souhlasu se nic neodešle. Žádný e-mail, jméno, telefon ani IP.
//
// Jednou: před odesláním se pod zámkem objednávky zapíše záznam
// „meta_purchase“ (druhý pokus ho najde a nic nepošle); event_id =
// objednavka-<VS> → Meta deduplikuje i proti případné události z prohlížeče.
// Náhradní objednávka se nezapočítá, pokud už nákup poslala původní.
//
// Přepínač: ESHOP_META_CAPI_TOKEN (tajný přístupový token z Meta Events
// Manager, jen ve Vercelu) + zapnutý pixel (lib/eshop/marketing.ts).
// Bez něj se nic neodesílá. Nikdy nevyhazuje výjimku — platba je uložená.
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { marketingConfig } from "./marketing";

type Db = NeonHttpDatabase<typeof schema>;
type Env = Record<string, string | undefined>;

export const META_PURCHASE = "meta_purchase";
const GRAPH_URL = "https://graph.facebook.com/v21.0";
/** Adresa události — veřejná stránka pokladny, nikdy adresa objednávky (tajné id). */
const EVENT_SOURCE_URL = "https://begina.cz/pokladna";

export type MetaConsent = { at: string; fbp: string | null; fbc: string | null; userAgent: string };

const FBP = /^fb\.\d\.\d{10,13}\.\d{1,20}$/;
const FBC = /^fb\.\d\.\d{10,13}\.[A-Za-z0-9_-]{1,500}$/;

/**
 * Souhlas z pokladny → záznam k objednávce, nebo null (bez souhlasu, pixel
 * vypnutý, nebo bez identifikátoru prohlížeče — pak nejde nákup přiřadit).
 * Hodnoty od klienta se jen ověří formátem, nic jiného se neukládá.
 */
export function metaConsentFromCheckout(
  input: { adConsent: string; fbp: string; fbc: string; userAgent: string | null },
  now: Date,
  env: Env = process.env
): MetaConsent | null {
  if (!marketingConfig(env)?.metaPixelId || input.adConsent !== "1") return null;
  const fbp = FBP.test(input.fbp) ? input.fbp : null;
  const fbc = FBC.test(input.fbc) ? input.fbc : null;
  const userAgent = (input.userAgent ?? "").slice(0, 512);
  if ((!fbp && !fbc) || !userAgent) return null;
  return { at: now.toISOString(), fbp, fbc, userAgent };
}

export function metaCapiConfig(env: Env = process.env): { pixelId: string; token: string; testEventCode: string | null } | null {
  const pixelId = marketingConfig(env)?.metaPixelId;
  const token = (env.ESHOP_META_CAPI_TOKEN ?? "").trim();
  if (!pixelId || !/^[A-Za-z0-9]{20,512}$/.test(token)) return null;
  const testEventCode = (env.ESHOP_META_TEST_EVENT_CODE ?? "").trim();
  return { pixelId, token, testEventCode: /^TEST\w{1,20}$/.test(testEventCode) ? testEventCode : null };
}

export type MetaPurchaseOutcome =
  | { status: "sent"; eventId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

type OrderRow = {
  channel: string;
  payment_status: string;
  fulfillment_status: string;
  payment_vs: string | null;
  total_kc: number;
};

async function consentOf(db: Db, orderId: string): Promise<{ consent: MetaConsent | null; sourceOrderId: string | null }> {
  const rows = (
    await db.execute(sql`
      SELECT metadata FROM order_activity WHERE order_id = ${orderId} AND kind = 'created' ORDER BY created_at LIMIT 1`)
  ).rows as { metadata: Record<string, unknown> | null }[];
  const meta = rows[0]?.metadata ?? {};
  const consent = (meta.metaConsent ?? null) as MetaConsent | null;
  const source = typeof meta.replacementOfOrderId === "string" ? meta.replacementOfOrderId : null;
  return { consent, sourceOrderId: source };
}

export async function sendMetaPurchase(
  db: Db,
  orderId: string,
  deps: { env?: Env; fetchImpl?: typeof fetch; now?: Date } = {}
): Promise<MetaPurchaseOutcome> {
  const env = deps.env ?? process.env;
  const config = metaCapiConfig(env);
  if (!config) return { status: "skipped", reason: "vypnuto" };

  const [order] = (
    await db.execute(sql`
      SELECT channel, payment_status, fulfillment_status, payment_vs, total_kc FROM orders WHERE id = ${orderId}`)
  ).rows as OrderRow[];
  if (!order) return { status: "skipped", reason: "objednávka neexistuje" };
  if (order.channel !== "eshop") return { status: "skipped", reason: "není e-shopová" };
  if (order.fulfillment_status === "cancelled") return { status: "skipped", reason: "stornovaná" };
  if (order.payment_status !== "paid") return { status: "skipped", reason: "není uhrazená celá" };
  if (!order.payment_vs) return { status: "skipped", reason: "bez VS" };

  const own = await consentOf(db, orderId);
  const sourceOrderId = own.sourceOrderId;
  let consent = own.consent;
  if (sourceOrderId) {
    // Náhradní objednávka: souhlas z původní; nákup jen jednou za oba.
    const counted = (
      await db.execute(sql`SELECT 1 FROM order_activity WHERE order_id = ${sourceOrderId} AND kind = ${META_PURCHASE} LIMIT 1`)
    ).rows;
    if (counted.length > 0) return { status: "skipped", reason: "započteno u původní objednávky" };
    consent ??= (await consentOf(db, sourceOrderId)).consent;
  }
  if (!consent) return { status: "skipped", reason: "bez souhlasu" };

  const items = (
    await db.execute(sql`
      SELECT coalesce(v.sku, i.sku_snapshot, i.name) AS sku, i.quantity, i.unit_price_kc
      FROM order_items i LEFT JOIN product_variants v ON v.id = i.product_variant_id
      WHERE i.order_id = ${orderId} ORDER BY i.id`)
  ).rows as { sku: string; quantity: number; unit_price_kc: number }[];

  const eventId = `objednavka-${order.payment_vs}`;
  const now = deps.now ?? new Date();
  // Zámek objednávky + záznam „meta_purchase“ jen pokud ještě není → jednou.
  const claimed = await db.batch([
    db.execute(sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`),
    db.execute(sql`
      INSERT INTO order_activity (order_id, actor_type, author_name, kind, metadata)
      SELECT ${orderId}, 'system', 'E-shop', ${META_PURCHASE}, ${JSON.stringify({ eventId, status: "sending" })}::jsonb
      WHERE NOT EXISTS (SELECT 1 FROM order_activity WHERE order_id = ${orderId} AND kind = ${META_PURCHASE})
      RETURNING id`),
  ]);
  const claim = (claimed[1].rows as { id: string }[])[0];
  if (!claim) return { status: "skipped", reason: "už odesláno" };

  const contents = items.map((item) => ({ id: item.sku, quantity: item.quantity, item_price: item.unit_price_kc }));
  const body = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(now.getTime() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: EVENT_SOURCE_URL,
        user_data: {
          ...(consent.fbp ? { fbp: consent.fbp } : {}),
          ...(consent.fbc ? { fbc: consent.fbc } : {}),
          client_user_agent: consent.userAgent,
        },
        custom_data: {
          currency: "CZK",
          value: order.total_kc,
          content_type: "product",
          content_ids: contents.map((c) => c.id),
          contents,
          num_items: contents.reduce((sum, c) => sum + c.quantity, 0),
          order_id: order.payment_vs,
        },
      },
    ],
    ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}),
    access_token: config.token,
  };

  let outcome: MetaPurchaseOutcome;
  try {
    const response = await (deps.fetchImpl ?? fetch)(`${GRAPH_URL}/${config.pixelId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    outcome = response.ok
      ? { status: "sent", eventId }
      : { status: "failed", error: `Meta ${response.status}: ${(await response.text()).slice(0, 300)}` };
  } catch (error) {
    outcome = { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
  const metadata = outcome.status === "sent" ? { eventId, status: "sent" } : { eventId, status: "failed", error: outcome.status === "failed" ? outcome.error : "" };
  await db.execute(sql`UPDATE order_activity SET metadata = ${JSON.stringify(metadata)}::jsonb WHERE id = ${claim.id}`);
  return outcome;
}

/** Jako sendMetaPurchase, ale nikdy nevyhodí výjimku (volá se po uložené platbě). */
export async function sendMetaPurchaseSafe(
  db: Db,
  orderId: string,
  deps: { env?: Env; fetchImpl?: typeof fetch; now?: Date } = {}
): Promise<MetaPurchaseOutcome> {
  try {
    return await sendMetaPurchase(db, orderId, deps);
  } catch (error) {
    console.error("Meta Purchase: odeslání selhalo", orderId, error);
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}
