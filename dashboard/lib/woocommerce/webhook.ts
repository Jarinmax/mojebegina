// Příjem nové objednávky z WooCommerce (begina.cz) do MojeBegina —
// PRVNÍ automatický import, dřív appka objednávky z WooCommerce
// zapisovala jen ručně (jedna za druhou, SQL skriptem). Jádro zápisu je
// importExternalOrder (lib/data/orders.ts) — stejné jádro používá i MCP
// nástroj (lib/agent/mcp/tools/orders.ts), aby "stejná produkční logika"
// platila doslova.
//
// NEOVĚŘENO proti skutečné odpovědi WooCommerce z begina.cz (appka k
// živému webhooku nemá přístup) — mapování vychází z veřejné WooCommerce
// REST API dokumentace (Order resource) a ze SKUTEČNÝCH dat objednávky
// 5217, které appka dostala přímo od zadavatele. Než se na tenhle webhook
// začne spoléhat v ostrém provozu, potvrdit proti REÁLNÉMU payloadu
// (WooCommerce umí webhook "Resend" — nejjednodušší způsob ověření).
//
// IČO firmy WooCommerce nativně nemá — appka ho čte z meta_data pod
// NĚKOLIKA nejčastějšími klíči českých fakturačních pluginů
// (ICO_META_DATA_KEYS níže). Žádný z nich NENÍ ověřený proti živému
// begina.cz — jen nejpravděpodobnější konvence. Když se v payloadu
// nenajde ŽÁDNÝ, appka objednávku založí jako SOUKROMÉHO zákazníka
// (bez organizace, podle e-mailu/jména z billing) — ne jako chybu.
//
// Přiřazení k organizaci: IČO musí odpovídat PŘESNĚ JEDNÉ existující
// organizaci. Nenajde-li se žádná nebo najde-li víc, appka NEHÁDÁ a NEVY-
// TVÁŘÍ novou firmu sama — vrátí "needs_review" a nic nezapíše (stejná
// zásada jako jinde v appce: "stop jen u skutečné nebo nejasné duplicity").
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { importExternalOrder, type ImportOrderResult } from "@/lib/data/orders";
import type { ImportOrderInput } from "@/lib/data/orderValidation";
import { woocommerceConfig } from "./config";

export function verifyWooCommerceSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const given = Buffer.from(signatureHeader, "base64");
  const good = Buffer.from(expected, "base64");
  return given.length === good.length && timingSafeEqual(given, good);
}

const ICO_META_DATA_KEYS = ["_billing_ico", "billing_ico", "_billing_company_ico"];

type WooMetaDatum = { key?: unknown; value?: unknown };
type WooAddress = {
  first_name?: unknown;
  last_name?: unknown;
  company?: unknown;
  email?: unknown;
  phone?: unknown;
  address_1?: unknown;
  address_2?: unknown;
  city?: unknown;
  postcode?: unknown;
};
type WooLineItem = { name?: unknown; quantity?: unknown; total?: unknown; subtotal?: unknown; price?: unknown };
type WooOrderPayload = {
  id?: unknown;
  number?: unknown;
  date_created?: unknown;
  date_created_gmt?: unknown;
  discount_total?: unknown;
  shipping_total?: unknown;
  total?: unknown;
  payment_method?: unknown;
  payment_method_title?: unknown;
  customer_note?: unknown;
  billing?: WooAddress;
  shipping?: WooAddress;
  line_items?: WooLineItem[];
  meta_data?: WooMetaDatum[];
};

