// Příjem objednávky zvenku (asistent přes MCP — např. potvrzená objednávka
// z Gmailu) do Objednávek MojeBegina. Dvě fáze:
//
//   planOrderIntake    — JEN ČTENÍ: kontrola vstupu, dohledání zákazníka
//                        (IČO, e-mail, telefon, název), odpovědné osoby,
//                        balení z katalogu a možných duplicit; otisk návrhu.
//   createOrderFromIntake — zápis TÉHOŽ návrhu (otisk se musí shodovat).
//
// Pojistky proti duplicitě: stejné externí číslo (z jakéhokoli zdroje) už
// u objednávky je = stop, vrací se existující objednávka; podobná objednávka
// (stejný zákazník, stejná částka, ±3 dny) = stop, dokud uživatel výslovně
// nepotvrdí, že jde o jinou objednávku. Zápis běží v jedné transakci pod
// zámkem na externí číslo (pg_advisory_xact_lock), takže ani dva souběžné
// požadavky nezaloží stejnou objednávku dvakrát. Existující objednávku tahle
// cesta nikdy nemění — jen zakládá novou.
//
// Oprávnění: requireOrderContext (ADMIN/EXECUTIVE) — stejné jako ruční
// „Nová objednávka“. Nový zákazník = jen záznam organizace (IČO, název,
// sídlo, DIČ); žádný uživatelský účet ani pozvánka se nezakládá.
import "server-only";
import { createHash, randomUUID } from "crypto";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { productVariants } from "@/lib/db/schema";
import { pragueToday, matchSalesperson } from "./callActivityValidation";
import { listInternalStaff, requireOrderContext } from "./orders";
import {
  companyNameKey,
  ORDER_SOURCE_LABELS,
  phoneKey,
  validateOrderIntake,
  type OrderIntakeInput,
  type OrderIntakeValue,
} from "./orderIntakeValidation";

/** Okno pro „podobnou objednávku“ (stejný zákazník + stejná částka). */
export const SIMILAR_ORDER_DAYS = 3;

export type IntakeCustomerCandidate = {
  organizationId: string;
  name: string;
  ico: string;
  registeredAddress: string;
  matchedBy: ("ico" | "email" | "phone" | "name")[];
  orderCount: number;
};

export type IntakeExistingOrder = {
  orderId: string;
  orderNumber: number | null;
  orderedAt: Date;
  totalKc: number;
  customerName: string | null;
  fulfillmentStatus: string;
  reason: string;
};

export type OrderIntakePlan = {
  value: OrderIntakeValue;
  customer:
    | { status: "existing"; organizationId: string; name: string; ico: string; registeredAddress: string; matchedBy: string[] }
    | { status: "new"; ico: string; name: string; registeredAddress: string; dic: string | null }
    | { status: "unresolved" };
  candidates: IntakeCustomerCandidate[];
  responsible: { userId: string; name: string } | null;
  /** id balení z katalogu podle SKU (pořadí jako položky; null = bez vazby) */
  variantIds: (string | null)[];
  /** stejné externí číslo — objednávka už v MojeBegina je */
  duplicates: IntakeExistingOrder[];
  /** stejný zákazník + částka v okně ±3 dny — potřebuje výslovné potvrzení */
  similar: IntakeExistingOrder[];
  blocking: string[];
  warnings: string[];
  fingerprint: string;
};

type Row = Record<string, unknown>;
const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows as Row[];

