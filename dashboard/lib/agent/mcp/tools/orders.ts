// GPT/MCP — ruční doplnění objednávky z WooCommerce, když automatický
// webhook (lib/woocommerce/webhook.ts) výpadek nezachytí nebo
// WooCommerce webhook nedoručil. Stejné zápisové jádro jako webhook
// (importExternalOrder, lib/data/orders.ts) — "stejná produkční logika
// jako web" platí doslova, appka nemá druhou cestu k zápisu objednávky.
//
// Postup asistenta: woocommerce_order_import_preview (jen čtení — appka
// nic nezapisuje, jen ukáže, co by se založilo a jestli objednávka už
// v MojeBegina není) → uživatel náhled vidí a výslovně potvrdí →
// import_woocommerce_order s preview_token z náhledu, confirm=true a
// idempotency_key. Token je podepsaný (HMAC), platí 30 minut a jen pro
// STEJNÁ data náhledu — změní-li se mezitím jediné číslo, import se
// zastaví (žádné "tiché" přepsání mezi náhledem a zápisem).
//
// id (externalWooCommerceId) i částky appka nikdy nevymýšlí — všechna
// čísla musí přijít jako argument, přesně jak je vidí WooCommerce.
import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getAuthContext } from "@/lib/data/authContext";
import { canAccessOrders } from "@/lib/data/orderAuth";
import { importExternalOrder, type ImportOrderResult } from "@/lib/data/orders";
import { validateImportOrderInput, type ImportOrderInput } from "@/lib/data/orderValidation";
import { db } from "@/lib/db/client";
import { organizations, orders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ArgError, optionalString, requiredString } from "../args";
import { customerUrl, defineTool, orderUrl, type AgentTool } from "../define";

export const IMPORT_PREVIEW_TOKEN_MINUTES = 30;

type PreviewClaims = { userId: string; fingerprint: string; issuedAt: number };

function tokenKey(secret: string): Buffer {
  return createHash("sha256").update(`mojebegina:woo-import-preview:${secret}`).digest();
}

function previewSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.MCP_OAUTH_CLIENT_SECRET?.trim() ?? "";
  if (secret.length < 32) throw new Error("MCP_OAUTH_CLIENT_SECRET chybí");
  return secret;
}

function fingerprintOf(input: ImportOrderInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function signPreviewToken(claims: PreviewClaims, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const mac = createHmac("sha256", tokenKey(secret)).update(body).digest("base64url");
  return `v1.${body}.${mac}`;
}

function verifyPreviewToken(
  token: string,
  expected: { userId: string; fingerprint: string },
  secret: string,
  now: number = Date.now()
): { ok: true } | { ok: false; error: string } {
  const invalid = { ok: false as const, error: "preview_token je neplatný nebo neodpovídá zadaným údajům — zobrazte nejdřív woocommerce_order_import_preview se stejnými údaji a použijte jeho token." };
  const [version, body, mac] = token.split(".");
  if (version !== "v1" || !body || !mac) return invalid;
  const good = createHmac("sha256", tokenKey(secret)).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== good.length || !timingSafeEqual(given, good)) return invalid;
  let claims: PreviewClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PreviewClaims;
  } catch {
    return invalid;
  }
  if (claims.userId !== expected.userId || claims.fingerprint !== expected.fingerprint) return invalid;
  if (!(now - claims.issuedAt >= 0 && now - claims.issuedAt <= IMPORT_PREVIEW_TOKEN_MINUTES * 60_000)) {
    return { ok: false, error: `Náhled je starší než ${IMPORT_PREVIEW_TOKEN_MINUTES} minut — zobrazte ho znovu a nechte ho potvrdit.` };
  }
  return { ok: true };
}

const ITEM_PROPS = {
  type: "object",
  properties: {
    name: { type: "string", description: "Název položky přesně podle WooCommerce." },
    quantity: { type: "string", description: "Množství (kladné celé číslo)." },
    unit_price_kc: { type: "string", description: "Jednotková cena v celých Kč (bez haléřů — orders.unit_price_kc je integer)." },
  },
  required: ["name", "quantity", "unit_price_kc"],
} as const;

