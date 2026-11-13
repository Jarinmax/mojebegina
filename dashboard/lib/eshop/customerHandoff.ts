// Přechod zákazníka z MojeBegina do e-shopu (opakované objednávání pro
// kavárny a bistra, 8. 11. 2026).
//
// Proč podepsaný odkaz: MojeBegina (přihlášení) a e-shop (begina.cz) jsou
// různé domény, přihlášení se mezi nimi nesdílí. MojeBegina proto po
// ověření členství na kartě vydá krátkodobý podepsaný „pas“
// (uživatel + karta + případně objednávka k zopakování). E-shop pas ověří
// na serveru a teprve pak:
//   - naplní košík položkami té objednávky (jen to, co jde dnes koupit),
//   - předvyplní pokladnu údaji z karty (firma, IČO, DIČ, sídlo, provozovny),
//   - novou objednávku přiřadí ke kartě (buyer_organization_id).
// Pas se při každém použití znovu ověří (odebraný člen ho nevyužije).
// Bez pasu se objednávka ke kartě přiřadí podle e-mailu člena karty
// (findCardByMemberEmail) — údaje karty se ale bez pasu nikdy neukážou.
import { BOX_SKU } from "./boxOption";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import type { CatalogIndex } from "./catalogIndex";
import { MAX_QUANTITY_PER_LINE } from "./cart";
import { displayItemName } from "./packageLabel";
import { isOrderable, lineName } from "./productRules";

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Platnost pasu — stačí na nákup, a odkaz přeposlaný dál brzy přestane fungovat. */
export const HANDOFF_TTL_MS = 12 * 60 * 60 * 1000;

export type HandoffPayload = {
  v: 1;
  /** uživatel (Neon Auth user id) */
  u: string;
  /** karta zákazníka (organizations.id) */
  o: string;
  /** objednávka k zopakování; null = jen předvyplnění údajů */
  r: string | null;
  /** vydáno / platí do (ms) */
  iat: number;
  exp: number;
};

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Klíč pasu: odvozený z tajemství přihlášení (stejná aplikace, nic nového k nastavení). */
export function handoffSecret(env: Record<string, string | undefined> = process.env): string | null {
  const base = env.ESHOP_HANDOFF_SECRET?.trim() || env.NEON_AUTH_COOKIE_SECRET?.trim();
  if (!base) return null;
  return createHash("sha256").update(`begina-eshop-handoff-v1|${base}`).digest("hex");
}

