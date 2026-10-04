// Finance 1.0 — synchronizace iDoklad → úložiště (FinanceRepository).
// Jen čtení z iDokladu; zápis jen do vlastního úložiště, idempotentně.
//
// Postup jednoho běhu:
//   1. GET /Account/CurrentAgenda → kontrola agendy (IČO, viz config.ts)
//      a režimu DPH. Při nesouladu se NIC nestáhne ani neuloží.
//   2. Typy dokladů jeden po druhém, vždy řazeno Id~Asc, stránka po stránce
//      (každá stránka se hned uloží — přerušení nic neztratí).
//
// Přírůstková vs. úplná synchronizace (ověřeno proti SDK):
//   • Filtr podle data změny umějí: IssuedInvoices, CreditNotes,
//     ProformaInvoices, ReceivedReceipts („DateLastChange“) a
//     ReceivedInvoices („DateLastChanged“ — jiný název pole v SDK).
//     Řazení podle data změny SDK nenabízí, proto se jako hranice bere
//     ZAČÁTEK posledního DOKONČENÉHO průchodu, s překryvem 3 hodiny
//     (pokryje i nejasnou časovou zónu filtru). Překryv je neškodný —
//     ukládání je idempotentní.
//   • Prodejky (SalesReceipts) a úhrady filtr data změny nemají →
//     přírůstkově okno podle data vystavení/platby (60/90 dní).
//   • Úplný průchod (bez filtru) navíc označí jako smazané to, co v iDokladu
//     už není — ale JEN když doběhl celý od první stránky.
//   • Typ, který ještě nikdy nedoběhl úplným průchodem, se vždy stahuje
//     úplně (= počáteční import celé historie). Při vyčerpání limitu
//     požadavků se uloží další stránka a příští běh naváže.
import type { FinanceConfig } from "./config";
import { assertAgendaAllowed, assertVatModeMatches } from "./config";
import { andFilters, filterExpression, formatFilterDate, type IdokladClient } from "./idoklad/client";
import type { IdokladCollection } from "./idoklad/endpoints";
import { IdokladError } from "./idoklad/errors";
import type {
  ApiAgenda,
  ApiCreditNote,
  ApiIssuedDocumentPayment,
  ApiIssuedInvoice,
  ApiProformaInvoice,
  ApiReceivedDocumentPayment,
  ApiReceivedInvoice,
  ApiReceivedReceipt,
  ApiSalesReceipt,
  ApiTag,
} from "./idoklad/apiTypes";
import {
  normalizeAgenda,
  normalizeCreditNote,
  normalizeIssuedInvoice,
  normalizeIssuedPayment,
  normalizeProformaInvoice,
  normalizeReceivedInvoice,
  normalizeReceivedPayment,
  normalizeReceivedReceipt,
  normalizeSalesReceipt,
  normalizeSalesReceiptPayments,
  normalizeTags,
} from "./idoklad/normalize";
import {
  addCounts,
  emptyCounts,
  emptyCursor,
  type FinanceRepository,
  type SyncCursor,
  type UpsertCounts,
} from "./store";
import type { FinDocType, FinDocument, FinPayment, VatMode } from "./types";

export type SyncMode = "incremental" | "full";

type EntitySpec = {
  key: string;
  collection: IdokladCollection;
  label: string;
  // Název pole pro filtr podle data změny, nebo okno podle data dokladu.
  incremental: { kind: "changed"; field: string } | { kind: "window"; field: string; days: number };
  process: (items: unknown[]) => { documents: FinDocument[]; payments: FinPayment[]; skipped: string[] };
  reconcile: Array<
    | { kind: "documents"; docType: FinDocType }
    | { kind: "payments"; side: "issued" | "received"; scope: "sales_receipt" | "other" }
  >;
};

function documentsOnly<T>(normalize: (item: T) => FinDocument) {
  return (items: unknown[]) => ({ documents: (items as T[]).map(normalize), payments: [], skipped: [] });
}

