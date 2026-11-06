// GPT/MCP pilot — manažerský přehled Beginy (get_executive_overview). Jen
// souhrnná čísla, žádné osobní údaje kromě jmen obchodníků a názvů témat.
// Každá sekce volá bránu své domény (stejně jako aplikace) — co uživatel
// v aplikaci nevidí, nástroj vrátí jako „nedostupné“, ne jako nulu.
//
// Pevné SQL, parametry jen data období; období null = celá historie.
import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireCrmContext } from "./leads";
import { requireOrderContext } from "./orders";
import { requireCompanyNodeContext } from "./companyNodes";
import { requireCeoFocusContext } from "./ceoFocus";
import { requireDailyCallCuratorContext } from "./dailyCalls";
import { getUserProfiles } from "./userProfiles";
import { pragueDayStart, shiftDate, type CallActivityRange } from "./callActivityValidation";
import { ACTIVE_LEAD_STAGES } from "./leadValidation";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

async function rows(query: SQL): Promise<Row[]> {
  return (await db.execute(query)).rows as Row[];
}

function inRange(column: SQL, range: CallActivityRange | null): SQL {
  return range ? sql`${column} >= ${range.start} AND ${column} < ${range.end}` : sql`TRUE`;
}

const ACTIVE = sql.join(
  ACTIVE_LEAD_STAGES.map((s) => sql`${s}`),
  sql`, `
);

// Výsledek hovoru chybí, když není ani callResult, ani posun fáze.
const CALL_WITHOUT_RESULT = sql`coalesce(a.metadata->>'callResult', '') = '' AND coalesce(a.metadata->>'stageChangedTo', '') = ''`;
const CALL_WITHOUT_NOTE = sql`coalesce(trim(a.body), '') = ''`;

export async function overviewCrm(range: CallActivityRange | null, today: string) {
  await requireCrmContext();
  const todayStart = pragueDayStart(today);
  const tomorrowStart = pragueDayStart(shiftDate(today, 1));
  const [stages, state] = await Promise.all([
    rows(sql`SELECT stage, count(*) AS n FROM leads GROUP BY stage ORDER BY stage`),
    rows(sql`
      SELECT
        count(*) FILTER (WHERE stage IN (${ACTIVE})) AS active,
        count(*) FILTER (WHERE ${inRange(sql`created_at`, range)}) AS created_in_period,
        count(*) FILTER (WHERE stage IN (${ACTIVE}) AND next_follow_up_at < ${todayStart}) AS overdue,
        count(*) FILTER (WHERE stage IN (${ACTIVE}) AND next_follow_up_at >= ${todayStart} AND next_follow_up_at < ${tomorrowStart}) AS due_today,
        count(*) FILTER (WHERE stage IN (${ACTIVE}) AND next_follow_up_at IS NULL AND coalesce(trim(next_step_note), '') = '') AS missing_next_step,
        count(*) FILTER (WHERE stage IN (${ACTIVE}) AND next_follow_up_at IS NULL) AS no_follow_up_date,
        count(*) FILTER (WHERE stage IN (${ACTIVE}) AND NOT EXISTS (
          SELECT 1 FROM lead_activity a WHERE a.lead_id = leads.id AND a.kind = 'call_logged')) AS active_never_called,
        count(*) FILTER (WHERE owner_user_id IS NULL AND stage IN (${ACTIVE})) AS active_without_owner,
        count(*) FILTER (WHERE stage = 'converted' AND converted_organization_id IS NULL) AS converted_without_customer
      FROM leads`),
  ]);
  const s = state[0] ?? {};
  return {
    leadsByStage: Object.fromEntries(stages.map((r) => [String(r.stage), n(r.n)])),
    activeLeads: n(s.active),
    newLeadsInPeriod: n(s.created_in_period),
    overdue: n(s.overdue),
    dueToday: n(s.due_today),
    missingNextStep: n(s.missing_next_step),
    noFollowUpDate: n(s.no_follow_up_date),
    activeNeverCalled: n(s.active_never_called),
    activeWithoutOwner: n(s.active_without_owner),
    convertedWithoutCustomer: n(s.converted_without_customer),
  };
}