export function signHandoff(
  input: { userId: string; organizationId: string; reorderOrderId: string | null },
  secret: string,
  now: number = Date.now()
): string {
  const payload: HandoffPayload = { v: 1, u: input.userId, o: input.organizationId, r: input.reorderOrderId, iat: now, exp: now + HANDOFF_TTL_MS };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ověří podpis a platnost; cokoli podezřelého = null (bez rozlišení důvodu navenek). */
export function verifyHandoff(token: unknown, secret: string, now: number = Date.now()): HandoffPayload | null {
  if (typeof token !== "string" || token.length > 1000) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload: HandoffPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    payload?.v !== 1 ||
    typeof payload.u !== "string" ||
    !payload.u ||
    typeof payload.o !== "string" ||
    !UUID.test(payload.o) ||
    (payload.r !== null && (typeof payload.r !== "string" || !UUID.test(payload.r))) ||
    typeof payload.exp !== "number" ||
    typeof payload.iat !== "number" ||
    now > payload.exp ||
    payload.iat > now + 60_000
  ) {
    return null;
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Údaje karty pro pokladnu

export type HandoffLocation = {
  id: string;
  label: string;
  street: string;
  city: string;
  zip: string;
  contactName: string | null;
  contactPhone: string | null;
  isDefault: boolean;
};

export type HandoffPrefill = {
  organizationId: string;
  company: { name: string; ico: string; dic: string | null };
  /** sídlo rozdělené na ulici, PSČ a město; null = nejde spolehlivě rozdělit (zákazník doplní) */
  registered: { street: string; city: string; zip: string } | null;
  contact: { name: string | null; email: string | null; phone: string | null };
  locations: HandoffLocation[];
};

/** „Dlouhá 113, 254 01 Radlík-Jílové“ → ulice / PSČ / město; jinak null (nic se nedohaduje). */
export function splitRegisteredAddress(raw: string | null): { street: string; city: string; zip: string } | null {
  const match = /^(.*\S)\s*,\s*(\d{3})\s?(\d{2})\s+(\S.*)$/.exec(raw?.trim() ?? "");
  if (!match || !/\p{L}/u.test(match[1]) || !/\d/.test(match[1])) return null;
  return { street: match[1].trim(), zip: `${match[2]} ${match[3]}`, city: match[4].trim() };
}

/**
 * Načte kartu pro platný pas — a znovu ověří, že uživatel na kartě je.
 * Vrací null, když členství už neexistuje (pas pak nic nepředvyplní ani
 * nepřiřadí).
 */
export async function loadHandoffPrefill(db: Db, payload: HandoffPayload): Promise<HandoffPrefill | null> {
  const [member] = await db
    .select({ id: schema.organizationMemberships.id })
    .from(schema.organizationMemberships)
    .where(and(eq(schema.organizationMemberships.userId, payload.u), eq(schema.organizationMemberships.organizationId, payload.o)))
    .limit(1);
  if (!member) return null;
  const [org] = await db
    .select({ id: schema.organizations.id, name: schema.organizations.name, ico: schema.organizations.ico, dic: schema.organizations.dic, registeredAddress: schema.organizations.registeredAddress })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, payload.o))
    .limit(1);
  if (!org || !org.ico) return null;
  const [profile] = await db
    .select({ name: schema.userProfiles.name, email: schema.userProfiles.email })
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, payload.u))
    .limit(1);
  const locations = await db
    .select({
      id: schema.locations.id,
      label: schema.locations.label,
      street: schema.locations.street,
      city: schema.locations.city,
      zip: schema.locations.zip,
      contactName: schema.locations.contactName,
      contactPhone: schema.locations.contactPhone,
      isDefault: schema.locations.isDefaultDelivery,
    })
    .from(schema.locations)
    .where(eq(schema.locations.organizationId, payload.o))
    .orderBy(asc(schema.locations.createdAt));
  // telefon objednávajícího: z jeho poslední objednávky za kartu (nic se nevymýšlí)
  const [lastOrder] = await db
    .select({ phone: schema.orders.contactPhone })
    .from(schema.orders)
    .where(eq(schema.orders.buyerOrganizationId, payload.o))
    .orderBy(desc(schema.orders.orderedAt))
    .limit(1);
  return {
    organizationId: org.id,
    company: { name: org.name, ico: org.ico, dic: org.dic ?? null },
    registered: splitRegisteredAddress(org.registeredAddress),
    contact: { name: profile?.name ?? null, email: profile?.email ?? null, phone: lastOrder?.phone ?? null },
    locations: locations
      .filter((l) => l.street && l.city && l.zip)
      .map((l) => ({ ...l, isDefault: l.isDefault === true }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
  };
}

// ---------------------------------------------------------------------------
// Položky objednávky k zopakování

export type ReorderSource = { name: string; quantity: number; unitPriceKc: number; sku: string | null };
export type ReorderResult = {
  lines: { sku: string; quantity: number }[];
  /** položky, které dnes nejde koupit nebo nejde jednoznačně určit balení */
  skipped: string[];
};

function normalizeName(name: string): string {
  return displayItemName(name).normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("cs");
}

/**
 * Položky staré objednávky → řádky košíku podle dnešního katalogu.
 * Pořadí: balení z objednávky (SKU) → přesná shoda názvu „Produkt – balení“
 * → název produktu, má-li produkt jediné balení. Víc možných balení =
 * nehádáme, položka se vypíše jako přeskočená. Slevy a nulové řádky se
 * vynechají. Ceny se berou dnešní (košík je vždy přepočítá).
 */
export function reorderLines(items: ReorderSource[], index: CatalogIndex): ReorderResult {
  const byLineName = new Map<string, string>();
  const byProductName = new Map<string, string[]>();
  for (const product of index.catalog.products) {
    for (const variant of product.variants) {
      byLineName.set(normalizeName(lineName(product, variant)), variant.sku);
    }
    byProductName.set(normalizeName(product.name), product.variants.map((v) => v.sku));
  }
  const quantities = new Map<string, number>();
  const skipped: string[] = [];
  for (const item of items) {
    if (item.unitPriceKc <= 0 || item.quantity <= 0) continue;
    // volitelná krabice (boxOption.ts) není zboží — v pokladně se volí znovu
    if (item.sku === BOX_SKU) continue;
    let sku: string | undefined;
    if (item.sku && index.getVariant(item.sku)) sku = item.sku;
    if (!sku) sku = byLineName.get(normalizeName(item.name));
    if (!sku) {
      const candidates = byProductName.get(normalizeName(item.name));
      if (candidates?.length === 1) sku = candidates[0];
    }
    const found = sku ? index.getVariant(sku) : undefined;
    if (!found || !isOrderable(found.product)) {
      skipped.push(displayItemName(item.name));
      continue;
    }
    quantities.set(found.variant.sku, Math.min(MAX_QUANTITY_PER_LINE, (quantities.get(found.variant.sku) ?? 0) + item.quantity));
  }
  return { lines: [...quantities].map(([sku, quantity]) => ({ sku, quantity })), skipped };
}

/** Položky objednávky karty (jen když objednávka patří té kartě). */
export async function loadReorderItems(db: Db, organizationId: string, orderId: string): Promise<ReorderSource[] | null> {
  const [order] = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.buyerOrganizationId, organizationId)))
    .limit(1);
  if (!order) return null;
  const rows = await db
    .select({
      name: schema.orderItems.name,
      quantity: schema.orderItems.quantity,
      unitPriceKc: schema.orderItems.unitPriceKc,
      variantSku: schema.productVariants.sku,
      skuSnapshot: schema.orderItems.skuSnapshot,
    })
    .from(schema.orderItems)
    .leftJoin(schema.productVariants, eq(schema.productVariants.id, schema.orderItems.productVariantId))
    .where(eq(schema.orderItems.orderId, orderId))
    .orderBy(asc(schema.orderItems.name));
  return rows.map((r) => ({ name: r.name, quantity: r.quantity, unitPriceKc: r.unitPriceKc, sku: r.variantSku ?? r.skuSnapshot }));
}

/**
 * Karta podle e-mailu objednávky: e-mail patří členovi (účet zakládá
 * Begina) právě jedné karty → id karty; žádná nebo víc karet → null
 * (nic se nedohaduje). Samotné IČO kartu nikdy nepřiřadí.
 */
export async function findCardByMemberEmail(db: Db, email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const rows = await db
    .selectDistinct({ organizationId: schema.organizationMemberships.organizationId })
    .from(schema.organizationMemberships)
    .innerJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.organizationMemberships.userId))
    .where(sql`lower(${schema.userProfiles.email}) = ${normalized}`)
    .limit(2);
  return rows.length === 1 ? rows[0].organizationId : null;
}