export const SYNC_ENTITIES: EntitySpec[] = [
  {
    key: "issued_invoices",
    collection: "IssuedInvoices",
    label: "Vydané faktury",
    incremental: { kind: "changed", field: "DateLastChange" },
    process: documentsOnly<ApiIssuedInvoice>(normalizeIssuedInvoice),
    reconcile: [{ kind: "documents", docType: "issued_invoice" }],
  },
  {
    key: "credit_notes",
    collection: "CreditNotes",
    label: "Dobropisy",
    incremental: { kind: "changed", field: "DateLastChange" },
    process: documentsOnly<ApiCreditNote>(normalizeCreditNote),
    reconcile: [{ kind: "documents", docType: "credit_note" }],
  },
  {
    key: "proforma_invoices",
    collection: "ProformaInvoices",
    label: "Zálohové faktury",
    incremental: { kind: "changed", field: "DateLastChange" },
    process: documentsOnly<ApiProformaInvoice>(normalizeProformaInvoice),
    reconcile: [{ kind: "documents", docType: "proforma_invoice" }],
  },
  {
    key: "sales_receipts",
    collection: "SalesReceipts",
    label: "Prodejky",
    incremental: { kind: "window", field: "DateOfIssue", days: 60 },
    process: (items) => {
      const receipts = items as ApiSalesReceipt[];
      return {
        documents: receipts.map(normalizeSalesReceipt),
        payments: receipts.flatMap(normalizeSalesReceiptPayments),
        skipped: [],
      };
    },
    reconcile: [
      { kind: "documents", docType: "sales_receipt" },
      { kind: "payments", side: "issued", scope: "sales_receipt" },
    ],
  },
  {
    key: "received_invoices",
    collection: "ReceivedInvoices",
    label: "Přijaté faktury",
    incremental: { kind: "changed", field: "DateLastChanged" },
    process: documentsOnly<ApiReceivedInvoice>(normalizeReceivedInvoice),
    reconcile: [{ kind: "documents", docType: "received_invoice" }],
  },
  {
    key: "received_receipts",
    collection: "ReceivedReceipts",
    label: "Přijaté účtenky",
    incremental: { kind: "changed", field: "DateLastChange" },
    process: documentsOnly<ApiReceivedReceipt>(normalizeReceivedReceipt),
    reconcile: [{ kind: "documents", docType: "received_receipt" }],
  },
  {
    key: "issued_payments",
    collection: "IssuedDocumentPayments",
    label: "Úhrady vydaných dokladů",
    incremental: { kind: "window", field: "DateOfPayment", days: 90 },
    process: (items) => {
      const payments: FinPayment[] = [];
      const skipped: string[] = [];
      for (const item of items as ApiIssuedDocumentPayment[]) {
        const result = normalizeIssuedPayment(item);
        if (result.payment) payments.push(result.payment);
        else skipped.push(result.skipped);
      }
      return { documents: [], payments, skipped };
    },
    reconcile: [{ kind: "payments", side: "issued", scope: "other" }],
  },
  {
    key: "received_payments",
    collection: "ReceivedDocumentPayments",
    label: "Úhrady přijatých faktur",
    incremental: { kind: "window", field: "DateOfPayment", days: 90 },
    process: (items) => ({
      documents: [],
      payments: (items as ApiReceivedDocumentPayment[]).map(normalizeReceivedPayment),
      skipped: [],
    }),
    reconcile: [{ kind: "payments", side: "received", scope: "other" }],
  },
];

const CHANGED_OVERLAP_MS = 3 * 60 * 60 * 1000;

export type EntityReport = {
  key: string;
  label: string;
  pass: "full" | "incremental" | "resumed_full" | "skipped";
  pagesFetched: number;
  itemsFetched: number;
  documents: UpsertCounts;
  payments: UpsertCounts;
  markedDeleted: number;
  completed: boolean;
  skippedItems: string[];
};

export type SyncRunReport = {
  status: "success" | "partial" | "error";
  mode: SyncMode;
  startedAt: string;
  finishedAt: string;
  requestCount: number;
  agenda: { name: string | null; vatMode: VatMode } | null;
  entities: EntityReport[];
  error: { code: string; userMessage: string; detail: string | null } | null;
};

export type RunSyncOptions = {
  client: IdokladClient;
  repo: FinanceRepository;
  config: FinanceConfig;
  mode: SyncMode;
  now?: () => Date;
};

