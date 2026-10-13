// GPT/MCP pilot — auditní stopa volání nástrojů + idempotence zápisů.
//
// Zápis: nejdřív atomický "claim" klíče (INSERT … ON CONFLICT DO NOTHING
// nad partial unique indexem (user_id, idempotency_key)), teprve pak
// samotný zápis do CRM/mapy. Stejný klíč podruhé (ChatGPT zopakuje volání
// po výpadku spojení) už nic nezapíše — vrátí se uložený výsledek.
// `db` je parametr jako v lib/eshop/* (testy nad PGlite).
import { and, count, eq, gt, isNotNull } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { createHash } from "node:crypto";
import * as schema from "@/lib/db/schema";
import { agentAuditLog } from "@/lib/db/schema";

type Db = NeonHttpDatabase<typeof schema>;

export type AuditStatus = "pending" | "ok" | "error" | "denied";

export type AuditBase = {
  grantId: string;
  userId: string;
  tool: string;
  isWrite: boolean;
  args: Record<string, unknown>;
};

const MAX_ARGS_JSON = 4000;

/** Argumenty do auditu (bez idempotency_key, oříznuté) — jen pro dohledání, ne pro opakování. */
function auditArgs(args: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...args };
  delete rest.idempotency_key;
  const json = JSON.stringify(rest);
  return json.length <= MAX_ARGS_JSON ? rest : { truncated: json.slice(0, MAX_ARGS_JSON) };
}

/** Otisk argumentů (bez klíče) — stejný klíč s JINÝMI argumenty je chyba, ne opakování. */
export function argsHash(args: Record<string, unknown>): string {
  const rest = { ...args };
  delete rest.idempotency_key;
  const stable = JSON.stringify(Object.keys(rest).sort().map((key) => [key, rest[key]]));
  return createHash("sha256").update(stable).digest("hex");
}

/** Čtení, zamítnutí a chyby před claimem: jeden hotový řádek. */
export async function logCall(
  db: Db,
  base: AuditBase,
  outcome: { status: Exclude<AuditStatus, "pending">; error?: string | null },
  now: Date = new Date()
): Promise<void> {
  await db.insert(agentAuditLog).values({
    grantId: base.grantId,
    userId: base.userId,
    tool: base.tool,
    isWrite: base.isWrite,
    args: auditArgs(base.args),
    status: outcome.status,
    error: outcome.error ?? null,
    createdAt: now,
    finishedAt: now,
  });
}

/** Zápisy, které prošly až ke claimu (mají klíč) — zamítnutá volání se do limitu nepočítají. */
export async function writesInLastHour(db: Db, grantId: string, now: Date = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(agentAuditLog)
    .where(
      and(
        eq(agentAuditLog.grantId, grantId),
        isNotNull(agentAuditLog.idempotencyKey),
        gt(agentAuditLog.createdAt, new Date(now.getTime() - 60 * 60 * 1000))
      )
    );
  return Number(row?.n ?? 0);
}

export type ClaimResult =
  | { claimed: true; id: string }
  | {
      claimed: false;
      sameArgs: boolean;
      status: AuditStatus;
      result: unknown;
      error: string | null;
    };

export async function claimWrite(db: Db, base: AuditBase, key: string, now: Date = new Date()): Promise<ClaimResult> {
  const hash = argsHash(base.args);
  const inserted = await db
    .insert(agentAuditLog)
    .values({
      grantId: base.grantId,
      userId: base.userId,
      tool: base.tool,
      isWrite: true,
      idempotencyKey: key,
      argsHash: hash,
      args: auditArgs(base.args),
      status: "pending",
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: agentAuditLog.id });
  if (inserted.length > 0) return { claimed: true, id: inserted[0].id };

  const [existing] = await db
    .select()
    .from(agentAuditLog)
    .where(and(eq(agentAuditLog.userId, base.userId), eq(agentAuditLog.idempotencyKey, key)))
    .limit(1);
  return {
    claimed: false,
    sameArgs: existing?.tool === base.tool && existing?.argsHash === hash,
    status: (existing?.status ?? "pending") as AuditStatus,
    result: existing?.result ?? null,
    error: existing?.error ?? null,
  };
}

export async function finishWrite(
  db: Db,
  id: string,
  outcome: { status: Exclude<AuditStatus, "pending">; result?: Record<string, unknown> | null; error?: string | null },
  now: Date = new Date()
): Promise<void> {
  await db
    .update(agentAuditLog)
    .set({
      status: outcome.status,
      result: outcome.result ?? null,
      error: outcome.error ?? null,
      finishedAt: now,
    })
    .where(eq(agentAuditLog.id, id));
}