async function findCandidates(value: OrderIntakeValue): Promise<IntakeCustomerCandidate[]> {
  const ico = value.customer.kind === "ico" ? value.customer.ico : value.customer.kind === "id" ? value.customer.ico : null;
  const email = value.contactEmail;
  const phone = phoneKey(value.contactPhone);
  const nameKey = companyNameKey(value.customer.kind === "id" ? null : value.customer.name);
  const parts = [
    ico ? sql`SELECT id AS org_id, 'ico' AS reason FROM organizations WHERE ico = ${ico}` : null,
    email
      ? sql`SELECT buyer_organization_id AS org_id, 'email' AS reason FROM orders WHERE lower(contact_email) = ${email} AND buyer_organization_id IS NOT NULL
            UNION ALL SELECT converted_organization_id, 'email' FROM leads WHERE lower(contact_email) = ${email} AND converted_organization_id IS NOT NULL`
      : null,
    phone
      ? sql`SELECT buyer_organization_id AS org_id, 'phone' AS reason FROM orders WHERE right(regexp_replace(coalesce(contact_phone, ''), '\\D', '', 'g'), 9) = ${phone} AND buyer_organization_id IS NOT NULL
            UNION ALL SELECT converted_organization_id, 'phone' FROM leads WHERE right(regexp_replace(coalesce(contact_phone, ''), '\\D', '', 'g'), 9) = ${phone} AND converted_organization_id IS NOT NULL`
      : null,
    nameKey
      ? sql`SELECT id AS org_id, 'name' AS reason FROM organizations
            WHERE translate(lower(name), 'áäčďéěëíňóöřšťúůüýž', 'aacdeeeinoorstuuuyz') LIKE ${`%${nameKey.split(" ")[0]}%`}`
      : null,
  ].filter((p): p is ReturnType<typeof sql> => p !== null);
  if (parts.length === 0) return [];
  const found = await rows(sql`
    WITH c AS (${sql.join(parts, sql` UNION ALL `)})
    SELECT o.id, o.name, o.ico, o.registered_address, array_agg(DISTINCT c.reason) AS reasons,
           (SELECT count(*) FROM orders x WHERE x.buyer_organization_id = o.id)::int AS order_count
    FROM c JOIN organizations o ON o.id = c.org_id
    GROUP BY o.id, o.name, o.ico, o.registered_address
    LIMIT 20`);
  return found
    .map((r) => ({
      organizationId: String(r.id),
      name: String(r.name),
      ico: String(r.ico),
      registeredAddress: String(r.registered_address),
      matchedBy: (r.reasons as IntakeCustomerCandidate["matchedBy"]).sort(),
      orderCount: Number(r.order_count),
    }))
    // název hledá jen první slovo — tady se zúží na shodu celého klíče názvu
    .filter((c) => c.matchedBy.some((m) => m !== "name") || (nameKey !== null && (companyNameKey(c.name) ?? "").includes(nameKey)))
    .sort((a, b) => b.matchedBy.length - a.matchedBy.length || b.orderCount - a.orderCount)
    .slice(0, 10);
}

function existingOrder(r: Row, reason: string): IntakeExistingOrder {
  return {
    orderId: String(r.id),
    orderNumber: r.order_number === null ? null : Number(r.order_number),
    orderedAt: new Date(String(r.ordered_at)),
    totalKc: Number(r.total_kc),
    customerName: (r.customer_name as string | null) ?? (r.contact_name as string | null) ?? null,
    fulfillmentStatus: String(r.fulfillment_status),
    reason,
  };
}

const ORDER_COLUMNS = sql`o.id, o.order_number, o.ordered_at, o.total_kc, o.fulfillment_status, o.contact_name, org.name AS customer_name`;

/** Objednávky se stejným externím číslem (dřívější příjem, číslo WooCommerce, číslo objednávky). */
async function findByReference(reference: string): Promise<IntakeExistingOrder[]> {
  const numeric = /^\d{1,15}$/.test(reference) ? Number(reference) : null;
  const found = await rows(sql`
    SELECT DISTINCT ${ORDER_COLUMNS} FROM orders o LEFT JOIN organizations org ON org.id = o.buyer_organization_id
    WHERE o.external_woocommerce_id = ${reference}
       ${numeric !== null ? sql`OR o.order_number = ${numeric}` : sql``}
       OR EXISTS (SELECT 1 FROM order_activity a WHERE a.order_id = o.id AND a.kind = 'created' AND a.metadata->>'externalReference' = ${reference})
    LIMIT 5`);
  return found.map((r) => existingOrder(r, `stejné externí číslo ${reference}`));
}

async function findSimilar(organizationId: string, totalKc: number, orderedAt: string): Promise<IntakeExistingOrder[]> {
  const found = await rows(sql`
    SELECT ${ORDER_COLUMNS} FROM orders o LEFT JOIN organizations org ON org.id = o.buyer_organization_id
    WHERE o.buyer_organization_id = ${organizationId} AND o.total_kc = ${totalKc} AND o.fulfillment_status <> 'cancelled'
      AND o.ordered_at BETWEEN ${orderedAt}::date - ${SIMILAR_ORDER_DAYS}::int AND ${orderedAt}::date + ${SIMILAR_ORDER_DAYS + 1}::int
    ORDER BY o.ordered_at DESC LIMIT 5`);
  return found.map((r) => existingOrder(r, `stejný zákazník a částka ${totalKc} Kč do ${SIMILAR_ORDER_DAYS} dnů`));
}