/** Zaznamenané hovory v období po autorech (první kontakt = první call_logged leadu vůbec). */
export async function overviewCalls(range: CallActivityRange | null) {
  await requireCrmContext();
  const byAuthor = await rows(sql`
    WITH firsts AS (
      SELECT DISTINCT ON (lead_id) id FROM lead_activity
      WHERE kind = 'call_logged' ORDER BY lead_id, created_at, id
    )
    SELECT a.author_user_id,
      count(*) AS recorded_calls,
      count(DISTINCT a.lead_id) AS unique_leads,
      count(DISTINCT a.lead_id) FILTER (WHERE a.id IN (SELECT id FROM firsts)) AS first_contact_leads,
      count(*) FILTER (WHERE ${CALL_WITHOUT_RESULT}) AS without_result,
      count(*) FILTER (WHERE ${CALL_WITHOUT_NOTE}) AS without_note
    FROM lead_activity a
    WHERE a.kind = 'call_logged' AND ${inRange(sql`a.created_at`, range)}
    GROUP BY a.author_user_id
    ORDER BY recorded_calls DESC`);
  const profiles = await getUserProfiles(byAuthor.map((r) => String(r.author_user_id)));
  const people = byAuthor.map((r) => {
    const p = profiles.get(String(r.author_user_id));
    return {
      salesperson: p?.name ?? p?.email ?? "neznámý uživatel",
      recordedCalls: n(r.recorded_calls),
      uniqueLeads: n(r.unique_leads),
      firstContactLeads: n(r.first_contact_leads),
      callsWithoutResult: n(r.without_result),
      callsWithoutNote: n(r.without_note),
    };
  });
  return {
    recordedCalls: people.reduce((sum, p) => sum + p.recordedCalls, 0),
    callsWithoutResult: people.reduce((sum, p) => sum + p.callsWithoutResult, 0),
    callsWithoutNote: people.reduce((sum, p) => sum + p.callsWithoutNote, 0),
    bySalesperson: people,
  };
}

export async function overviewDailyQueue(today: string, range: CallActivityRange | null) {
  await requireDailyCallCuratorContext();
  const [r] = await rows(sql`
    SELECT
      count(*) FILTER (WHERE added_for_date = ${today} AND published_at IS NOT NULL) AS planned_today,
      count(*) FILTER (WHERE added_for_date = ${today} AND published_at IS NOT NULL AND status = 'done') AS planned_today_done,
      count(*) FILTER (WHERE status = 'pending' AND published_at IS NOT NULL) AS pending_published,
      count(*) FILTER (WHERE status = 'pending' AND published_at IS NOT NULL AND added_for_date < ${today}) AS pending_from_earlier_days,
      count(*) FILTER (WHERE status = 'pending' AND published_at IS NULL) AS drafts,
      count(*) FILTER (WHERE status = 'done' AND ${inRange(sql`done_at`, range)}) AS done_in_period,
      count(*) FILTER (WHERE status = 'done' AND ${inRange(sql`done_at`, range)} AND NOT EXISTS (
        SELECT 1 FROM lead_activity a
        WHERE a.lead_id = daily_call_queue.lead_id AND a.kind = 'call_logged' AND a.author_user_id = daily_call_queue.done_by
          AND a.created_at BETWEEN daily_call_queue.done_at - interval '10 minutes' AND daily_call_queue.done_at + interval '10 minutes'
      )) AS done_without_recorded_call
    FROM daily_call_queue`);
  return {
    plannedToday: n(r?.planned_today),
    plannedTodayDone: n(r?.planned_today_done),
    pendingPublished: n(r?.pending_published),
    pendingFromEarlierDays: n(r?.pending_from_earlier_days),
    draftsNotPublished: n(r?.drafts),
    doneInPeriod: n(r?.done_in_period),
    doneWithoutRecordedCall: n(r?.done_without_recorded_call),
  };
}