const ORDER_PROPS = {
  external_woocommerce_id: { type: "string", description: "Číslo objednávky z WooCommerce (number), přesně jak je ve WooCommerce — appka ho nevymýšlí." },
  buyer_organization_id: { type: "string", description: "id zákaznické organizace (UUID) — dohledejte přes search_mojebegina/get_customer." },
  expected_ico: { type: "string", description: "IČO firmy z objednávky — appka ho porovná s organizací a při neshodě zastaví (ochrana proti záměně zákazníka)." },
  contact_name: { type: "string", description: "Jméno kontaktní osoby (fakturační adresa)." },
  contact_phone: { type: "string", description: "Telefon kontaktní osoby." },
  contact_email: { type: "string", description: "E-mail kontaktní osoby." },
  recipient_name: { type: "string", description: "Jméno příjemce (dodací adresa)." },
  recipient_address: { type: "string", description: "Dodací adresa (ulice, PSČ, město)." },
  recipient_phone: { type: "string", description: "Telefon příjemce." },
  customer_note: { type: "string", description: "Poznámka zákazníka z objednávky." },
  shipping_method_label: { type: "string", description: "Způsob dopravy (např. „Chlazená přeprava“)." },
  payment_method_code: { type: "string", description: "Kód způsobu platby z WooCommerce (např. „bacs“)." },
  payment_method_label: { type: "string", description: "Název způsobu platby (např. „Bankovní převod předem“)." },
  shipping_kc: { type: "string", description: "Doprava v celých Kč." },
  discount_kc: { type: "string", description: "Sleva v celých Kč (orders.discount_kc je integer — haléřovou slevu appka NEzaokrouhlí sama, zaokrouhlete na celé Kč PŘED voláním a řekněte to uživateli)." },
  ordered_at: { type: "string", description: "Datum a čas objednávky s časovým pásmem (ISO 8601, např. 2026-10-25T23:12:00+02:00)." },
  items: { type: "array", items: ITEM_PROPS, description: "Položky objednávky." },
} as const;

function orderInputOf(args: Record<string, unknown>): ImportOrderInput {
  const rawItems = args.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new ArgError("Argument items musí být neprázdný seznam položek.");
  const items = rawItems.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) throw new ArgError(`Položka č. ${index + 1} musí být objekt {name, quantity, unit_price_kc}.`);
    const item = raw as Record<string, unknown>;
    return {
      name: requiredString(item, "name", 200),
      quantity: requiredString(item, "quantity", 10),
      unitPriceKc: requiredString(item, "unit_price_kc", 10),
    };
  });
  return {
    externalWooCommerceId: requiredString(args, "external_woocommerce_id", 50),
    buyerOrganizationId: requiredString(args, "buyer_organization_id", 36),
    expectedIco: optionalString(args, "expected_ico", 20) ?? undefined,
    contactName: optionalString(args, "contact_name", 200) ?? "",
    contactPhone: optionalString(args, "contact_phone", 200) ?? "",
    contactEmail: optionalString(args, "contact_email", 200) ?? "",
    recipientName: optionalString(args, "recipient_name", 200) ?? "",
    recipientAddress: optionalString(args, "recipient_address", 2000) ?? "",
    recipientPhone: optionalString(args, "recipient_phone", 200) ?? "",
    customerNote: optionalString(args, "customer_note", 2000) ?? "",
    note: `Doplněno přes ChatGPT — WooCommerce #${requiredString(args, "external_woocommerce_id", 50)}.`,
    shippingMethodLabel: optionalString(args, "shipping_method_label", 200) ?? "",
    paymentMethodCode: optionalString(args, "payment_method_code", 50) ?? "",
    paymentMethodLabel: optionalString(args, "payment_method_label", 200) ?? "",
    shippingKc: optionalString(args, "shipping_kc", 10) ?? "0",
    discountKc: optionalString(args, "discount_kc", 10) ?? "0",
    orderedAt: requiredString(args, "ordered_at", 40),
    items,
  };
}

