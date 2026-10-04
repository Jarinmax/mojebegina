// Finance 1.0 — sémantika ukládání (upsert) synchronizovaných dat.
//
// Tohle je ZÁVAZNÁ specifikace pro budoucí SQL vrstvu (fin_documents,
// fin_payments). In-memory implementace níže slouží testům a fixture
// režimu; po migraci vznikne SQL implementace stejného rozhraní
// FinanceRepository a projde stejnými testy (viz FINANCE_1_0.md, oddíl
// „Pravidla proti duplicitám“):
//
//   1. Klíč dokladu: (source, doc_type, external_id); úhrady: (source,
//      side, external_id). Opakovaný import = update, nikdy nový řádek.
//   2. Starší verze nepřepíše novější: přichozí external_changed_at <
//      uložené → ignorovat (přeházené stránky, souběh).
//   3. Stejný content_hash a nesmazaný → beze změny (nic se nepřepisuje).
//   4. Mazání je jen příznak is_deleted (+ deleted_at). Doklad, který se
//      znovu objeví (obnovení z koše v iDokladu), se obnoví.
//   5. Jako smazané se označí jen doklady, které chybějí v ÚPLNÉM průchodu
//      daného typu (markMissing…). Přerušený průchod nic nemaže.
import type { FinDocType, FinDocument, FinDocumentLink, FinPayment, FinPaymentSide } from "./types";
import type { FinTag } from "./idoklad/normalize";

export type UpsertOutcome = "inserted" | "updated" | "unchanged" | "stale" | "restored";

export type UpsertCounts = Record<UpsertOutcome, number>;

// Stav synchronizace jednoho typu dokladů (budoucí fin_sync_state).
export type SyncCursor = {
  // Začátek posledního DOKONČENÉHO průchodu. Příští přírůstková
  // synchronizace stahuje doklady změněné od tohoto okamžiku (s překryvem).
  highWatermark: string | null;
  lastFullPassAt: string | null;
  lastSuccessAt: string | null;
  // Rozpracovaný úplný průchod (počáteční import přes víc běhů): odkud
  // navázat a kdy průchod začal (= hranice pro další přírůstek).
  resumePage: number | null;
  fullPassStartedAt: string | null;
};

export function emptyCursor(): SyncCursor {
  return { highWatermark: null, lastFullPassAt: null, lastSuccessAt: null, resumePage: null, fullPassStartedAt: null };
}

export interface FinanceRepository {
  upsertDocuments(docs: FinDocument[]): Promise<UpsertCounts>;
  upsertPayments(payments: FinPayment[]): Promise<UpsertCounts>;
  markMissingDocuments(docType: FinDocType, seenExternalIds: ReadonlySet<string>, at: string): Promise<number>;
  markMissingPayments(
    side: FinPaymentSide,
    scope: "sales_receipt" | "other",
    seenExternalIds: ReadonlySet<string>,
    at: string
  ): Promise<number>;
  replaceTags(tags: FinTag[]): Promise<void>;
  getCursor(entity: string): Promise<SyncCursor | null>;
  saveCursor(entity: string, cursor: SyncCursor): Promise<void>;
}

export function emptyCounts(): UpsertCounts {
  return { inserted: 0, updated: 0, unchanged: 0, stale: 0, restored: 0 };
}

export function addCounts(a: UpsertCounts, b: UpsertCounts): UpsertCounts {
  return {
    inserted: a.inserted + b.inserted,
    updated: a.updated + b.updated,
    unchanged: a.unchanged + b.unchanged,
    stale: a.stale + b.stale,
    restored: a.restored + b.restored,
  };
}

export function documentKey(doc: Pick<FinDocument, "source" | "docType" | "externalId">): string {
  return `${doc.source}|${doc.docType}|${doc.externalId}`;
}

export function paymentKey(payment: Pick<FinPayment, "source" | "side" | "externalId">): string {
  return `${payment.source}|${payment.side}|${payment.externalId}`;
}