export async function overviewOrders(range: CallActivityRange | null, today: string) {
  await requireOrderContext();
  const unpaidOlderThan = pragueDayStart(shiftDate(today, -14));
  const unshippedOlderThan = pragueDayStart(shiftDate(today, -3));
  const [[o], channels, [p]] = await Promise.all([
    rows(sql`
      SELECT
        count(*) FILTER (WHERE ${inRange(sql`ordered_at`, range)}) AS orders_in_period,
        coalesce(sum(total_kc) FILTER (WHERE ${inRange(sql`ordered_at`, range)} AND fulfillment_status <> 'cancelled'), 0) AS revenue_kc,
        count(*) FILTER (WHERE ${inRange(sql`ordered_at`, range)} AND fulfillment_status = 'cancelled') AS cancelled_in_period,
        count(*) FILTER (WHERE payment_status <> 'paid' AND fulfillment_status <> 'cancelled') AS unpaid_open,
        coalesce(sum(total_kc) FILTER (WHERE payment_status <> 'paid' AND fulfillment_status <> 'cancelled'), 0) AS unpaid_open_kc,
        count(*) FILTER (WHERE payment_status <> 'paid' AND fulfillment_status <> 'cancelled' AND ordered_at < ${unpaidOlderThan}) AS unpaid_over_14_days,
        count(*) FILTER (WHERE payment_status = 'paid' AND fulfillment_status IN ('new', 'confirmed') AND ordered_at < ${unshippedOlderThan}) AS paid_not_processed_3_days,
        count(*) FILTER (WHERE fulfillment_status = 'new') AS new_unconfirmed,
        count(*) FILTER (WHERE ${inRange(sql`ordered_at`, range)} AND buyer_organization_id IS NULL) AS without_customer_link_in_period
      FROM orders`),
    rows(sql`SELECT channel, count(*) AS n, coalesce(sum(total_kc) FILTER (WHERE fulfillment_status <> 'cancelled'), 0) AS kc
             FROM orders WHERE ${inRange(sql`ordered_at`, range)} GROUP BY channel ORDER BY channel`),
    rows(sql`
      SELECT
        count(*) FILTER (WHERE match_status <> 'matched') AS payments_needing_review,
        count(*) FILTER (WHERE direction = 'outflow' AND ${inRange(sql`occurred_at`, range)}) AS refunds_in_period,
        coalesce(sum(amount_hal) FILTER (WHERE direction = 'outflow' AND status = 'succeeded' AND ${inRange(sql`occurred_at`, range)}), 0) AS refunded_hal
      FROM payments`),
  ]);
  return {
    ordersInPeriod: n(o?.orders_in_period),
    revenueKcInPeriod: n(o?.revenue_kc),
    cancelledInPeriod: n(o?.cancelled_in_period),
    byChannel: channels.map((c) => ({ channel: String(c.channel), orders: n(c.n), revenueKc: n(c.kc) })),
    unpaidOpen: n(o?.unpaid_open),
    unpaidOpenKc: n(o?.unpaid_open_kc),
    needsAttention: {
      unpaidOver14Days: n(o?.unpaid_over_14_days),
      paidNotProcessedOver3Days: n(o?.paid_not_processed_3_days),
      newUnconfirmed: n(o?.new_unconfirmed),
      paymentsNeedingReview: n(p?.payments_needing_review),
    },
    refundsInPeriod: n(p?.refunds_in_period),
    refundedKcInPeriod: n(p?.refunded_hal) / 100,
    ordersWithoutCustomerLinkInPeriod: n(o?.without_customer_link_in_period),
  };
}

