// Příjem objednávky zvenku (asistent přes MCP — např. potvrzená objednávka
// z Gmailu) do Objednávek MojeBegina. Dvě fáze:
//
//   planOrderIntake       — JEN ČTENÍ: kontrola vstupu, dohledání zákazníka
//                           (IČO, e-mail, telefon, název), odpovědné osoby,
//                           balení z katalogu a možných duplicit; otisk návrhu.
//   createOrderFromIntake — zápis TÉHOŽ návrhu (otisk se musí shodovat).
//
// Schválení zápisu: trvalý pokyn (Jaroslav: potvrzenou objednávku z Gmailu
// rovnou zapsat) platí JEN pro čistý návrh — sedí kontrolní částka, zákazník
// je jednoznačný, žádná duplicita, žádná blokující chyba ani bod k rozhodnutí
// (decisionReasons). Cokoli jiného zapíše jen výslovné rozhodnutí uživatele.
//
// Pojistky proti duplicitě: stejné externí číslo (dřívější zápis asistenta,
// import WooCommerce, číslo objednávky) = stop, vrací se existující
// objednávka; podobná objednávka (stejný zákazník, stejná částka, ±3 dny) =
// rozhodnutí uživatele. Zápis běží v jedné transakci pod zámkem na externí
// číslo (pg_advisory_xact_lock), takže ani dva souběžné požadavky nezaloží
// stejnou objednávku dvakrát. Existující objednávku tahle cesta nikdy nemění;
// u existující firmy smí jen doplnit PRÁZDNÉ DIČ z ověřeného podkladu.
//
// Kanál: e-shop begina.cz (WooCommerce) = „import“ s external_woocommerce_id
// (model #5215), ostatní zdroje = „manual“. Žádný e-mail ani faktura se tu
// neposílá; číslo faktury vystavené mimo MojeBegina se uloží do historie a
// fakturace MojeBegina k takové objednávce nic nevystaví (issue.ts).
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
  DIC_SOURCE_LABELS,
  ORDER_SOURCE_LABELS,
  phoneKey,
  validateOrderIntake,
  type OrderIntakeInput,
  type OrderIntakeValue,
} from "./orderIntakeValidation";

/** Okno pro „podobnou objednávku“ (stejný zákazník + stejná částka). */
export const SIMILAR_ORDER_DAYS = 3;

export type IntakeApproval = "standing_instruction" | "user_confirmed";

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
  externalWooCommerceId: string | null;
  orderedAt: Date;
  totalKc: number;
  customerName: string | null;
  fulfillmentStatus: string;
  reason: string;
};

export type OrderIntakePlan = {
  value: OrderIntakeValue;
  customer:
    | { status: "existing"; organizationId: string; name: string; ico: string; registeredAddress: string; dic: string | null; matchedBy: string[] }
    | { status: "new"; ico: string; name: string; registeredAddress: string; dic: string | null }
    | { status: "unresolved" };
  /** jediná povolená změna existující firmy: doplnění prázdného DIČ z ověřeného podkladu */
  customerUpdate: { dic: string; source: string; reference: string | null } | null;
  candidates: IntakeCustomerCandidate[];
  responsible: { userId: string; name: string } | null;
  /** id balení z katalogu podle SKU (pořadí jako položky; null = bez vazby) */
  variantIds: (string | null)[];
  /** stejné externí číslo — objednávka už v MojeBegina je */
  duplicates: IntakeExistingOrder[];
  /** stejný zákazník + částka v okně ±3 dny */
  similar: IntakeExistingOrder[];
  /** nelze zapsat vůbec */
  blocking: string[];
  /** zapsat jen po rozhodnutí uživatele (Jaroslava) — trvalý pokyn neplatí */
  decisionReasons: string[];
  /** jen pro informaci — automatický zápis nebrání */
  warnings: string[];
  /** čistý návrh: zápis podle trvalého pokynu bez dalšího potvrzení */
  autoCreateAllowed: boolean;
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
    externalWooCommerceId: (r.external_woocommerce_id as string | null) ?? null,
    orderedAt: new Date(String(r.ordered_at)),
    totalKc: Number(r.total_kc),
    customerName: (r.customer_name as string | null) ?? (r.contact_name as string | null) ?? null,
    fulfillmentStatus: String(r.fulfillment_status),
    reason,
  };
}

