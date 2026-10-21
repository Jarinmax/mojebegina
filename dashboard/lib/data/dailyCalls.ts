// Security Phase 19 (Denní volání 1.0) — datová vrstva. Stejný princip
// jako leads.ts/ceoFocus.ts: kontrola a dotaz jsou neoddělitelné, každá
// exportovaná funkce si sama volá požadovanou dailyCallsAuth kontrolu.
//
// Zápis výsledku hovoru (logDailyCallOutcome) NEreuse-uje leads.ts:
// logCallOutcome — schváleno explicitně (revize návrhu, bod 4): potřebná
// atomičnost "jen přechod pending→done smí zapsat lead + lead_activity"
// nejde bezpečně vyjádřit jako dva nezávislé db.batch() volání ani jako
// tři statementy v jednom db.batch() (ty by se sice provedly v jedné
// transakci, ale bez PODMÍNKY na sobě navzájem — souběžný/dvojitý submit
// by mohl obě volání nechat "projít" a vytvořit dva lead_activity záznamy
// dřív, než druhé z nich uvidí položku jako 'done'). Řešení je jeden
// atomický SQL příkaz s řetězenými CTE, kde UPDATE položky na 'done' s
// podmínkou `WHERE status='pending'` je JEDINÝ gate — navazující UPDATE
// leadu i INSERT do lead_activity běží jen `WHERE EXISTS (SELECT 1 FROM
// claimed)`. Postgres provede všechny data-měnící CTE v jedné transakci
// přesně jednou (dokumentované chování, ne optimalizace, která by je mohla
// přeskočit) — viz komentář přímo u logDailyCallOutcome.
import "server-only";
import { randomUUID } from "crypto";
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { dailyCallQueue, leads, leadActivity } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import {
  requireDailyCallCuratorAccess,
  requireDailyCallWorkerAccess,
  requireDailyCallAccess,
  DAILY_CALL_LEAD_OWNER_USER_ID,
} from "./dailyCallsAuth";
import {
  ACTIVE_LEAD_STAGES,
  leadDisplayName,
  validateCallOutcomeInput,
  type LeadStage,
  type CallOutcomeInput,
} from "./leadValidation";
import {
  autoCandidatesToAdd,
  buildLogDailyCallOutcomeQuery,
  canAddManualCandidate,
  interpretCallLogOutcome,
  pragueDateString,
  swapAdjacent,
  MAX_QUEUE_SIZE,
} from "./dailyCallsValidation";
import type { AuthContext } from "./types";

export async function requireDailyCallCuratorContext(): Promise<NonNullable<AuthContext>> {
  const ctx = await getAuthContext();
  return requireDailyCallCuratorAccess(ctx);
}

export async function requireDailyCallWorkerContext(): Promise<NonNullable<AuthContext>> {
  const ctx = await getAuthContext();
  return requireDailyCallWorkerAccess(ctx);
}

export async function requireDailyCallAccessContext(): Promise<NonNullable<AuthContext>> {
  const ctx = await getAuthContext();
  return requireDailyCallAccess(ctx);
}

// --- Zobrazovací karty -------------------------------------------------

export type QueueItemCardData = {
  id: string;
  position: number;
  source: "auto" | "manual";
  isDraft: boolean;
  addedForDate: string;
  leadId: string;
  displayName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  stage: LeadStage;
  lastNote: string | null;
};

type QueueRow = typeof dailyCallQueue.$inferSelect;

async function buildQueueCards(rows: QueueRow[]): Promise<QueueItemCardData[]> {
  if (rows.length === 0) {
    return [];
  }
  const leadIds = [...new Set(rows.map((r) => r.leadId))];
  const leadRows = await db
    .select({
      id: leads.id,
      companyName: leads.companyName,
      contactName: leads.contactName,
      contactPhone: leads.contactPhone,
      contactEmail: leads.contactEmail,
      stage: leads.stage,
    })
    .from(leads)
    .where(inArray(leads.id, leadIds));
  const leadById = new Map(leadRows.map((l) => [l.id, l]));

  // Poslední poznámka na lead — max 10 položek ve frontě, N+1 je tu
  // v pořádku (stejné měřítko jako jinde v appce, žádný seznam nikdy
  // nepřekročí MAX_QUEUE_SIZE).
  const lastNotes = await Promise.all(
    leadIds.map(async (leadId) => {
      const result = await db.execute<{ body: string | null }>(sql`
        SELECT body FROM lead_activity
        WHERE lead_id = ${leadId} AND body IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
      `);
      return [leadId, result.rows[0]?.body ?? null] as const;
    })
  );
  const lastNoteByLead = new Map(lastNotes);

  return rows.map((r) => {
    const lead = leadById.get(r.leadId);
    return {
      id: r.id,
      position: r.position,
      source: r.source as "auto" | "manual",
      isDraft: r.publishedAt === null,
      addedForDate: r.addedForDate,
      leadId: r.leadId,
      displayName: lead ? leadDisplayName(lead) : "Neznámý lead",
      contactPhone: lead?.contactPhone ?? null,
      contactEmail: lead?.contactEmail ?? null,
      stage: (lead?.stage as LeadStage) ?? "new",
      lastNote: lastNoteByLead.get(r.leadId) ?? null,
    };
  });
}