const ORDER_TOOLS: AgentTool[] = [
  defineTool({
    name: "woocommerce_order_import_preview",
    title: "Náhled doplnění objednávky z WooCommerce",
    description:
      "JEN ČTENÍ — nic nezapíše. Ověří zadané údaje objednávky z WooCommerce (stejná validace jako webhook/MCP zápis), zjistí, jestli objednávka s tímhle external_woocommerce_id už v MojeBegina není (pak se nic doplňovat nemusí), a ověří, že buyer_organization_id odpovídá expected_ico. " +
      "Celý náhled (zákazník, položky, částky) ukaž uživateli a vyžádej si výslovné potvrzení PŘED import_woocommerce_order — preview_token platí 30 minut jen pro přesně tyhle údaje.",
    write: false,
    visible: canAccessOrders,
    properties: ORDER_PROPS,
    required: ["external_woocommerce_id", "buyer_organization_id", "items"],
    parse: orderInputOf,
    execute: async (input, issuer) => {
      const ctx = await getAuthContext();
      if (!ctx) return { ok: false, error: "Nepřihlášený uživatel." };
      const validated = validateImportOrderInput(input);
      if (!validated.ok) return { ok: false, error: validated.error };

      const [existing] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.externalWooCommerceId, validated.value.externalWooCommerceId))
        .limit(1);
      if (existing) {
        return {
          ok: true,
          summary: { alreadyImported: true },
          data: { message: `Objednávka WooCommerce #${validated.value.externalWooCommerceId} už v MojeBegina je — nic se nedoplňuje.`, orderId: existing.id, url: orderUrl(issuer, existing.id) },
        };
      }

      const [org] = await db.select({ id: organizations.id, name: organizations.name, ico: organizations.ico }).from(organizations).where(eq(organizations.id, input.buyerOrganizationId)).limit(1);
      if (!org) return { ok: false, error: "Zákaznická organizace nebyla nalezena — dohledejte id přes search_mojebegina." };
      if (validated.value.expectedIco && org.ico !== validated.value.expectedIco) {
        return { ok: false, error: `Organizace ${org.name} má IČO ${org.ico}, zadané expected_ico je ${validated.value.expectedIco} — nesouhlasí, import by propojil objednávku se špatnou firmou.` };
      }

      const fingerprint = fingerprintOf(input);
      return {
        ok: true,
        summary: { alreadyImported: false },
        data: {
          customer: { id: org.id, name: org.name, ico: org.ico, url: customerUrl(issuer, org.id) },
          externalWooCommerceId: validated.value.externalWooCommerceId,
          items: validated.value.items,
          subtotalKc: validated.value.subtotalKc,
          discountKc: validated.value.discountKc,
          shippingKc: validated.value.shippingKc,
          totalKc: validated.value.totalKc,
          orderedAt: validated.value.orderedAt,
          paymentStatus: "unpaid — appka stav platby nikdy nepřevezme automaticky, potvrďte ho ručně až po ověření",
          preview_token: signPreviewToken({ userId: ctx.userId, fingerprint, issuedAt: Date.now() }, previewSecret()),
          previewValidMinutes: IMPORT_PREVIEW_TOKEN_MINUTES,
          nextStep: "Ukaž uživateli celý náhled (zákazník, položky, částky, datum) a zeptej se, zda objednávku doplnit. Až po jeho výslovném souhlasu zavolej import_woocommerce_order se STEJNÝMI argumenty, tímto preview_token, confirm=true a novým idempotency_key.",
        },
      };
    },
  }),
  defineTool({
    name: "import_woocommerce_order",
    title: "Doplnit objednávku z WooCommerce",
    description:
      "ZÁPIS — doplní objednávku z WooCommerce do MojeBegina (channel „import“), propojí ji se zadanou organizací a zapíše položky. Idempotentní podle external_woocommerce_id: když objednávka s tímhle číslem už existuje, nic se nezapíše znovu, appka jen vrátí její id. " +
      "Volej JEN poté, co jsi uživateli ukázal woocommerce_order_import_preview se STEJNÝMI argumenty a on výslovně potvrdil. Vyžaduje preview_token z náhledu, confirm=true a idempotency_key. Platba se NIKDY neoznačí jako uhrazená automaticky.",
    write: true,
    visible: canAccessOrders,
    properties: { ...ORDER_PROPS, preview_token: { type: "string", description: "preview_token z woocommerce_order_import_preview." }, confirm: { type: "boolean", description: "true = uživatel výslovně potvrdil doplnění této objednávky." } },
    required: ["external_woocommerce_id", "buyer_organization_id", "items", "preview_token", "confirm"],
    parse: (args) => {
      if (args.confirm !== true) throw new ArgError("Objednávku lze doplnit jen s confirm=true po výslovném souhlasu uživatele s náhledem.");
      return { input: orderInputOf(args), token: requiredString(args, "preview_token", 2000) };
    },
    execute: async ({ input, token }, issuer) => {
      const ctx = await getAuthContext();
      if (!ctx || !canAccessOrders(ctx)) return { ok: false, error: "Objednávku smí doplnit jen ADMIN nebo EXECUTIVE." };
      const verified = verifyPreviewToken(token, { userId: ctx.userId, fingerprint: fingerprintOf(input) }, previewSecret());
      if (!verified.ok) return verified;

      const result: ImportOrderResult = await importExternalOrder(input, { type: "user", userId: ctx.userId, name: ctx.name });
      if (!result.ok) return result;
      return {
        ok: true,
        summary: { imported: !result.alreadyExisted },
        data: {
          orderId: result.id,
          message: result.alreadyExisted
            ? `Objednávka WooCommerce #${input.externalWooCommerceId} už v MojeBegina byla — nic se nezapsalo znovu.`
            : `Objednávka WooCommerce #${input.externalWooCommerceId} doplněna.`,
          url: orderUrl(issuer, result.id),
        },
      };
    },
  }),
];

export const ORDER_TOOLS_EXPORT: AgentTool[] = ORDER_TOOLS;