function str(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function fullName(address: WooAddress | undefined): string {
  if (!address) return "";
  return [str(address.first_name), str(address.last_name)].filter(Boolean).join(" ").trim();
}

function fullAddress(address: WooAddress | undefined): string {
  if (!address) return "";
  const line = [str(address.address_1), str(address.address_2)].filter(Boolean).join(", ");
  const city = [str(address.postcode), str(address.city)].filter(Boolean).join(" ");
  return [line, city].filter(Boolean).join(", ");
}

/** Decimální řetězec (WooCommerce) → celé Kč. orders.*_kc jsou integer — appka haléře zaokrouhlí, nikdy nevyhodí chybu na desetinném čísle. */
function roundToWholeKc(value: unknown): number {
  const n = Number(str(value).trim() || "0");
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function findIco(metaData: WooMetaDatum[] | undefined): string | null {
  if (!Array.isArray(metaData)) return null;
  for (const key of ICO_META_DATA_KEYS) {
    const hit = metaData.find((m) => str(m.key) === key);
    const value = hit ? str(hit.value).replace(/\s/g, "") : "";
    if (value) return value;
  }
  return null;
}

export type WooCommerceImportOutcome =
  | { outcome: "imported"; orderId: string }
  | { outcome: "already_imported"; orderId: string }
  | { outcome: "needs_review"; reason: string }
  | { outcome: "rejected"; reason: string };

/**
 * Sestaví ImportOrderInput z WooCommerce payloadu a dohledanou organizaci;
 * nic nezapisuje. Tahle verze webhooku umí jen FIREMNÍ objednávky (IČO v
 * meta_data odpovídající přesně jedné organizaci) — soukromé objednávky
 * bez organizace appka zatím importovat neumí (buyer_organization_id by
 * zůstal NULL, ale appka tenhle případ ještě nemá otestovaný/ošetřený
 * stejně důkladně jako firemní, proto raději "needs_review" než tichý
 * dohad). Rozšíření na soukromé zákazníky je samostatný, budoucí krok.
 */
async function resolveOrganization(ico: string | null): Promise<{ ok: true; organizationId: string } | { ok: false; reason: string }> {
  if (!ico) {
    return { ok: false, reason: "Objednávka bez IČO (soukromý zákazník) — import soukromých objednávek bez organizace tenhle webhook ještě nepodporuje, nutná ruční kontrola." };
  }
  const rows = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.ico, ico)).limit(2);
  if (rows.length === 0) {
    return { ok: false, reason: `IČO ${ico} z objednávky neodpovídá žádné firmě v MojeBegina — nutná ruční kontrola (založení karty zákazníka).` };
  }
  if (rows.length > 1) {
    return { ok: false, reason: `IČO ${ico} odpovídá víc než jedné firmě v MojeBegina — nutná ruční kontrola.` };
  }
  return { ok: true, organizationId: rows[0].id };
}

export async function handleWooCommerceOrderPayload(payload: WooOrderPayload): Promise<WooCommerceImportOutcome> {
  const externalWooCommerceId = str(payload.number) || str(payload.id);
  if (!externalWooCommerceId) {
    return { outcome: "rejected", reason: "Objednávka z WooCommerce nemá číslo (number/id) — nic se nezapsalo." };
  }

  const ico = findIco(payload.meta_data);
  const org = await resolveOrganization(ico);
  if (!org.ok) {
    return { outcome: "needs_review", reason: org.reason };
  }

  const orderedAtRaw = str(payload.date_created_gmt) || str(payload.date_created);
  const orderedAt = orderedAtRaw ? (orderedAtRaw.endsWith("Z") ? orderedAtRaw : `${orderedAtRaw}Z`) : "";

  const items = (payload.line_items ?? []).map((item) => {
    const quantity = Math.max(1, Math.round(Number(str(item.quantity) || "1")));
    const lineTotal = roundToWholeKc(item.total ?? item.subtotal ?? item.price);
    const unitPriceKc = quantity > 0 ? Math.round(lineTotal / quantity) : lineTotal;
    return { name: str(item.name) || "Položka", quantity: String(quantity), unitPriceKc: String(unitPriceKc) };
  });

  const billing = payload.billing;
  const shipping = payload.shipping?.address_1 ? payload.shipping : billing;

  const input: ImportOrderInput = {
    externalWooCommerceId,
    buyerOrganizationId: org.organizationId,
    expectedIco: ico ?? undefined,
    contactName: fullName(billing),
    contactPhone: str(billing?.phone),
    contactEmail: str(billing?.email),
    recipientName: fullName(shipping) || fullName(billing),
    recipientAddress: fullAddress(shipping) || fullAddress(billing),
    recipientPhone: str(shipping?.phone ?? billing?.phone),
    customerNote: str(payload.customer_note),
    note: `Import z WooCommerce (begina.cz) #${externalWooCommerceId}.`,
    shippingMethodLabel: "", // WC nedává jako samostatný label v tomhle rozsahu payloadu — doplnit, až bude reálný vzorek
    paymentMethodCode: str(payload.payment_method),
    paymentMethodLabel: str(payload.payment_method_title),
    shippingKc: String(roundToWholeKc(payload.shipping_total)),
    discountKc: String(roundToWholeKc(payload.discount_total)),
    orderedAt,
    items,
  };

  const result: ImportOrderResult = await importExternalOrder(input, { type: "system", name: "WooCommerce (begina.cz)" });
  if (!result.ok) {
    return { outcome: "rejected", reason: result.error };
  }
  return result.alreadyExisted ? { outcome: "already_imported", orderId: result.id } : { outcome: "imported", orderId: result.id };
}

export { woocommerceConfig };
