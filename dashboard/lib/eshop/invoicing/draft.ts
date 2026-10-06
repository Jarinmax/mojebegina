// ESHOP 1.0 — návrh prodejní faktury k zaplacené e-shopové objednávce.
// Čistá funkce bez I/O: z objednávky, položek a plateb sestaví
// poskytovatelsky neutrální návrh (InvoiceDraft) a seznam problémů.
// Převod do konkrétního poskytovatele (dnes iDoklad) je v idoklad.ts,
// uložení a pojistka proti dvojí faktuře v service.ts.
//
// Begina je neplátce DPH (rozhodnutí vedení 5. 10. 2026) — ceny jsou
// konečné, bez rozpisu DPH. Datum vystavení = DUZP = splatnost = den, kdy
// byla objednávka uhrazená celá (faktura vzniká až po zaplacení).

export type ProblemSeverity =
  /** chyba v datech — návrh nesedí, opravit před vystavením */
  | "error"
  /** chybí nastavení pro ostré vystavování (v režimu návrhu nevadí) */
  | "live"
  /** upozornění — vystavit jde, ale stojí za kontrolu */
  | "warning";

export type InvoiceProblem = { code: string; severity: ProblemSeverity; message: string };

export type DraftOrder = {
  id: string;
  channel: string;
  orderNumber: number | null;
  paymentVs: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  recipientAddress: string | null;
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
  /** variabilní symbol = orders.payment_vs (zákazník s ním platil) */
  vs: string | null;
  customer: {
    kind: "person";
    name: string | null;
    email: string | null;
    phone: string | null;
    address: DraftAddress | null;
  };
  lines: DraftLine[];
  totalKc: number;
  currency: "CZK";
  vatMode: "non_payer";
  /** YYYY-MM-DD (Praha) — den úplné úhrady */
  issueDate: string | null;
  taxableDate: string | null;
  dueDate: string | null;
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

  if (order.channel !== "eshop") add("not_eshop", "error", "Návrh faktury se tvoří jen k e-shopovým objednávkám.");

  const lines: DraftLine[] = items.map((item) => ({
    kind: "item",
    name: item.name,
    sku: item.sku,
    quantity: item.quantity,
    unitPriceKc: item.unitPriceKc,
    totalKc: item.lineTotalKc,
  }));
  if (order.shippingKc > 0) {
    const label = order.shippingMethodLabel ?? "Doprava";
    lines.push({ kind: "shipping", name: `Doprava: ${label}`, sku: null, quantity: 1, unitPriceKc: order.shippingKc, totalKc: order.shippingKc });
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
  const issueDate = paidOn ? PRAGUE_DATE.format(paidOn) : null;
  if (!issueDate) add("no_payment_date", "error", "Chybí datum úhrady — není podle čeho určit datum vystavení.");

  if (!order.paymentVs) add("no_vs", "error", "Objednávka nemá variabilní symbol (payment_vs).");
  const name = order.contactName?.trim() || null;
  const email = order.contactEmail?.trim().toLowerCase() || null;
  if (!name) add("no_customer_name", "error", "Chybí jméno zákazníka.");
  if (!email) add("no_customer_email", "error", "Chybí e-mail zákazníka — podle něj se zákazník páruje s kontaktem v iDokladu.");

  const address = parseCheckoutAddress(order.recipientAddress);
  if (!order.recipientAddress) {
    add("no_address", "warning", "Zákazník nezadal adresu (osobní odběr) — na faktuře bude jen jméno a e-mail.");
  } else if (!address) {
    add("address_unparsed", "warning", `Adresu „${order.recipientAddress}“ se nepodařilo rozdělit na ulici, PSČ a město — zkontrolovat.`);
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
      vs: order.paymentVs,
      customer: { kind: "person", name, email, phone: order.contactPhone?.trim() || null, address },
      lines,
      totalKc: order.totalKc,
      currency: "CZK",
      vatMode: "non_payer",
      issueDate,
      taxableDate: issueDate,
      dueDate: issueDate,
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
      note: `E-shop objednávka ${order.orderNumber ?? order.id.slice(0, 8)}`,
    },
  };
}

/** Blokující problémy (data); v ostrém režimu blokují i „live“. */
export function blockingProblems(problems: InvoiceProblem[], mode: "dry_run" | "live"): InvoiceProblem[] {
  return problems.filter((p) => p.severity === "error" || (mode === "live" && p.severity === "live"));
}
