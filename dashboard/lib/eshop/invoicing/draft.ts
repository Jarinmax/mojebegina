// ESHOP 1.0 — návrh prodejní faktury k zaplacené e-shopové objednávce.
// Čistá funkce bez I/O: z objednávky, položek a plateb sestaví
// poskytovatelsky neutrální návrh (InvoiceDraft) a seznam problémů.
// Převod do konkrétního poskytovatele (dnes iDoklad) je v idoklad.ts,
// uložení a pojistka proti dvojí faktuře v service.ts.
//
// Begina je neplátce DPH (rozhodnutí vedení 5. 10. 2026) — ceny jsou
// konečné, bez rozpisu DPH. Od 20. 10. 2026: datum vystavení = splatnost
// = den, kdy se faktura skutečně vystavuje; datum úhrady = den, kdy byla
// objednávka uhrazená celá (faktura vzniká až po zaplacení). Dřív (faktura
// 9260001) bylo datum vystavení = den úhrady. DUZP zatím beze změny (den
// úhrady) — rozhodný den (dodání / jiný) potvrdí Jaroslav s Lucií.

export type ProblemSeverity =
  /** chyba v datech — návrh nesedí, opravit před vystavením */
  | "error"
  /** chybí nastavení pro ostré vystavování (v režimu návrhu nevadí) */
  | "live"
  /** upozornění — vystavit jde, ale stojí za kontrolu */
  | "warning";

export type InvoiceProblem = { code: string; severity: ProblemSeverity; message: string };

/** Firma odběratele (organizations) — u objednávky s buyer_organization_id. */
export type DraftCompany = { name: string; ico: string; dic: string | null; registeredAddress: string | null };

export type DraftOrder = {
  id: string;
  channel: string;
  orderNumber: number | null;
  paymentVs: string | null;
  /** číslo objednávky ve WooCommerce (import z begina.cz), jinak null */
  externalWooCommerceId?: string | null;
  company?: DraftCompany | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  /** příjemce zásilky (doručovací adresa) — může se lišit od odběratele */
  recipientName?: string | null;
  recipientAddress: string | null;
  /** kód dopravy; jen „osobni-odber“ = bez zásilky (import z WooCommerce: null = zásilka) */
  shippingMethodCode?: string | null;
  shippingMethodLabel: string | null;
  subtotalKc: number;
  discountKc: number;
  shippingKc: number;
  totalKc: number;
  paidAt: Date | null;
};

export type DraftItem = { name: string; quantity: number; unitPriceKc: number; lineTotalKc: number; sku: string | null };

export type DraftPayment = {
  id: string;
  source: string;
  externalId: string;
  method: string;
  direction: string;
  status: string;
  amountHal: number;
  occurredAt: Date | null;
};

export type DraftAddress = { street: string; city: string; zip: string; country: "CZ" };

export type DraftDelivery = {
  kind: "pickup" | "shipment";
  /** příjemce zásilky (recipient_name) */
  name: string | null;
  /** ověřená dodací adresa (recipient_address); null = osobní odběr nebo chyba */
  address: DraftAddress | null;
  method: string | null;
};

/** Jediný kód dopravy bez zásilky (lib/eshop/shipping.ts). */
export const PICKUP_SHIPPING_CODE = "osobni-odber";

export type DraftLine = {
  kind: "item" | "shipping" | "discount";
  name: string;
  sku: string | null;
  quantity: number;
  unitPriceKc: number;
  totalKc: number;
};