export async function overviewCustomers(range: CallActivityRange | null, today: string) {
  await requireCrmContext();
  const since90 = pragueDayStart(shiftDate(today, -90));
  const [r] = await rows(sql`
    WITH last_orders AS (
      SELECT buyer_organization_id AS org_id, max(ordered_at) AS last_at, count(*) AS n
      FROM orders WHERE buyer_organization_id IS NOT NULL AND fulfillment_status <> 'cancelled'
      GROUP BY buyer_organization_id
    )
    SELECT
      count(*) AS customers,
      count(*) FILTER (WHERE ${inRange(sql`o.created_at`, range)}) AS new_in_period,
      count(*) FILTER (WHERE lo.org_id IS NULL) AS never_ordered,
      count(*) FILTER (WHERE lo.last_at >= ${since90}) AS ordered_last_90_days,
      count(*) FILTER (WHERE lo.last_at < ${since90}) AS no_order_over_90_days,
      count(*) FILTER (WHERE o.owner_user_id IS NULL) AS without_owner
    FROM organizations o LEFT JOIN last_orders lo ON lo.org_id = o.id`);
  return {
    customers: n(r?.customers),
    newInPeriod: n(r?.new_in_period),
    neverOrdered: n(r?.never_ordered),
    orderedLast90Days: n(r?.ordered_last_90_days),
    noOrderOver90Days: n(r?.no_order_over_90_days),
    withoutOwner: n(r?.without_owner),
  };
}

export async function overviewCompany(staleDays: number, now: Date) {
  await requireCompanyNodeContext();
  const staleSince = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000);
  const [[r], problems] = await Promise.all([
    rows(sql`
      WITH last_activity AS (
        SELECT n.id, n.status, n.priority, n.owner_user_id,
          greatest(n.updated_at, (SELECT max(a.created_at) FROM company_node_activity a WHERE a.node_id = n.id)) AS last_at
        FROM company_nodes n WHERE n.archived_at IS NULL
      )
      SELECT count(*) AS topics,
        count(*) FILTER (WHERE status = 'red') AS red,
        count(*) FILTER (WHERE status = 'amber') AS amber,
        count(*) FILTER (WHERE status = 'green') AS green,
        count(*) FILTER (WHERE last_at < ${staleSince}) AS stagnating,
        count(*) FILTER (WHERE owner_user_id IS NULL) AS without_owner
      FROM last_activity`),
    rows(sql`
      SELECT n.id, n.title, n.status, n.priority, n.owner_user_id
      FROM company_nodes n
      WHERE n.archived_at IS NULL AND n.status IN ('red', 'amber')
      ORDER BY CASE n.status WHEN 'red' THEN 0 ELSE 1 END, n.updated_at DESC
      LIMIT 10`),
  ]);
  const owners = await getUserProfiles(problems.map((p) => p.owner_user_id).filter((v): v is string => typeof v === "string"));
  return {
    topics: n(r?.topics),
    red: n(r?.red),
    amber: n(r?.amber),
    green: n(r?.green),
    stagnating: n(r?.stagnating),
    stagnatingAfterDays: staleDays,
    withoutOwner: n(r?.without_owner),
    problemTopics: problems.map((p) => {
      const owner = typeof p.owner_user_id === "string" ? owners.get(p.owner_user_id) : null;
      return { id: String(p.id), title: String(p.title), status: String(p.status), priority: String(p.priority), owner: owner?.name ?? owner?.email ?? null };
    }),
  };
}

export async function overviewFocus() {
  await requireCeoFocusContext();
  const projects = await rows(sql`
    SELECT id, title, status, priority, is_active_now, owner_user_id, updated_at FROM focus_projects ORDER BY is_active_now DESC, updated_at DESC LIMIT 20`);
  const owners = await getUserProfiles(projects.map((p) => p.owner_user_id).filter((v): v is string => typeof v === "string"));
  return {
    projects: projects.length,
    byStatus: projects.reduce<Record<string, number>>((acc, p) => ({ ...acc, [String(p.status)]: (acc[String(p.status)] ?? 0) + 1 }), {}),
    activeNow: projects
      .filter((p) => p.is_active_now === true)
      .map((p) => {
        const owner = typeof p.owner_user_id === "string" ? owners.get(p.owner_user_id) : null;
        return { id: String(p.id), title: String(p.title), status: String(p.status), priority: String(p.priority), owner: owner?.name ?? owner?.email ?? null };
      }),
  };
}