// --- Kurátorský pohled ---------------------------------------------------

export type CuratorQueueView = {
  draft: QueueItemCardData[];
  published: QueueItemCardData[];
};

export async function getCuratorQueueView(): Promise<CuratorQueueView> {
  await requireDailyCallCuratorContext();

  const rows = await db
    .select()
    .from(dailyCallQueue)
    .where(eq(dailyCallQueue.status, "pending"))
    .orderBy(asc(dailyCallQueue.position));

  const cards = await buildQueueCards(rows);
  return {
    draft: cards.filter((c) => c.isDraft),
    published: cards.filter((c) => !c.isDraft),
  };
}

// --- Pracovní pohled (Blahout) -------------------------------------------

export type WorkerQueueView = {
  carriedOver: QueueItemCardData[];
  today: QueueItemCardData[];
  doneToday: number;
  totalToday: number;
};

async function countDoneToday(): Promise<number> {
  const result = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM daily_call_queue
    WHERE status = 'done'
      AND (done_at AT TIME ZONE 'Europe/Prague')::date = (now() AT TIME ZONE 'Europe/Prague')::date
  `);
  return (result.rows[0]?.count as number | undefined) ?? 0;
}

// Progress = dokončeno dnes / (dokončeno dnes + aktuálně publikované
// pending) — schváleno explicitně (revize návrhu, bod 1). Drafty ani
// odstraněné položky se nepočítají. Hranice dne je Europe/Prague.
export async function getWorkerQueueView(): Promise<WorkerQueueView> {
  await requireDailyCallWorkerContext();

  const todayStr = pragueDateString();

  const publishedPendingRows = await db
    .select()
    .from(dailyCallQueue)
    .where(and(eq(dailyCallQueue.status, "pending"), sql`${dailyCallQueue.publishedAt} IS NOT NULL`))
    .orderBy(asc(dailyCallQueue.position));

  const cards = await buildQueueCards(publishedPendingRows);
  const doneToday = await countDoneToday();

  return {
    carriedOver: cards.filter((c) => c.addedForDate < todayStr),
    today: cards.filter((c) => c.addedForDate >= todayStr),
    doneToday,
    totalToday: doneToday + cards.length,
  };
}

// --- Historie volání -------------------------------------------------------
//
// Jarda – volání a provize, část 1, bod 2 — "Již volané"/"Historie volání".
// Čte VÝHRADNĚ lead_activity (kind='call_logged'), ne daily_call_queue —
// stejná tabulka bez ohledu na to, jestli byl hovor zapsaný z "Dnešní
// volání" (logDailyCallOutcome) nebo z "Všechny leady"/detailu leadu
// (leads.ts:logCallOutcome), takže oprava bodu 3 (jedna společná historie)
// se sem promítne automaticky — žádné rozlišování cesty zápisu.
//
// Viditelnost: stejná jako samotná stránka "Dnešní volání" (curator NEBO
// worker) — requireDailyCallAccess, ne širší requireCrmContext, protože
// zadání umisťuje historii do "Jardovy části volání", ne do obecného CRM.
//
// Jarda – volání a provize, část 1, doplněk — rychlé přepínače Dnes/Včera/
// Posledních 7 dní + stránkování (dřív jen "posledních 50 záznamů bez
// filtru", co by starší hovory jen TICHY schovalo, pokud by v mezidobí
// přibylo přes 50 novějších). Hranice dne se počítá na STRANĚ Postgresu
// (`AT TIME ZONE 'Europe/Prague')::date`), stejný ověřený vzor jako
// countDoneToday výš — appka nikdy nepočítá hranici půlnoci v JS, takže je
// to DST-safe a nezávislé na časové zóně serverless funkce.
export type CallHistoryFilter = "today" | "yesterday" | "last7days";

const CALL_HISTORY_PAGE_SIZE = 50;

// "Posledních 7 dní" = dnešek + 6 předchozích kalendářních dní v Europe/
// Prague (7 dní celkem, dnešek včetně) — běžný výklad takového přepínače.
function callHistoryDateFilterSql(filter: CallHistoryFilter) {
  if (filter === "today") {
    return sql`(${leadActivity.createdAt} AT TIME ZONE 'Europe/Prague')::date = (now() AT TIME ZONE 'Europe/Prague')::date`;
  }
  if (filter === "yesterday") {
    return sql`(${leadActivity.createdAt} AT TIME ZONE 'Europe/Prague')::date = (now() AT TIME ZONE 'Europe/Prague')::date - 1`;
  }
  return sql`(${leadActivity.createdAt} AT TIME ZONE 'Europe/Prague')::date >= (now() AT TIME ZONE 'Europe/Prague')::date - 6`;
}

export type CallHistoryEntry = {
  id: string;
  leadId: string;
  displayName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  authorName: string | null;
  createdAt: Date;
  callResult: string | null;
  note: string | null;
  nextFollowUpAt: Date | null;
  nextStepNote: string | null;
};

function readMetadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readMetadataDate(metadata: unknown, key: string): Date | null {
  const raw = readMetadataString(metadata, key);
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type CallHistoryPage = {
  entries: CallHistoryEntry[];
  hasMore: boolean;
};

// `page` je 1-indexované (stejná konvence jako URL searchParams v
// historie/page.tsx). Načte se CALL_HISTORY_PAGE_SIZE + 1 řádků — pokud
// přijde ten navíc, existuje další stránka (hasMore), appka ho jen
// nevrátí; levnější než samostatný COUNT dotaz a netrpí race mezi count a
// select.
export async function getCallHistory(
  filter: CallHistoryFilter = "today",
  opts: { page?: number } = {}
): Promise<CallHistoryPage> {
  await requireDailyCallAccessContext();

  const page = Math.max(1, opts.page ?? 1);
  const offset = (page - 1) * CALL_HISTORY_PAGE_SIZE;

  const activityRows = await db
    .select({
      id: leadActivity.id,
      leadId: leadActivity.leadId,
      authorName: leadActivity.authorName,
      body: leadActivity.body,
      metadata: leadActivity.metadata,
      createdAt: leadActivity.createdAt,
    })
    .from(leadActivity)
    .where(and(eq(leadActivity.kind, "call_logged"), callHistoryDateFilterSql(filter)))
    .orderBy(desc(leadActivity.createdAt))
    .limit(CALL_HISTORY_PAGE_SIZE + 1)
    .offset(offset);

  const hasMore = activityRows.length > CALL_HISTORY_PAGE_SIZE;
  const pageRows = hasMore ? activityRows.slice(0, CALL_HISTORY_PAGE_SIZE) : activityRows;

  if (pageRows.length === 0) {
    return { entries: [], hasMore: false };
  }

  const leadIds = [...new Set(pageRows.map((r) => r.leadId))];
  const leadRows = await db
    .select({
      id: leads.id,
      companyName: leads.companyName,
      contactName: leads.contactName,
      contactPhone: leads.contactPhone,
      contactEmail: leads.contactEmail,
    })
    .from(leads)
    .where(inArray(leads.id, leadIds));
  const leadById = new Map(leadRows.map((l) => [l.id, l]));

  const entries = pageRows.map((row) => {
    const lead = leadById.get(row.leadId);
    return {
      id: row.id,
      leadId: row.leadId,
      // Appka leady nikdy nemaže, takže `lead` tu chybět nemělo — stejný
      // bezpečný fallback jako buildQueueCards výše, jen pro jistotu.
      displayName: lead ? leadDisplayName(lead) : "Neznámý lead",
      contactPhone: lead?.contactPhone ?? null,
      contactEmail: lead?.contactEmail ?? null,
      authorName: row.authorName,
      createdAt: row.createdAt,
      callResult: readMetadataString(row.metadata, "callResult"),
      note: row.body,
      nextFollowUpAt: readMetadataDate(row.metadata, "nextFollowUpAt"),
      nextStepNote: readMetadataString(row.metadata, "nextStepNote"),
    };
  });

  return { entries, hasMore };
}

// --- Sestavení a úprava fronty (kurátor) ----------------------------------

async function currentPendingCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(dailyCallQueue)
    .where(eq(dailyCallQueue.status, "pending"));
  return row?.count ?? 0;
}

async function nextPosition(): Promise<number> {
  const [row] = await db
    .select({ maxPosition: sql<number>`coalesce(max(${dailyCallQueue.position}), -1)` })
    .from(dailyCallQueue)
    .where(eq(dailyCallQueue.status, "pending"));
  return (row?.maxPosition ?? -1) + 1;
}

// Automatický návrh — vybírá leady přiřazené Blahoutovi, v aktivní
// pipeline (ACTIVE_LEAD_STAGES), s telefonem, ještě ne ve frontě.
// Dřívější kontakt leada NEVYLUČUJE (schváleno explicitně, Security Phase
// 19.2 — pořád potenciální zákazník, smí se oslovit znovu), ale třídí ho
// do vrstvy podle naplánovaného termínu/historie kontaktu a chrání ho
// 30denní lhůtou před okamžitým opětovným zařazením — viz
// classifyAutoCandidate/orderAutoCandidates v dailyCallsValidation.ts pro
// přesné, nezávisle testované pravidlo. Doplní jen do MAX_QUEUE_SIZE
// dohromady se vším, co je už `pending` (staré nedokončené i drafty).
// Nové položky vznikají VŽDY jako draft (published_at NULL) — schváleno
// explicitně, bod 2.
export async function generateDraftCandidates(): Promise<{ ok: true; added: number }> {
  const ctx = await requireDailyCallCuratorContext();

  const pendingCount = await currentPendingCount();
  if (pendingCount >= MAX_QUEUE_SIZE) {
    return { ok: true, added: 0 };
  }

  const candidateRows = await db
    .select({
      id: leads.id,
      lastContactedAt: leads.lastContactedAt,
      nextFollowUpAt: leads.nextFollowUpAt,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(
      and(
        eq(leads.ownerUserId, DAILY_CALL_LEAD_OWNER_USER_ID),
        inArray(leads.stage, ACTIVE_LEAD_STAGES),
        sql`${leads.contactPhone} IS NOT NULL AND btrim(${leads.contactPhone}) <> ''`,
        notInArray(
          leads.id,
          db.select({ id: dailyCallQueue.leadId }).from(dailyCallQueue).where(eq(dailyCallQueue.status, "pending"))
        )
      )
    );

  const toAdd = autoCandidatesToAdd(pendingCount, candidateRows, new Date());
  if (toAdd.length === 0) {
    return { ok: true, added: 0 };
  }

  const startPosition = await nextPosition();
  const todayStr = pragueDateString();

  const inserts = toAdd.map((lead, i) =>
    db.insert(dailyCallQueue).values({
      leadId: lead.id,
      position: startPosition + i,
      status: "pending",
      source: "auto",
      addedBy: ctx.userId,
      addedForDate: todayStr,
    })
  );
  const [first, ...rest] = inserts;
  await db.batch([first, ...rest]);

  return { ok: true, added: toAdd.length };
}

export type DailyCallResult = { ok: true } | { ok: false; error: string };

export type LeadOption = { id: string; displayName: string };

// Nabídka pro ruční přidání — JAKÝKOLI aktivní lead s telefonem, ještě ne
// ve frontě (schváleno explicitně: kurátor může přidat i leada mimo
// Blahoutovo vlastnictví, na rozdíl od automatického návrhu).
export async function listManualCandidateOptions(): Promise<LeadOption[]> {
  await requireDailyCallCuratorContext();

  const rows = await db
    .select({
      id: leads.id,
      companyName: leads.companyName,
      contactName: leads.contactName,
      contactPhone: leads.contactPhone,
      contactEmail: leads.contactEmail,
    })
    .from(leads)
    .where(
      and(
        inArray(leads.stage, ACTIVE_LEAD_STAGES),
        sql`${leads.contactPhone} IS NOT NULL AND btrim(${leads.contactPhone}) <> ''`,
        notInArray(
          leads.id,
          db.select({ id: dailyCallQueue.leadId }).from(dailyCallQueue).where(eq(dailyCallQueue.status, "pending"))
        )
      )
    );

  return rows
    .map((r) => ({ id: r.id, displayName: leadDisplayName(r) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// Ruční přidání kurátorem — jako draft (published_at NULL), stejně jako
// automatický návrh (schváleno explicitně, bod 2: oprava zveřejněné fronty
// je "odebrat → přidat náhradu do draftu → zveřejnit", ne okamžité
// zviditelnění).
export async function addManualCandidate(leadId: string): Promise<DailyCallResult> {
  const ctx = await requireDailyCallCuratorContext();

  // Bug nahlášený na Preview: automatický návrh limit MAX_QUEUE_SIZE
  // respektoval (candidatesToAdd), ruční přidání ne — fronta mohla
  // přerůst 10/10. Kontrola v datové vrstvě, ne jen vypnuté tlačítko v UI.
  const pendingCount = await currentPendingCount();
  const capCheck = canAddManualCandidate(pendingCount);
  if (!capCheck.ok) {
    return capCheck;
  }

  const [lead] = await db
    .select({ id: leads.id, stage: leads.stage, contactPhone: leads.contactPhone })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!lead) {
    return { ok: false, error: "Lead nebyl nalezen." };
  }
  if (!ACTIVE_LEAD_STAGES.includes(lead.stage as LeadStage)) {
    return { ok: false, error: "Lead není v aktivní pipeline." };
  }
  if (!lead.contactPhone || lead.contactPhone.trim() === "") {
    return { ok: false, error: "Lead nemá použitelné telefonní číslo." };
  }

  const [existing] = await db
    .select({ id: dailyCallQueue.id })
    .from(dailyCallQueue)
    .where(and(eq(dailyCallQueue.leadId, leadId), eq(dailyCallQueue.status, "pending")))
    .limit(1);
  if (existing) {
    return { ok: false, error: "Lead je už ve frontě." };
  }

  const position = await nextPosition();
  await db.insert(dailyCallQueue).values({
    leadId,
    position,
    status: "pending",
    source: "manual",
    addedBy: ctx.userId,
    addedForDate: pragueDateString(),
  });

  return { ok: true };
}

// Odebrání nevyřízené položky — kdykoliv, draft i zveřejněná (schváleno
// explicitně, bod 5). Podmínka `status='pending'` v UPDATE je zároveň
// ochrana: dokončenou/už odebranou položku nelze "odebrat" podruhé.
export async function removeQueueItem(itemId: string): Promise<DailyCallResult> {
  const ctx = await requireDailyCallCuratorContext();

  const updated = await db
    .update(dailyCallQueue)
    .set({ status: "removed", removedAt: new Date(), removedBy: ctx.userId, updatedAt: new Date() })
    .where(and(eq(dailyCallQueue.id, itemId), eq(dailyCallQueue.status, "pending")))
    .returning({ id: dailyCallQueue.id });

  if (updated.length === 0) {
    return { ok: false, error: "Položku nelze odebrat (možná už byla vyřízena nebo odebrána)." };
  }
  return { ok: true };
}

// Zveřejní všechny aktuální drafty najednou — jediné místo, kde se
// `published_at`/`published_by` nastavuje pro nové (auto i manual)
// položky.
export async function publishDraft(): Promise<{ ok: true; published: number }> {
  const ctx = await requireDailyCallCuratorContext();

  const updated = await db
    .update(dailyCallQueue)
    .set({ publishedAt: new Date(), publishedBy: ctx.userId, updatedAt: new Date() })
    .where(and(eq(dailyCallQueue.status, "pending"), sql`${dailyCallQueue.publishedAt} IS NULL`))
    .returning({ id: dailyCallQueue.id });

  return { ok: true, published: updated.length };
}

// --- Přeřazení pořadí (jen mezi nevyřízenými položkami) -------------------

async function currentPendingIds(): Promise<string[]> {
  const rows = await db
    .select({ id: dailyCallQueue.id })
    .from(dailyCallQueue)
    .where(eq(dailyCallQueue.status, "pending"))
    .orderBy(asc(dailyCallQueue.position));
  return rows.map((r) => r.id);
}

const REORDER_OFFSET = 100000;

// Dvoufázové přečíslování (schváleno explicitně, bod 5) — nutné, protože
// unikátní index na `position` je partial (WHERE status='pending') a
// Postgres partial unique index nejde deklarovat jako DEFERRABLE, takže se
// kontroluje ihned po KAŽDÉM jednotlivém UPDATE v rámci transakce, ne až
// na COMMIT. Fáze 1 posune VŠECHNY nevyřízené položky jedním UPDATE do
// bezpečného vysokého rozsahu (nemůže kolidovat samo se sebou — všechny
// hodnoty se posunou o stejné číslo, pořadí mezi nimi se nezmění).
// Fáze 2 pak zapisuje finální pozice jednu po druhé do už prázdné cílové
// oblasti (0..N-1) — nikdy nekoliduje, protože zdrojové řádky čekají
// v posunutém rozsahu, dokud na ně nepřijde řada.
async function applyQueueReorder(orderedIds: string[]): Promise<void> {
  const shiftAll = db
    .update(dailyCallQueue)
    .set({ position: sql`${dailyCallQueue.position} + ${REORDER_OFFSET}` })
    .where(eq(dailyCallQueue.status, "pending"));

  const finalUpdates = orderedIds.map((id, index) =>
    db
      .update(dailyCallQueue)
      .set({ position: index, updatedAt: new Date() })
      .where(eq(dailyCallQueue.id, id))
  );

  await db.batch([shiftAll, ...finalUpdates]);
}

async function moveQueueItem(itemId: string, direction: "up" | "down"): Promise<DailyCallResult> {
  await requireDailyCallCuratorContext();

  const ids = await currentPendingIds();
  const index = ids.indexOf(itemId);
  const reordered = swapAdjacent(ids, index, direction);
  if (!reordered) {
    return {
      ok: false,
      error: direction === "up" ? "Položku nelze posunout výš." : "Položku nelze posunout níž.",
    };
  }

  await applyQueueReorder(reordered);
  return { ok: true };
}

export async function moveQueueItemUp(itemId: string): Promise<DailyCallResult> {
  return moveQueueItem(itemId, "up");
}

export async function moveQueueItemDown(itemId: string): Promise<DailyCallResult> {
  return moveQueueItem(itemId, "down");
}

// --- Zápis výsledku hovoru (pracovník) ------------------------------------

// Atomický zápis: jediný SQL příkaz s řetězenými CTE. `claimed` je jediný
// gate (UPDATE ... WHERE status='pending') — `lead_upd` i finální INSERT
// běží jen `WHERE EXISTS (SELECT 1 FROM claimed)`. Postgres provede
// VŠECHNY data-měnící CTE v jedné transakci přesně jednou, bez ohledu na
// to, jestli je hlavní příkaz čte (dokumentované chování, ne volitelná
// optimalizace) — proto `lead_upd` doopravdy proběhne (nebo neproběhne)
// přesně podle toho, jestli `claimed` zasáhla řádek. Nemůže tedy vzniknout
// stav, kdy se zapíše `lead_activity`, ale položka fronty zůstane
// `pending`, ani naopak — a dvojitý/souběžný submit na stejné položce
// zaručeně "vyhraje" jen jednou (druhý pokus dostane 0 řádků zpátky).
//
// Jarda – volání a provize, část 1 (bod 3, "žádná stará cache") — vlastní
// návratový typ (ne DailyCallResult) vrací i leadId, aby volající server
// akce (logDailyCallOutcomeAction) mohla revalidovat i detail KONKRÉTNÍHO
// leadu a "Všechny leady", ne jen "/rizeni-firmy/obchod/dnes" — zápis
// odtud teď (viz logCallOutcome v leads.ts) ovlivňuje pořád stejná data.
export type LogDailyCallOutcomeResult = { ok: true; leadId: string } | { ok: false; error: string };

export async function logDailyCallOutcome(itemId: string, rawInput: CallOutcomeInput): Promise<LogDailyCallOutcomeResult> {
  const ctx = await requireDailyCallWorkerContext();

  const validated = validateCallOutcomeInput(rawInput);
  if (!validated.ok) {
    return validated;
  }
  const value = validated.value;

  const [item] = await db
    .select({ leadId: dailyCallQueue.leadId, status: dailyCallQueue.status })
    .from(dailyCallQueue)
    .where(eq(dailyCallQueue.id, itemId))
    .limit(1);
  if (!item) {
    return { ok: false, error: "Položka nebyla nalezena." };
  }
  // Předběžná kontrola jen kvůli lepší chybové hlášce v běžném případě —
  // skutečnou bezpečnost proti souběžnému/dvojitému zápisu zaručuje až
  // atomický CTE níže, ne tenhle SELECT.
  if (item.status !== "pending") {
    return { ok: false, error: "Tento kontakt už je vyřízený nebo odebraný." };
  }

  const result = await db.execute<{ id: string }>(
    buildLogDailyCallOutcomeQuery({
      itemId,
      leadId: item.leadId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      activityId: randomUUID(),
      note: value.note,
      stageChange: value.nextStage,
      nextFollowUpAt: value.nextFollowUpAt,
      nextStepNote: value.nextStepNote,
      result: value.result,
    })
  );

  const outcome = interpretCallLogOutcome(result.rows.length);
  if (!outcome.ok) {
    return outcome;
  }
  return { ok: true, leadId: item.leadId };
}