export type InvoiceDraft = {
  version: 1;
  orderId: string;
  orderNumber: number | null;
  /** variabilní symbol (invoiceVsFor): e-shop = orders.payment_vs, import z WooCommerce = číslo objednávky */
  vs: string | null;
  /** číslo objednávky na faktuře (iDoklad OrderNumber) */
  orderReference: string | null;
  customer: {
    /** person = soukromá osoba (jméno, e-mail); company = firma (název, IČO, DIČ, sídlo) */
    kind: "person" | "company";
    /** osoba: jméno; firma: název firmy */
    name: string | null;
    email: string | null;
    phone: string | null;
    address: DraftAddress | null;
    ico: string | null;
    dic: string | null;
    /** firma: kontaktní osoba z objednávky */
    contactPerson: string | null;
  };
  /**
   * Doručení — jen z explicitních polí objednávky (recipient_name,
   * recipient_address, kód dopravy), nikdy z poznámky. Zásilka musí mít
   * ověřenou dodací adresu (jinak blokující chyba); na faktuře jako
   * „Dodací adresa“ v textu za položkami. Osobní odběr adresu nemá.
   */
  delivery?: DraftDelivery;
  lines: DraftLine[];
  totalKc: number;
  currency: "CZK";
  vatMode: "non_payer";
  /** YYYY-MM-DD (Praha) — den vystavení faktury (starší návrhy: den úplné úhrady) */
  issueDate: string | null;
  taxableDate: string | null;
  dueDate: string | null;
  /** YYYY-MM-DD (Praha) — den úplné úhrady (datum úhrady v iDokladu); starší návrhy bez něj */
  paidDate?: string | null;
  /** způsob úhrady podle platby, která objednávku doplatila */
  paymentMethod: string | null;
  paidHal: number;
  /** platby, které fakturu kryjí (vazba faktura ↔ platba) */
  payments: { id: string; source: string; externalId: string; method: string; amountHal: number; occurredAt: string | null }[];
  /** ID e-shopové číselné řady u poskytovatele; null = zatím nepotvrzené */
  numberSeriesId: string | null;
  note: string;
};

export type DraftConfig = {
  numberSeriesId: string | null;
  /** problém s nastavením řady (neplatné ID) — z numberSeries.parseSeriesId */
  numberSeriesProblem?: InvoiceProblem | null;
  /** ostrý režim: řadu a číselníky ověřuje až vystavení (issue.ts) proti iDokladu */
  live?: boolean;
  /** okamžik sestavení návrhu = den vystavení (výchozí teď) */
  now?: Date;
};

const PRAGUE_DATE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" });

/** „Prvního pluku 14, 186 00 Praha“ (formát z pokladny) → ulice / PSČ / město. */
export function parseCheckoutAddress(raw: string | null): DraftAddress | null {
  if (!raw) return null;
  const comma = raw.lastIndexOf(",");
  if (comma < 0) return null;
  const street = raw.slice(0, comma).trim();
  const match = /^(\d{3}\s?\d{2})\s+(.+)$/.exec(raw.slice(comma + 1).trim());
  if (!street || !match) return null;
  return { street, zip: match[1].replace(/\s/g, ""), city: match[2].trim(), country: "CZ" };
}

const WOO_ID = /^[1-9][0-9]{0,9}$/;

/**
 * Smí MojeBegina k objednávce vystavit fakturu? E-shopová objednávka, nebo
 * objednávka z WooCommerce importovaná do MojeBegina (channel „import“
 * s číslem objednávky z WooCommerce). Ruční B2B objednávky a starší importy
 * bez čísla z WooCommerce ne.
 */
export function isInvoiceableOrder(order: Pick<DraftOrder, "channel" | "externalWooCommerceId">): boolean {
  if (order.channel === "eshop") return true;
  return order.channel === "import" && WOO_ID.test(order.externalWooCommerceId ?? "");
}

/** VS faktury: e-shop = payment_vs (7xxxxxxx), import z WooCommerce = číslo objednávky ve WooCommerce. */
export function invoiceVsFor(order: Pick<DraftOrder, "channel" | "paymentVs" | "externalWooCommerceId">): string | null {
  if (order.channel === "eshop") return order.paymentVs && /^7\d{7}$/.test(order.paymentVs) ? order.paymentVs : null;
  return isInvoiceableOrder(order) ? (order.externalWooCommerceId ?? null) : null;
}

function settled(p: DraftPayment): boolean {
  return p.status === "succeeded" || p.status === "refunded";
}