function changedAtMillis(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

// Čisté rozhodnutí o jednom záznamu — sdílené dokladem i úhradou.
export function decideUpsert<T extends { contentHash: string; isDeleted: boolean; externalChangedAt: string | null }>(
  existing: T | undefined,
  incoming: T
): { outcome: UpsertOutcome; next: T | undefined } {
  if (!existing) {
    return { outcome: "inserted", next: { ...incoming, isDeleted: false } };
  }
  const existingAt = changedAtMillis(existing.externalChangedAt);
  const incomingAt = changedAtMillis(incoming.externalChangedAt);
  if (existingAt !== null && incomingAt !== null && incomingAt < existingAt) {
    return { outcome: "stale", next: undefined };
  }
  if (existing.isDeleted) {
    return { outcome: "restored", next: { ...incoming, isDeleted: false } };
  }
  if (existing.contentHash === incoming.contentHash) {
    return { outcome: "unchanged", next: undefined };
  }
  return { outcome: "updated", next: { ...incoming, isDeleted: false } };
}

export class InMemoryFinanceRepository implements FinanceRepository {
  readonly documents = new Map<string, FinDocument>();
  readonly payments = new Map<string, FinPayment>();
  readonly links: FinDocumentLink[] = [];
  tags: FinTag[] = [];
  private readonly cursors = new Map<string, SyncCursor>();

  async upsertDocuments(docs: FinDocument[]): Promise<UpsertCounts> {
    const counts = emptyCounts();
    for (const doc of docs) {
      const key = documentKey(doc);
      const { outcome, next } = decideUpsert(this.documents.get(key), doc);
      counts[outcome] += 1;
      if (next) this.documents.set(key, { ...next, deletedAt: null });
    }
    return counts;
  }

  async upsertPayments(payments: FinPayment[]): Promise<UpsertCounts> {
    const counts = emptyCounts();
    for (const payment of payments) {
      const key = paymentKey(payment);
      const { outcome, next } = decideUpsert(this.payments.get(key), payment);
      counts[outcome] += 1;
      if (next) this.payments.set(key, next);
    }
    return counts;
  }

  async markMissingDocuments(docType: FinDocType, seen: ReadonlySet<string>, at: string): Promise<number> {
    let marked = 0;
    for (const [key, doc] of this.documents) {
      if (doc.docType === docType && !doc.isDeleted && !seen.has(doc.externalId)) {
        this.documents.set(key, { ...doc, isDeleted: true, deletedAt: at });
        marked += 1;
      }
    }
    return marked;
  }

  async markMissingPayments(
    side: FinPaymentSide,
    scope: "sales_receipt" | "other",
    seen: ReadonlySet<string>
  ): Promise<number> {
    let marked = 0;
    for (const [key, payment] of this.payments) {
      const inScope = scope === "sales_receipt" ? payment.documentType === "sales_receipt" : payment.documentType !== "sales_receipt";
      if (payment.side === side && inScope && !payment.isDeleted && !seen.has(payment.externalId)) {
        this.payments.set(key, { ...payment, isDeleted: true });
        marked += 1;
      }
    }
    return marked;
  }

  async replaceTags(tags: FinTag[]): Promise<void> {
    this.tags = [...tags];
  }

  async getCursor(entity: string): Promise<SyncCursor | null> {
    return this.cursors.get(entity) ?? null;
  }

  async saveCursor(entity: string, cursor: SyncCursor): Promise<void> {
    this.cursors.set(entity, cursor);
  }

  snapshot(): FinanceSnapshot {
    return {
      documents: [...this.documents.values()],
      payments: [...this.payments.values()],
      links: [...this.links],
      tags: [...this.tags],
    };
  }
}

export type FinanceSnapshot = {
  documents: FinDocument[];
  payments: FinPayment[];
  links: FinDocumentLink[];
  tags: FinTag[];
};