function fingerprintOf(plan: Omit<OrderIntakePlan, "fingerprint" | "candidates" | "duplicates" | "similar" | "blocking" | "warnings">): string {
  const customer = plan.customer.status === "existing" ? { id: plan.customer.organizationId } : plan.customer;
  return createHash("sha256")
    .update(JSON.stringify({ value: plan.value, customer, responsible: plan.responsible?.userId ?? null, variants: plan.variantIds }))
    .digest("hex");
}

/** Návrh objednávky — nic nezapisuje. */
export async function planOrderIntake(input: OrderIntakeInput): Promise<{ ok: true; plan: OrderIntakePlan } | { ok: false; error: string }> {
  await requireOrderContext();
  const validated = validateOrderIntake(input, pragueToday(new Date()));
  if (!validated.ok) return validated;
  const value = validated.value;
  const blocking: string[] = [];
  const warnings: string[] = [];

  // zákazník
  const candidates = await findCandidates(value);
  let customer: OrderIntakePlan["customer"] = { status: "unresolved" };
  if (value.customer.kind === "id") {
    const [org] = await rows(sql`SELECT id, name, ico, registered_address FROM organizations WHERE id = ${value.customer.organizationId}`);
    if (!org) blocking.push("Zákazník s tímto organization_id v MojeBegina není.");
    else if (value.customer.ico !== null && value.customer.ico !== org.ico) {
      blocking.push(`organization_id patří firmě ${String(org.name)} (IČO ${String(org.ico)}), ne IČO ${value.customer.ico}.`);
    } else {
      customer = { status: "existing", organizationId: String(org.id), name: String(org.name), ico: String(org.ico), registeredAddress: String(org.registered_address), matchedBy: ["organization_id"] };
    }
  } else if (value.customer.kind === "ico") {
    const byIco = candidates.find((c) => c.matchedBy.includes("ico"));
    if (byIco) {
      customer = { status: "existing", organizationId: byIco.organizationId, name: byIco.name, ico: byIco.ico, registeredAddress: byIco.registeredAddress, matchedBy: byIco.matchedBy };
      if (value.customer.name && companyNameKey(value.customer.name) !== companyNameKey(byIco.name)) {
        warnings.push(`IČO ${byIco.ico} je v MojeBegina vedené jako „${byIco.name}“ (v podkladu „${value.customer.name}“) — objednávka se přiřadí k existující firmě.`);
      }
    } else if (!value.customer.name || !value.customer.registeredAddress) {
      blocking.push(`Zákazník s IČO ${value.customer.ico} v MojeBegina není. Pro založení nového zákazníka zadejte i název firmy a sídlo (customer_name, customer_address).`);
    } else {
      customer = { status: "new", ico: value.customer.ico, name: value.customer.name, registeredAddress: value.customer.registeredAddress, dic: value.customer.dic };
      const others = candidates.filter((c) => c.matchedBy.some((m) => m === "email" || m === "phone"));
      if (others.length > 0) {
        warnings.push(`E-mail nebo telefon kontaktu už patří k jiné firmě (${others.map((c) => `${c.name}, IČO ${c.ico}`).join("; ")}) — ověřte, že jde opravdu o nového zákazníka.`);
      }
    }
  } else {
    const strong = candidates.filter((c) => c.matchedBy.some((m) => m === "email" || m === "phone"));
    if (strong.length === 1) {
      const c = strong[0];
      customer = { status: "existing", organizationId: c.organizationId, name: c.name, ico: c.ico, registeredAddress: c.registeredAddress, matchedBy: c.matchedBy };
      warnings.push(`Zákazník přiřazen podle ${c.matchedBy.join(" + ")}: ${c.name} (IČO ${c.ico}) — ověřte to s uživatelem.`);
    } else if (candidates.length > 0) {
      blocking.push("Zákazníka nelze přiřadit jednoznačně — vyberte s uživatelem jednu firmu z candidates a pošlete její organization_id (nebo IČO).");
    } else {
      blocking.push("Zákazník nebyl nalezen podle e-mailu, telefonu ani názvu. Zadejte IČO (a u nové firmy i název a sídlo), nebo organization_id existujícího zákazníka. Soukromou osobu bez IČO tahle cesta nezakládá.");
    }
  }

  // odpovědná osoba
  let responsible: OrderIntakePlan["responsible"] = null;
  if (value.responsible) {
    const staff = await listInternalStaff();
    const match = matchSalesperson(value.responsible, staff);
    if (match.kind === "one") responsible = { userId: match.person.userId, name: match.person.name ?? match.person.email };
    else {
      const options = (match.kind === "many" ? match.candidates : staff).map((s) => s.name ?? s.email).join(", ");
      blocking.push(`Odpovědnou osobu „${value.responsible}“ nelze určit jednoznačně. Možnosti: ${options}.`);
    }
  }

  // balení z katalogu (volitelně podle SKU)
  const skus = [...new Set(value.items.map((i) => i.sku).filter((s): s is string => s !== null))];
  const variants = skus.length
    ? await db.select({ id: productVariants.id, sku: productVariants.sku }).from(productVariants).where(inArray(productVariants.sku, skus))
    : [];
  const bySku = new Map(variants.map((v) => [v.sku, v.id]));
  const variantIds = value.items.map((i) => (i.sku ? (bySku.get(i.sku) ?? null) : null));
  for (const item of value.items) {
    if (item.sku && !bySku.has(item.sku)) warnings.push(`SKU „${item.sku}“ v katalogu není — položka „${item.name}“ se uloží bez vazby na katalog.`);
  }

  // duplicity
  const duplicates = value.externalReference ? await findByReference(value.externalReference) : [];
  for (const d of duplicates) {
    blocking.push(`Objednávka s externím číslem ${value.externalReference} už v MojeBegina je (${d.orderNumber ?? d.orderId}, ${d.totalKc} Kč). Nic se nezaloží — existující objednávku zkontrolujte v MojeBegina.`);
  }
  const similar = customer.status === "existing" ? await findSimilar(customer.organizationId, value.totalKc, value.orderedAt) : [];
  if (similar.length > 0) {
    warnings.push(`Možná duplicita: zákazník má v okně ±${SIMILAR_ORDER_DAYS} dny objednávku se stejnou částkou. Založit lze jen s confirm_not_duplicate=true po potvrzení uživatele.`);
  }
  if (value.paymentStatus === "paid") warnings.push("Stav „zaplaceno“ se uloží bez zápisu platby — platbu případně doplňte v detailu objednávky.");
  if (value.plannedDeliveryAt !== null && value.plannedDeliveryAt < value.orderedAt) warnings.push("Termín doručení je dřív než datum objednávky.");

  const core = { value, customer, responsible, variantIds };
  return {
    ok: true,
    plan: { ...core, candidates, duplicates, similar, blocking, warnings, fingerprint: fingerprintOf(core) },
  };
}