export function buildInvoiceDraft(
  order: DraftOrder,
  items: DraftItem[],
  payments: DraftPayment[],
  config: DraftConfig
): { draft: InvoiceDraft; problems: InvoiceProblem[] } {
  const problems: InvoiceProblem[] = [];
  const add = (code: string, severity: ProblemSeverity, message: string) => problems.push({ code, severity, message });

  if (!isInvoiceableOrder(order)) {
    add("not_eshop", "error", "Návrh faktury se tvoří jen k e-shopovým objednávkám a objednávkám importovaným z WooCommerce.");
  }

  const lines: DraftLine[] = items.map((item) => ({
    kind: "item",
    name: item.name,
    sku: item.sku,
    quantity: item.quantity,
    unitPriceKc: item.unitPriceKc,
    totalKc: item.lineTotalKc,
  }));
  if (order.shippingKc > 0) {
    // položka = název dopravy (např. „Chlazená přeprava“), bez předpony
    const label = order.shippingMethodLabel?.trim() || "Doprava";
    lines.push({ kind: "shipping", name: label, sku: null, quantity: 1, unitPriceKc: order.shippingKc, totalKc: order.shippingKc });
  }
  if (order.discountKc > 0) {
    lines.push({ kind: "discount", name: "Sleva", sku: null, quantity: 1, unitPriceKc: -order.discountKc, totalKc: -order.discountKc });
  }
  if (items.length === 0) add("no_items", "error", "Objednávka nemá žádné položky.");
  const linesTotal = lines.reduce((sum, line) => sum + line.totalKc, 0);
  if (linesTotal !== order.totalKc) {
    add("total_mismatch", "error", `Součet položek (${linesTotal} Kč) nesedí s celkem objednávky (${order.totalKc} Kč).`);
  }

  // Platby, které se skutečně pohnuly (příjmy minus proběhlé vratky).
  const inflows = payments.filter((p) => p.direction === "inflow" && settled(p));
  const refunds = payments.filter((p) => p.direction === "outflow" && p.status === "succeeded");
  const paidHal = inflows.reduce((s, p) => s + p.amountHal, 0) - refunds.reduce((s, p) => s + p.amountHal, 0);
  if (paidHal < order.totalKc * 100) {
    add("not_fully_paid", "error", "Objednávka není uhrazená celá — faktura vzniká až po úplné úhradě.");
  }
  const lastInflow = [...inflows].sort((a, b) => (a.occurredAt?.getTime() ?? 0) - (b.occurredAt?.getTime() ?? 0)).at(-1);
  const paidOn = lastInflow?.occurredAt ?? order.paidAt;
  const paidDate = paidOn ? PRAGUE_DATE.format(paidOn) : null;
  if (!paidDate) add("no_payment_date", "error", "Chybí datum úhrady — není podle čeho vyplnit úhradu faktury.");
  const issueDate = PRAGUE_DATE.format(config.now ?? new Date());

  const vs = invoiceVsFor(order);
  if (!vs) add("no_vs", "error", "Objednávka nemá variabilní symbol (payment_vs, u importu číslo objednávky z WooCommerce).");
  const contactName = order.contactName?.trim() || null;
  const email = order.contactEmail?.trim().toLowerCase() || null;
  const company = order.company ?? null;
  const name = company ? company.name.trim() || null : contactName;
  if (!name) add("no_customer_name", "error", company ? "Chybí název firmy." : "Chybí jméno zákazníka.");
  if (company && !/^[0-9]{8}$/.test(company.ico)) add("company_ico_invalid", "error", `IČO firmy „${company.ico}“ nemá 8 číslic.`);
  if (!email) add("no_customer_email", "error", "Chybí e-mail zákazníka — podle něj se zákazník páruje s kontaktem v iDokladu.");

  // doručení: jen explicitní pole objednávky (nikdy poznámka zákazníka)
  const pickup = order.shippingMethodCode === PICKUP_SHIPPING_CODE;
  const recipientName = order.recipientName?.trim() || null;
  const rawDelivery = order.recipientAddress?.trim() || null;
  const deliveryAddress = pickup ? null : parseCheckoutAddress(rawDelivery);
  if (!pickup) {
    const fix = "opravit u objednávky, faktura se do té doby nevystaví";
    if (!rawDelivery) {
      add("delivery_address_missing", "error", `Zásilka nemá dodací adresu — ${fix}.`);
    } else if (!deliveryAddress) {
      add("delivery_address_unparsed", "error", `Dodací adresu „${rawDelivery}“ nejde spolehlivě rozdělit na ulici, PSČ a obec — ${fix}.`);
    } else if (!/\p{L}/u.test(deliveryAddress.street)) {
      add("delivery_address_unreliable", "error", `Dodací adresa „${rawDelivery}“ nemá před číslem ulici ani obec — ${fix}.`);
    }
    if (!recipientName) add("delivery_recipient_missing", "error", `Zásilka nemá příjemce (jméno) — ${fix}.`);
  }
  const verifiedDelivery = deliveryAddress && /\p{L}/u.test(deliveryAddress.street) ? deliveryAddress : null;

  // firma: fakturační adresa = sídlo; osoba: adresa z pokladny
  const rawAddress = company ? company.registeredAddress : order.recipientAddress;
  const address = parseCheckoutAddress(rawAddress);
  if (company && !address) {
    add("company_address_unparsed", "error", `Sídlo firmy „${rawAddress ?? "—"}“ nejde rozdělit na ulici, PSČ a město — opravit u firmy.`);
  } else if (!rawAddress) {
    add("no_address", "warning", "Zákazník nezadal adresu (osobní odběr) — na faktuře bude jen jméno a e-mail.");
  } else if (!address) {
    add("address_unparsed", "warning", `Adresu „${rawAddress}“ se nepodařilo rozdělit na ulici, PSČ a město — zkontrolovat.`);
  }

  if (config.numberSeriesProblem) {
    problems.push(config.numberSeriesProblem);
  } else if (!config.numberSeriesId) {
    add(
      "no_number_series",
      "live",
      "Chybí ID e-shopové číselné řady v iDokladu (IDOKLAD_ESHOP_SEQUENCE_ID) — doplnit před ostrým vystavováním."
    );
  } else if (!config.live) {
    add(
      "number_series_unverified",
      "live",
      `Řadu ID ${config.numberSeriesId} ověřit v iDokladu: existuje, je pro vydané faktury a není výchozí (výchozí patří B2B).`
    );
  }
  if (!config.live) {
    add(
      "verify_idoklad_fields",
      "live",
      "Před ostrým zapnutím ověřit read-only číselníky iDokladu (způsob úhrady, CZK, Česká republika, typ ceny u neplátce)."
    );
  }

  return {
    problems,
    draft: {
      version: 1,
      orderId: order.id,
      orderNumber: order.orderNumber,
      vs,
      orderReference: order.channel === "eshop" ? (order.orderNumber !== null ? String(order.orderNumber) : null) : (order.externalWooCommerceId ?? null),
      customer: {
        kind: company ? "company" : "person",
        name,
        email,
        phone: order.contactPhone?.trim() || null,
        address,
        ico: company?.ico ?? null,
        dic: company?.dic ?? null,
        contactPerson: company ? contactName : null,
      },
      delivery: {
        kind: pickup ? "pickup" : "shipment",
        name: recipientName,
        address: verifiedDelivery,
        method: order.shippingMethodLabel?.trim() || null,
      },
      lines,
      totalKc: order.totalKc,
      currency: "CZK",
      vatMode: "non_payer",
      issueDate,
      // DUZP zatím beze změny (den úhrady) — čeká na rozhodnutí (dodání / jiný rozhodný den)
      taxableDate: paidDate,
      dueDate: issueDate,
      paidDate,
      paymentMethod: lastInflow?.method ?? null,
      paidHal,
      payments: inflows.map((p) => ({
        id: p.id,
        source: p.source,
        externalId: p.externalId,
        method: p.method,
        amountHal: p.amountHal,
        occurredAt: p.occurredAt ? p.occurredAt.toISOString() : null,
      })),
      numberSeriesId: config.numberSeriesId,
      note:
        order.channel === "eshop"
          ? `E-shop objednávka ${order.orderNumber ?? order.id.slice(0, 8)}`
          : `Objednávka ${order.externalWooCommerceId} (begina.cz)`,
    },
  };
}

/** Blokující problémy (data); v ostrém režimu blokují i „live“. */
export function blockingProblems(problems: InvoiceProblem[], mode: "dry_run" | "live"): InvoiceProblem[] {
  return problems.filter((p) => p.severity === "error" || (mode === "live" && p.severity === "live"));
}
