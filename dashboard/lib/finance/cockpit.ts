// Finance 1.0 — data pro obrazovku Finance (/rizeni-firmy/finance) v jednom
// objektu. Stránka je jen zobrazí; žádné počítání v komponentách, aby
// čísla v UI, v testech a později ve view byla vždy stejná.
import { pragueToday, currentMonthPeriod, dayPeriod, previousMonthPeriod } from "./periods";
import {
  buildFinanceContext,
  cashFlow,
  invoicedRevenue,
  paidRevenue,
  payables,
  receivables,
  recordedCosts,
  suspectedReceiptInvoiceDuplicates,
  type CashFlowResult,
  type FinanceWarning,
  type MetricResult,
  type OpenItemsResult,
} from "./metrics";
import { SEGMENT_LABELS, SEGMENT_ORDER } from "./segments";
import type { FinanceSnapshot } from "./store";
import type { FinSegment, IsoDate, VatMode } from "./types";
import type { Halere } from "./money";

// Co čísla obsahují a co ne. Ukazuje se v cockpitu vždy, aby iDoklad nebyl
// mylně považován za úplný zdroj všech peněz Beginy.
export const FINANCE_COVERAGE = {
  included: [
    "Vydané faktury a dobropisy v iDokladu",
    "Prodejky v iDokladu",
    "Přijaté faktury a přijaté účtenky v iDokladu",
    "Úhrady dokladů zapsané v iDokladu",
  ],
  notIncluded: [
    "Bankovní pohyby, které nejsou zapsané jako úhrada v iDokladu",
    "Hotovost bez dokladu (např. akce)",
    "Pokladna Bistra Jandl ve Storyous",
    "Stripe / WooPayments — výplaty a poplatky",
    "Sklad a hodnota zásob (Odoo)",
    "Mzdy, odvody a daně, pokud nemají doklad v iDokladu",
    "Převody mezi vlastními účty, vklady a půjčky společníků",
  ],
  unverified: [
    "Zda Begina v iDokladu používá bankovní výpisy a pokladnu — ověří se read-only kontrolou po připojení",
  ],
} as const;

export type SegmentRow = { segment: FinSegment; label: string; revenue: Halere; costs: Halere };

export type FinanceCockpit = {
  asOf: IsoDate;
  vatMode: VatMode;
  amountsInclVat: boolean;
  invoicedRevenue: { today: Halere; thisMonth: Halere; lastMonth: Halere };
  paidRevenue: { today: Halere; thisMonth: Halere; lastMonth: Halere };
  costs: { thisMonth: Halere; lastMonth: Halere };
  cash: { thisMonth: CashFlowResult; lastMonth: CashFlowResult };
  // Provozní výsledek z evidovaných dokladů — NE zisk.
  recordedResult: { thisMonth: Halere; lastMonth: Halere };
  receivables: OpenItemsResult;
  payables: OpenItemsResult;
  segmentsThisMonth: SegmentRow[];
  segmentsLastMonth: SegmentRow[];
  unassigned: { revenueDocuments: number; costDocuments: number };
  warnings: FinanceWarning[];
  coverage: typeof FINANCE_COVERAGE;
};

function segmentRows(revenue: MetricResult, costs: MetricResult): SegmentRow[] {
  return SEGMENT_ORDER.map((segment) => ({
    segment,
    label: SEGMENT_LABELS[segment],
    revenue: revenue.bySegment[segment],
    costs: costs.bySegment[segment],
  })).filter((row) => row.segment === "nezarazeno" || row.revenue !== 0 || row.costs !== 0);
}

export function buildFinanceCockpit(snapshot: FinanceSnapshot, options: { now: Date; vatMode: VatMode }): FinanceCockpit {
  const ctx = buildFinanceContext(snapshot, { vatMode: options.vatMode, dateBasis: "issue" });
  const today = pragueToday(options.now);
  const todayPeriod = dayPeriod(today);
  const thisMonth = currentMonthPeriod(options.now);
  const lastMonth = previousMonthPeriod(options.now);

  const revenueThis = invoicedRevenue(ctx, thisMonth);
  const revenueLast = invoicedRevenue(ctx, lastMonth);
  const costsThis = recordedCosts(ctx, thisMonth);
  const costsLast = recordedCosts(ctx, lastMonth);

  // „Nezařazeno“ se počítá ze všech nesmazaných dokladů, ne jen z měsíce —
  // cílem je, aby počet postupně klesal k nule.
  const allTime = { from: "0000-01-01", to: "9999-12-31" };
  const unassignedRevenue = invoicedRevenue(ctx, allTime).lines.filter((line) => line.segment === "nezarazeno").length;
  const unassignedCosts = recordedCosts(ctx, allTime).lines.filter((line) => line.segment === "nezarazeno").length;

  return {
    asOf: today,
    vatMode: options.vatMode,
    amountsInclVat: options.vatMode === "non_payer",
    invoicedRevenue: {
      today: invoicedRevenue(ctx, todayPeriod).total,
      thisMonth: revenueThis.total,
      lastMonth: revenueLast.total,
    },
    paidRevenue: {
      today: paidRevenue(ctx, todayPeriod).total,
      thisMonth: paidRevenue(ctx, thisMonth).total,
      lastMonth: paidRevenue(ctx, lastMonth).total,
    },
    costs: { thisMonth: costsThis.total, lastMonth: costsLast.total },
    cash: { thisMonth: cashFlow(ctx, thisMonth), lastMonth: cashFlow(ctx, lastMonth) },
    recordedResult: {
      thisMonth: revenueThis.total - costsThis.total,
      lastMonth: revenueLast.total - costsLast.total,
    },
    receivables: receivables(ctx, today),
    payables: payables(ctx, today),
    segmentsThisMonth: segmentRows(revenueThis, costsThis),
    segmentsLastMonth: segmentRows(revenueLast, costsLast),
    unassigned: { revenueDocuments: unassignedRevenue, costDocuments: unassignedCosts },
    warnings: [...ctx.warnings, ...suspectedReceiptInvoiceDuplicates(ctx)],
    coverage: FINANCE_COVERAGE,
  };
}