function daysAgo(date: Date, days: number): string {
  return new Date(date.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

async function syncEntity(
  spec: EntitySpec,
  options: RunSyncOptions,
  runStartedAt: Date
): Promise<EntityReport> {
  const { client, repo, mode } = options;
  const cursor: SyncCursor = (await repo.getCursor(spec.key)) ?? emptyCursor();
  const report: EntityReport = {
    key: spec.key,
    label: spec.label,
    pass: "full",
    pagesFetched: 0,
    itemsFetched: 0,
    documents: emptyCounts(),
    payments: emptyCounts(),
    markedDeleted: 0,
    completed: false,
    skippedItems: [],
  };

  // Úplný průchod, když: výslovně „full“, typ ještě nikdy nedoběhl celý,
  // chybí hranice pro přírůstek, nebo se navazuje na přerušený průchod.
  const resuming = mode !== "full" && cursor.resumePage !== null;
  const fullPass =
    mode === "full" ||
    resuming ||
    cursor.lastFullPassAt === null ||
    (spec.incremental.kind === "changed" && cursor.highWatermark === null);
  const startPage = resuming ? (cursor.resumePage as number) : 1;
  // Hranice pro příští přírůstek = začátek úplného průchodu (u navázaného
  // průchodu začátek PRVNÍHO běhu — změny mezi běhy se tak neztratí).
  const passStartedAt = resuming ? cursor.fullPassStartedAt : runStartedAt.toISOString();

  let filter: string | undefined;
  if (!fullPass) {
    report.pass = "incremental";
    if (spec.incremental.kind === "changed" && cursor.highWatermark) {
      const since = new Date(Date.parse(cursor.highWatermark) - CHANGED_OVERLAP_MS);
      filter = filterExpression(spec.incremental.field, "gte", formatFilterDate(since));
    } else if (spec.incremental.kind === "window") {
      filter = filterExpression(spec.incremental.field, "gte", `${daysAgo(runStartedAt, spec.incremental.days)} 00:00:00.000`);
    }
  } else if (resuming) {
    report.pass = "resumed_full";
  }

  const seenDocs = new Map<FinDocType, Set<string>>();
  const seenPayments = new Set<string>();
  try {
    for await (const result of client.listPages<unknown>(spec.collection, {
      filter: filter ? andFilters(filter) : undefined,
      sort: "Id~Asc",
      startPage,
    })) {
      const { documents, payments, skipped } = spec.process(result.items);
      report.documents = addCounts(report.documents, await repo.upsertDocuments(documents));
      report.payments = addCounts(report.payments, await repo.upsertPayments(payments));
      report.skippedItems.push(...skipped);
      for (const doc of documents) {
        const set = seenDocs.get(doc.docType) ?? new Set<string>();
        set.add(doc.externalId);
        seenDocs.set(doc.docType, set);
      }
      for (const payment of payments) seenPayments.add(payment.externalId);
      report.pagesFetched += 1;
      report.itemsFetched += result.items.length;
      if (fullPass) {
        // Průběžně ulož, odkud navázat, kdyby další stránka narazila na limit.
        await repo.saveCursor(spec.key, {
          ...cursor,
          resumePage: result.page + 1,
          fullPassStartedAt: passStartedAt,
        });
      }
    }
  } catch (error) {
    if (fullPass) {
      // Stránky jdou po sobě — navázat se dá přesně za poslední uloženou.
      await repo.saveCursor(spec.key, {
        ...cursor,
        resumePage: startPage + report.pagesFetched,
        fullPassStartedAt: passStartedAt,
      });
    }
    throw Object.assign(error as Error, { entityReport: report });
  }

  // Smazané se označují jen po průchodu, který doběhl CELÝ OD PRVNÍ STRÁNKY
  // v jednom běhu — jen tehdy je seznam viděných dokladů úplný.
  if (fullPass && startPage === 1) {
    const deletedAt = (options.now ?? (() => new Date()))().toISOString();
    for (const rule of spec.reconcile) {
      report.markedDeleted +=
        rule.kind === "documents"
          ? await repo.markMissingDocuments(rule.docType, seenDocs.get(rule.docType) ?? new Set(), deletedAt)
          : await repo.markMissingPayments(rule.side, rule.scope, seenPayments, deletedAt);
    }
  }
  report.completed = true;
  await repo.saveCursor(spec.key, {
    highWatermark: fullPass ? passStartedAt : runStartedAt.toISOString(),
    lastFullPassAt: fullPass ? passStartedAt : cursor.lastFullPassAt,
    lastSuccessAt: runStartedAt.toISOString(),
    resumePage: null,
    fullPassStartedAt: null,
  });
  return report;
}

// Pořadí typů v běhu: nejdřív ty, kterým chybí (nebo je rozpracovaný)
// úplný import, pak nejdéle nesynchronizované. Bez toho by při malém
// limitu požadavků každý běh začal stejnými, už hotovými typy a na
// rozpracovaný import historie by se nikdy nedostalo.
export async function syncOrder(repo: FinanceRepository): Promise<EntitySpec[]> {
  const withCursor = await Promise.all(
    SYNC_ENTITIES.map(async (spec, index) => ({ spec, index, cursor: (await repo.getCursor(spec.key)) ?? emptyCursor() }))
  );
  const pending = (cursor: SyncCursor) => cursor.lastFullPassAt === null || cursor.resumePage !== null;
  return withCursor
    .sort((a, b) => {
      if (pending(a.cursor) !== pending(b.cursor)) return pending(a.cursor) ? -1 : 1;
      const at = a.cursor.lastSuccessAt ?? "";
      const bt = b.cursor.lastSuccessAt ?? "";
      if (at !== bt) return at < bt ? -1 : 1;
      return a.index - b.index;
    })
    .map((entry) => entry.spec);
}

export async function runFinanceSync(options: RunSyncOptions): Promise<SyncRunReport> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const report: SyncRunReport = {
    status: "success",
    mode: options.mode,
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    requestCount: 0,
    agenda: null,
    entities: [],
    error: null,
  };

  const fail = (error: unknown, status: "partial" | "error") => {
    report.status = status;
    report.error =
      error instanceof IdokladError
        ? { code: error.code, userMessage: error.userMessage, detail: error.detail }
        : { code: "internal", userMessage: "Synchronizace skončila neočekávanou chybou.", detail: null };
  };

  try {
    const agenda = normalizeAgenda(await options.client.get<ApiAgenda>("/Account/CurrentAgenda"));
    assertAgendaAllowed(options.config, agenda);
    const vatMode = assertVatModeMatches(options.config, agenda);
    report.agenda = { name: agenda.name, vatMode };

    await options.repo.replaceTags(normalizeTags((await options.client.getPage<ApiTag>("Tags", 1, { pageSize: 200 })).items));

    for (const spec of await syncOrder(options.repo)) {
      try {
        report.entities.push(await syncEntity(spec, options, startedAt));
      } catch (error) {
        const partial = (error as { entityReport?: EntityReport }).entityReport;
        if (partial) report.entities.push(partial);
        const recoverable = error instanceof IdokladError && (error.code === "budget_exhausted" || error.code === "rate_limited");
        fail(error, recoverable ? "partial" : "error");
        // Zbylé typy se v tomto běhu přeskočí (a jsou v reportu vidět).
        const done = new Set(report.entities.map((entity) => entity.key));
        for (const rest of SYNC_ENTITIES.filter((entity) => !done.has(entity.key))) {
          report.entities.push({
            key: rest.key,
            label: rest.label,
            pass: "skipped",
            pagesFetched: 0,
            itemsFetched: 0,
            documents: emptyCounts(),
            payments: emptyCounts(),
            markedDeleted: 0,
            completed: false,
            skippedItems: [],
          });
        }
        break;
      }
    }
  } catch (error) {
    fail(error, "error");
  }

  report.requestCount = options.client.requestCount;
  report.finishedAt = now().toISOString();
  return report;
}

// Jednorázová read-only kontrola, které agendy Begina v iDokladu používá
// (banka, pokladna, prodejky). 1 požadavek na kolekci (pageSize=1 →
// TotalItems). Výsledek jen zobrazí — do výpočtů V1 nevstupuje.
export async function inspectAgendaUsage(client: IdokladClient): Promise<Record<string, number>> {
  const collections: IdokladCollection[] = ["BankAccounts", "BankStatements", "CashRegisters", "CashVouchers", "SalesReceipts"];
  const usage: Record<string, number> = {};
  for (const collection of collections) {
    usage[collection] = (await client.getPage<unknown>(collection, 1, { pageSize: 1 })).totalItems;
  }
  return usage;
}