export type CreateIntakeResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: number | null;
      paymentVs: string | null;
      customer: { organizationId: string; name: string; ico: string; created: boolean };
      totalKc: number;
    }
  | { ok: false; error: string; existing?: IntakeExistingOrder[] };

/**
 * Založí objednávku přesně podle návrhu (expectedFingerprint z planOrderIntake).
 * Jedna transakce: zámek na externí číslo → případně nová firma → objednávka
 * (jen když stejné externí číslo pořád nikde není) → položky → historie.
 */
export async function createOrderFromIntake(
  input: OrderIntakeInput,
  options: { expectedFingerprint: string; confirmNotDuplicate: boolean; via: Record<string, unknown> }
): Promise<CreateIntakeResult> {
  const ctx = await requireOrderContext();
  const planned = await planOrderIntake(input);
  if (!planned.ok) return planned;
  const { plan } = planned;
  if (plan.fingerprint !== options.expectedFingerprint) {
    return { ok: false, error: "Údaje objednávky se od zobrazeného návrhu liší (vstup, zákazník, odpovědná osoba nebo katalog). Nic se nezaložilo — připravte návrh znovu (prepare_order) a nechte ho potvrdit." };
  }
  if (plan.duplicates.length > 0) return { ok: false, error: plan.blocking.join(" "), existing: plan.duplicates };
  if (plan.blocking.length > 0) return { ok: false, error: plan.blocking.join(" ") };
  if (plan.similar.length > 0 && !options.confirmNotDuplicate) {
    return { ok: false, error: "Zákazník má podobnou objednávku (stejná částka, ±3 dny). Založení je možné jen s confirm_not_duplicate=true po výslovném potvrzení uživatele, že jde o jinou objednávku.", existing: plan.similar };
  }
  const { value, customer } = plan;
  if (customer.status === "unresolved") return { ok: false, error: "Zákazník není určený." };

  const orderId = randomUUID();
  const today = pragueToday(new Date());
  const orderedAt = value.orderedAt === today ? sql`now()` : sql`${`${value.orderedAt}T12:00:00Z`}::timestamptz`;
  const planned_ = value.plannedDeliveryAt ? sql`${`${value.plannedDeliveryAt}T12:00:00Z`}::timestamptz` : sql`NULL`;
  const buyer =
    customer.status === "existing"
      ? sql`${customer.organizationId}::uuid`
      : sql`(SELECT id FROM organizations WHERE ico = ${customer.ico})`;
  const lockKey = `mojebegina:order-intake:${value.externalReference ?? (customer.status === "existing" ? customer.organizationId : customer.ico)}`;
  const reference = value.externalReference;
  const duplicateGuard = reference
    ? sql`AND NOT EXISTS (SELECT 1 FROM orders x WHERE x.external_woocommerce_id = ${reference})
          AND NOT EXISTS (SELECT 1 FROM order_activity a WHERE a.kind = 'created' AND a.metadata->>'externalReference' = ${reference})`
    : sql``;
  const itemValues = sql.join(
    value.items.map(
      (item, i) =>
        sql`(${item.name}::text, ${item.quantity}::int, ${item.unitPriceKc}::int, ${item.lineTotalKc}::int, ${plan.variantIds[i]}::uuid, ${plan.variantIds[i] ? item.sku : null}::text)`
    ),
    sql`, `
  );
  const metadata = {
    via: "mcp",
    source: value.source,
    sourceLabel: ORDER_SOURCE_LABELS[value.source],
    externalReference: reference,
    newCustomer: customer.status === "new",
    responsibleUserId: plan.responsible?.userId ?? null,
    responsibleName: plan.responsible?.name ?? null,
    ...options.via,
  };

  const results = await db.batch([
    db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`),
    customer.status === "new"
      ? db.execute(sql`
          INSERT INTO organizations (ico, name, registered_address, dic)
          VALUES (${customer.ico}, ${customer.name}, ${customer.registeredAddress}, ${customer.dic})
          ON CONFLICT (ico) DO NOTHING`)
      : db.execute(sql`SELECT 1`),
    db.execute(sql`
      INSERT INTO orders (id, channel, buyer_organization_id, contact_name, contact_phone, contact_email, entered_by_user_id,
                          recipient_name, recipient_address, recipient_phone, subtotal_kc, shipping_kc, total_kc,
                          payment_status, fulfillment_status, planned_delivery_at, responsible_user_id, note, customer_note,
                          shipping_method_label, payment_method_label, ordered_at, paid_at)
      SELECT ${orderId}::uuid, 'manual', ${buyer}, ${value.contactName}, ${value.contactPhone}, ${value.contactEmail}, ${ctx.userId},
             ${value.deliveryName}, ${value.deliveryAddress}, ${value.deliveryPhone}, ${value.subtotalKc}, ${value.shippingKc}, ${value.totalKc},
             ${value.paymentStatus}, ${value.fulfillmentStatus}, ${planned_}, ${plan.responsible?.userId ?? null}, ${value.note}, ${value.customerNote},
             ${value.shippingMethod}, ${value.paymentMethod}, ${orderedAt}, ${value.paymentStatus === "paid" ? orderedAt : sql`NULL`}
      WHERE true ${duplicateGuard}
      RETURNING id, order_number, payment_vs, buyer_organization_id`),
    db.execute(sql`
      INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc, product_variant_id, sku_snapshot)
      SELECT o.id, v.name, v.quantity, v.unit_price_kc, v.line_total_kc, v.variant_id, v.sku
      FROM orders o, (VALUES ${itemValues}) AS v(name, quantity, unit_price_kc, line_total_kc, variant_id, sku)
      WHERE o.id = ${orderId}::uuid`),
    db.execute(sql`
      INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, metadata)
      SELECT id, 'user', ${ctx.userId}, ${ctx.name}, 'created', ${JSON.stringify(metadata)}::jsonb FROM orders WHERE id = ${orderId}::uuid`),
  ]);

  const inserted = (results[2] as { rows: Row[] }).rows[0];
  if (!inserted) {
    const existing = reference ? await findByReference(reference) : [];
    return { ok: false, error: `Objednávku s externím číslem ${reference} mezitím založil jiný požadavek — nic dalšího se nezaložilo.`, existing };
  }
  const [org] = await rows(sql`SELECT id, name, ico FROM organizations WHERE id = ${String(inserted.buyer_organization_id)}`);
  return {
    ok: true,
    orderId,
    orderNumber: inserted.order_number === null ? null : Number(inserted.order_number),
    paymentVs: (inserted.payment_vs as string | null) ?? null,
    customer: { organizationId: String(org.id), name: String(org.name), ico: String(org.ico), created: customer.status === "new" },
    totalKc: value.totalKc,
  };
}