const ORDER_COLUMNS = sql`o.id, o.order_number, o.external_woocommerce_id, o.ordered_at, o.total_kc, o.fulfillment_status, o.contact_name, org.name AS customer_name`;

/**
 * Objednávky se stejným externím číslem: import WooCommerce (sloupec i dřívější
 * import #5215 s metadata.externalId), dřívější zápis asistenta, číslo objednávky.
 */
async function findByReference(reference: string): Promise<IntakeExistingOrder[]> {
  const numeric = /^\d{1,15}$/.test(reference) ? Number(reference) : null;
  const found = await rows(sql`
    SELECT DISTINCT ${ORDER_COLUMNS} FROM orders o LEFT JOIN organizations org ON org.id = o.buyer_organization_id
    WHERE o.external_woocommerce_id = ${reference}
       ${numeric !== null ? sql`OR o.order_number = ${numeric}` : sql``}
       OR EXISTS (SELECT 1 FROM order_activity a WHERE a.order_id = o.id AND a.kind = 'created'
                  AND (a.metadata->>'externalReference' = ${reference} OR a.metadata->>'externalId' = ${reference}))
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

type PlanCore = Pick<OrderIntakePlan, "value" | "customer" | "customerUpdate" | "responsible" | "variantIds">;

function fingerprintOf(core: PlanCore): string {
  const customer = core.customer.status === "existing" ? { id: core.customer.organizationId, dic: core.customer.dic } : core.customer;
  return createHash("sha256")
    .update(JSON.stringify({ value: core.value, customer, customerUpdate: core.customerUpdate, responsible: core.responsible?.userId ?? null, variants: core.variantIds }))
    .digest("hex");
}

/** Návrh objednávky — nic nezapisuje. */
export async function planOrderIntake(input: OrderIntakeInput): Promise<{ ok: true; plan: OrderIntakePlan } | { ok: false; error: string }> {
  await requireOrderContext();
  const validated = validateOrderIntake(input, pragueToday(new Date()));
  if (!validated.ok) return validated;
  const value = validated.value;
  const blocking: string[] = [];
  const decisionReasons: string[] = [];
  const warnings: string[] = [];

  // zákazník
  const candidates = await findCandidates(value);
  let customer: OrderIntakePlan["customer"] = { status: "unresolved" };
  if (value.customer.kind === "id") {
    const [org] = await rows(sql`SELECT id, name, ico, registered_address, dic FROM organizations WHERE id = ${value.customer.organizationId}`);
    if (!org) blocking.push("Zákazník s tímto organization_id v MojeBegina není.");
    else if (value.customer.ico !== null && value.customer.ico !== org.ico) {
      blocking.push(`organization_id patří firmě ${String(org.name)} (IČO ${String(org.ico)}), ne IČO ${value.customer.ico}.`);
    } else {
      customer = { status: "existing", organizationId: String(org.id), name: String(org.name), ico: String(org.ico), registeredAddress: String(org.registered_address), dic: (org.dic as string | null) ?? null, matchedBy: ["organization_id"] };
    }
  } else if (value.customer.kind === "ico") {
    const [org] = await rows(sql`SELECT id, name, ico, registered_address, dic FROM organizations WHERE ico = ${value.customer.ico}`);
    if (org) {
      const byIco = candidates.find((c) => c.organizationId === String(org.id));
      customer = { status: "existing", organizationId: String(org.id), name: String(org.name), ico: String(org.ico), registeredAddress: String(org.registered_address), dic: (org.dic as string | null) ?? null, matchedBy: byIco?.matchedBy ?? ["ico"] };
      if (value.customer.name && companyNameKey(value.customer.name) !== companyNameKey(String(org.name))) {
        decisionReasons.push(`IČO ${String(org.ico)} je v MojeBegina vedené jako „${String(org.name)}“, v podkladu „${value.customer.name}“ — ověřte zákazníka.`);
      }
    } else if (!value.customer.name || !value.customer.registeredAddress) {
      blocking.push(`Zákazník s IČO ${value.customer.ico} v MojeBegina není. Pro založení nového zákazníka zadejte i název firmy a sídlo (customer_name, customer_address).`);
    } else {
      customer = { status: "new", ico: value.customer.ico, name: value.customer.name, registeredAddress: value.customer.registeredAddress, dic: value.customerDic?.dic ?? null };
      warnings.push(`Založí se nový zákazník ${value.customer.name} (IČO ${value.customer.ico}).`);
      const others = candidates.filter((c) => c.matchedBy.some((m) => m === "email" || m === "phone"));
      if (others.length > 0) {
        decisionReasons.push(`E-mail nebo telefon kontaktu už patří k jiné firmě (${others.map((c) => `${c.name}, IČO ${c.ico}`).join("; ")}) — ověřte, že jde opravdu o nového zákazníka.`);
      }
    }
  } else {
    const strong = candidates.filter((c) => c.matchedBy.some((m) => m === "email" || m === "phone"));
    if (strong.length === 1) {
      const c = strong[0];
      const [org] = await rows(sql`SELECT dic FROM organizations WHERE id = ${c.organizationId}`);
      customer = { status: "existing", organizationId: c.organizationId, name: c.name, ico: c.ico, registeredAddress: c.registeredAddress, dic: (org?.dic as string | null) ?? null, matchedBy: c.matchedBy };
      decisionReasons.push(`Zákazník je přiřazený jen podle ${c.matchedBy.filter((m) => m !== "name").join(" + ")} (${c.name}, IČO ${c.ico}), ne podle IČO — potvrďte ho.`);
    } else if (candidates.length > 0) {
      blocking.push("Zákazníka nelze přiřadit jednoznačně — vyberte s uživatelem jednu firmu z candidates a pošlete její organization_id (nebo IČO).");
    } else {
      blocking.push("Zákazník nebyl nalezen podle e-mailu, telefonu ani názvu. Zadejte IČO (a u nové firmy i název a sídlo), nebo organization_id existujícího zákazníka. Soukromou osobu bez IČO tahle cesta nezakládá.");
    }
  }

  // DIČ: jen z ověřeného podkladu, existující nikdy nepřepsat
  let customerUpdate: OrderIntakePlan["customerUpdate"] = null;
  const dic = value.customerDic;
  if (dic && customer.status !== "unresolved") {
    const sourceLabel = `${DIC_SOURCE_LABELS[dic.source]}${dic.reference ? ` ${dic.reference}` : ""}`;
    if (dic.dic.startsWith("CZ") && dic.dic !== `CZ${customer.ico}`) {
      decisionReasons.push(`DIČ ${dic.dic} neodpovídá IČO ${customer.ico} — ověřte podklad.`);
    }
    if (customer.status === "existing") {
      if (customer.dic === null || customer.dic === "") {
        customerUpdate = { dic: dic.dic, source: dic.source, reference: dic.reference };
        warnings.push(`U zákazníka ${customer.name} se doplní chybějící DIČ ${dic.dic} (zdroj: ${sourceLabel}).`);
      } else if (customer.dic !== dic.dic) {
        decisionReasons.push(`Zákazník má v MojeBegina DIČ ${customer.dic}, podklad uvádí ${dic.dic} — DIČ se nepřepisuje, ověřte zákazníka.`);
      }
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

  // duplicity a úplnost pro automatický zápis
  const duplicates = value.externalReference ? await findByReference(value.externalReference) : [];
  for (const d of duplicates) {
    blocking.push(`Objednávka s externím číslem ${value.externalReference} už v MojeBegina je (${d.externalWooCommerceId ?? d.orderNumber ?? d.orderId}, ${d.totalKc} Kč). Nic se nezaloží — existující objednávku zkontrolujte v MojeBegina.`);
  }
  const similar = customer.status === "existing" ? await findSimilar(customer.organizationId, value.totalKc, value.orderedAt) : [];
  if (similar.length > 0) {
    decisionReasons.push(`Možná duplicita: zákazník má v okně ±${SIMILAR_ORDER_DAYS} dny objednávku se stejnou částkou (${similar.map((o) => o.externalWooCommerceId ?? o.orderNumber ?? o.orderId).join(", ")}).`);
  }
  if (value.expectedTotalKc === null) decisionReasons.push("Chybí kontrolní celková cena z podkladu (expected_total_kc) — součet nelze ověřit.");
  if (!value.externalReference) decisionReasons.push("Chybí externí číslo objednávky — ochrana proti dvojímu zápisu je jen podle zákazníka a částky.");
  if (value.plannedDeliveryAt !== null && value.plannedDeliveryAt < value.orderedAt) decisionReasons.push("Termín doručení je dřív než datum objednávky.");
  if (value.paymentStatus === "paid") warnings.push("Stav „zaplaceno“ se uloží bez zápisu platby — platbu případně doplňte v detailu objednávky.");
  if (value.externalInvoiceNumber) warnings.push(`Faktura ${value.externalInvoiceNumber} už existuje mimo MojeBegina — MojeBegina k objednávce fakturu nevystaví ani nepošle.`);

  const core: PlanCore = { value, customer, customerUpdate, responsible, variantIds };
  return {
    ok: true,
    plan: {
      ...core,
      candidates,
      duplicates,
      similar,
      blocking,
      decisionReasons,
      warnings,
      autoCreateAllowed: blocking.length === 0 && decisionReasons.length === 0,
      fingerprint: fingerprintOf(core),
    },
  };
}

export type CreateIntakeResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: number | null;
      externalWooCommerceId: string | null;
      paymentVs: string | null;
      channel: "manual" | "import";
      customer: { organizationId: string; name: string; ico: string; created: boolean; dicFilled: string | null };
      totalKc: number;
    }
  | { ok: false; error: string; existing?: IntakeExistingOrder[] };

/**
 * Založí objednávku přesně podle návrhu (expectedFingerprint z planOrderIntake).
 * Jedna transakce: zámek na externí číslo → případně nová firma → objednávka
 * (jen když stejné externí číslo pořád nikde není) → položky → historie →
 * případně doplnění prázdného DIČ (jen když objednávka vznikla).
 */
export async function createOrderFromIntake(
  input: OrderIntakeInput,
  options: { expectedFingerprint: string; approval: IntakeApproval; confirmNotDuplicate: boolean; via: Record<string, unknown> }
): Promise<CreateIntakeResult> {
  const ctx = await requireOrderContext();
  const planned = await planOrderIntake(input);
  if (!planned.ok) return planned;
  const { plan } = planned;
  // duplicita má přednost (srozumitelnější důvod; nezaloží se nic tak jako tak)
  if (plan.duplicates.length > 0) return { ok: false, error: plan.blocking.join(" "), existing: plan.duplicates };
  if (plan.fingerprint !== options.expectedFingerprint) {
    return { ok: false, error: "Údaje objednávky se od připraveného návrhu liší (vstup, zákazník, odpovědná osoba nebo katalog). Nic se nezaložilo — připravte návrh znovu (prepare_order)." };
  }
  if (plan.blocking.length > 0) return { ok: false, error: plan.blocking.join(" ") };
  if (options.approval === "standing_instruction" && !plan.autoCreateAllowed) {
    return {
      ok: false,
      error: `Trvalý pokyn k zápisu platí jen pro čistou objednávku. Tady je potřeba rozhodnutí Jaroslava: ${plan.decisionReasons.join(" ")} Nic se nezaložilo.`,
      existing: plan.similar.length > 0 ? plan.similar : undefined,
    };
  }
  if (plan.similar.length > 0 && !options.confirmNotDuplicate) {
    return { ok: false, error: "Zákazník má podobnou objednávku (stejná částka, ±3 dny). Založení je možné jen s confirm_not_duplicate=true po výslovném rozhodnutí uživatele, že jde o jinou objednávku.", existing: plan.similar };
  }
  const { value, customer, customerUpdate } = plan;
  if (customer.status === "unresolved") return { ok: false, error: "Zákazník není určený." };

  const orderId = randomUUID();
  const today = pragueToday(new Date());
  const orderedAt = value.orderedAt === today ? sql`now()` : sql`${`${value.orderedAt}T12:00:00Z`}::timestamptz`;
  const plannedDelivery = value.plannedDeliveryAt ? sql`${`${value.plannedDeliveryAt}T12:00:00Z`}::timestamptz` : sql`NULL`;
  const buyer =
    customer.status === "existing"
      ? sql`${customer.organizationId}::uuid`
      : sql`(SELECT id FROM organizations WHERE ico = ${customer.ico})`;
  const lockKey = `mojebegina:order-intake:${value.externalReference ?? (customer.status === "existing" ? customer.organizationId : customer.ico)}`;
  const reference = value.externalReference;
  const wooId = value.channel === "import" ? reference : null;
  const duplicateGuard = reference
    ? sql`AND NOT EXISTS (SELECT 1 FROM orders x WHERE x.external_woocommerce_id = ${reference})
          AND NOT EXISTS (SELECT 1 FROM order_activity a WHERE a.kind = 'created'
                          AND (a.metadata->>'externalReference' = ${reference} OR a.metadata->>'externalId' = ${reference}))`
    : sql``;
  const itemValues = sql.join(
    value.items.map(
      (item, i) =>
        sql`(${item.name}::text, ${item.quantity}::int, ${item.unitPriceKc}::int, ${item.lineTotalKc}::int, ${plan.variantIds[i]}::uuid, ${plan.variantIds[i] ? item.sku : null}::text)`
    ),
    sql`, `
  );
  const audit = {
    via: "mcp",
    channel: "mcp",
    approval: options.approval,
    ...options.via,
  };
  const metadata = {
    ...audit,
    source: value.source,
    sourceLabel: ORDER_SOURCE_LABELS[value.source],
    orderChannel: value.channel,
    externalReference: reference,
    externalInvoiceNumber: value.externalInvoiceNumber,
    newCustomer: customer.status === "new",
    dicFilled: customerUpdate?.dic ?? null,
    responsibleUserId: plan.responsible?.userId ?? null,
    responsibleName: plan.responsible?.name ?? null,
  };

  const results = await db.batch([
    db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`),
    customer.status === "new"
      ? db.execute(sql`
          WITH ins AS (
            INSERT INTO organizations (ico, name, registered_address, dic)
            VALUES (${customer.ico}, ${customer.name}, ${customer.registeredAddress}, ${customer.dic})
            ON CONFLICT (ico) DO NOTHING
            RETURNING id
          )
          INSERT INTO organization_activity (organization_id, author_user_id, author_name, kind, metadata)
          SELECT id, ${ctx.userId}, ${ctx.name}, 'created', ${JSON.stringify({ ...audit, source: value.source, externalReference: reference, dicSource: value.customerDic?.source ?? null, dicReference: value.customerDic?.reference ?? null })}::jsonb
          FROM ins`)
      : db.execute(sql`SELECT 1`),
    db.execute(sql`
      INSERT INTO orders (id, channel, external_woocommerce_id, buyer_organization_id, contact_name, contact_phone, contact_email, entered_by_user_id,
                          recipient_name, recipient_address, recipient_phone, subtotal_kc, shipping_kc, total_kc,
                          payment_status, fulfillment_status, planned_delivery_at, responsible_user_id, note, customer_note,
                          shipping_method_label, payment_method_label, ordered_at, paid_at)
      SELECT ${orderId}::uuid, ${value.channel}, ${wooId}, ${buyer}, ${value.contactName}, ${value.contactPhone}, ${value.contactEmail}, ${ctx.userId},
             ${value.deliveryName}, ${value.deliveryAddress}, ${value.deliveryPhone}, ${value.subtotalKc}, ${value.shippingKc}, ${value.totalKc},
             ${value.paymentStatus}, ${value.fulfillmentStatus}, ${plannedDelivery}, ${plan.responsible?.userId ?? null}, ${value.note}, ${value.customerNote},
             ${value.shippingMethod}, ${value.paymentMethod}, ${orderedAt}, ${value.paymentStatus === "paid" ? orderedAt : sql`NULL`}
      WHERE true ${duplicateGuard}
      RETURNING id, order_number, payment_vs, external_woocommerce_id, buyer_organization_id`),
    db.execute(sql`
      INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc, product_variant_id, sku_snapshot)
      SELECT o.id, v.name, v.quantity, v.unit_price_kc, v.line_total_kc, v.variant_id, v.sku
      FROM orders o, (VALUES ${itemValues}) AS v(name, quantity, unit_price_kc, line_total_kc, variant_id, sku)
      WHERE o.id = ${orderId}::uuid`),
    db.execute(sql`
      INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, metadata)
      SELECT id, 'user', ${ctx.userId}, ${ctx.name}, 'created', ${JSON.stringify(metadata)}::jsonb FROM orders WHERE id = ${orderId}::uuid`),
    customerUpdate
      ? db.execute(sql`
          WITH upd AS (
            UPDATE organizations SET dic = ${customerUpdate.dic}
            WHERE id = ${buyer} AND (dic IS NULL OR dic = '') AND EXISTS (SELECT 1 FROM orders WHERE id = ${orderId}::uuid)
            RETURNING id
          )
          INSERT INTO organization_activity (organization_id, author_user_id, author_name, kind, metadata)
          SELECT id, ${ctx.userId}, ${ctx.name}, 'dic_filled',
                 ${JSON.stringify({ ...audit, dic: customerUpdate.dic, dicSource: customerUpdate.source, dicReference: customerUpdate.reference, orderId })}::jsonb
          FROM upd
          RETURNING id`)
      : db.execute(sql`SELECT 1`),
  ]);

  const inserted = (results[2] as { rows: Row[] }).rows[0];
  if (!inserted) {
    const existing = reference ? await findByReference(reference) : [];
    return { ok: false, error: `Objednávku s externím číslem ${reference} mezitím založil jiný požadavek — nic dalšího se nezaložilo.`, existing };
  }
  const dicFilled = customerUpdate && (results[5] as { rows: Row[] }).rows.length > 0 ? customerUpdate.dic : null;
  const [org] = await rows(sql`SELECT id, name, ico FROM organizations WHERE id = ${String(inserted.buyer_organization_id)}`);
  return {
    ok: true,
    orderId,
    orderNumber: inserted.order_number === null ? null : Number(inserted.order_number),
    externalWooCommerceId: (inserted.external_woocommerce_id as string | null) ?? null,
    paymentVs: (inserted.payment_vs as string | null) ?? null,
    channel: value.channel,
    customer: { organizationId: String(org.id), name: String(org.name), ico: String(org.ico), created: customer.status === "new", dicFilled },
    totalKc: value.totalKc,
  };
}
