// GPT/MCP pilot — jedno volání nástroje od začátku do konce:
//   1. rozsah (scope): zápis jen s mojebegina.write,
//   2. kontrola argumentů (bez DB),
//   3. u zápisu limit za hodinu a atomický claim idempotency_key,
//   4. samotná práce pod identitou uživatele (runAsAgent → getAuthContext),
//      oprávnění rozhodují stávající brány datové vrstvy,
//   5. auditní záznam (vždy — i chyba a zamítnutí).
import "server-only";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";
import { runAsAgent } from "../context";
import { SCOPE_WRITE, WRITE_LIMIT_PER_HOUR } from "../config";
import { hasScope } from "../oauthCore";
import type { AgentSession } from "../oauthStore";
import { ArgError, idempotencyKey } from "./args";
import { claimWrite, finishWrite, logCall, writesInLastHour, type AuditBase } from "./audit";
import { toolError, toolSuccess, type CallToolResult, type McpServer } from "./protocol";
import { AGENT_TOOLS, SERVER_INSTRUCTIONS, type AgentTool, type ToolOutcome } from "./tools";

type Db = NeonHttpDatabase<typeof schema>;

const DENIED_MESSAGE = "Na tuto akci nemá váš účet v MojeBegina oprávnění.";
const FAILED_MESSAGE = "Akce se nezdařila kvůli chybě na straně MojeBegina. Zkuste to později; při opakování zápisu použijte nový idempotency_key.";

async function runTool(
  tool: AgentTool,
  parsed: unknown,
  session: AgentSession,
  issuer: string
): Promise<{ status: "ok" | "error" | "denied"; outcome: ToolOutcome }> {
  try {
    const outcome = await runAsAgent(session.ctx, () => tool.execute(parsed, issuer));
    return { status: outcome.ok ? "ok" : "error", outcome };
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthenticatedError) {
      return { status: "denied", outcome: { ok: false, error: DENIED_MESSAGE } };
    }
    console.error("MCP nástroj selhal", tool.definition.name, error);
    return { status: "error", outcome: { ok: false, error: FAILED_MESSAGE } };
  }
}

function toResult(outcome: ToolOutcome): CallToolResult {
  return outcome.ok ? toolSuccess(outcome.data) : toolError(outcome.error);
}

export async function callAgentTool(
  db: Db,
  session: AgentSession,
  issuer: string,
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult | null> {
  const tool = AGENT_TOOLS.find((t) => t.definition.name === name);
  if (!tool) return null;

  const base: AuditBase = { grantId: session.grantId, userId: session.ctx.userId, tool: name, isWrite: tool.write, args };

  if (tool.write && !hasScope(session.scope, SCOPE_WRITE)) {
    const message = "Zápisy nejsou pro tohle propojení povolené (souhlas byl udělen jen pro čtení). Pro zápisy je potřeba konektor v ChatGPT znovu připojit a zápisy povolit.";
    await logCall(db, base, { status: "denied", error: "scope" });
    return toolError(message);
  }

  let parsed: unknown;
  try {
    parsed = tool.parse(args);
  } catch (error) {
    if (!(error instanceof ArgError)) throw error;
    await logCall(db, base, { status: "error", error: error.message });
    return toolError(error.message);
  }

  if (!tool.write) {
    const { status, outcome } = await runTool(tool, parsed, session, issuer);
    await logCall(db, base, { status, error: outcome.ok ? null : outcome.error });
    return toResult(outcome);
  }

  if ((await writesInLastHour(db, session.grantId)) >= WRITE_LIMIT_PER_HOUR) {
    await logCall(db, base, { status: "denied", error: "rate_limit" });
    return toolError(`Překročen limit ${WRITE_LIMIT_PER_HOUR} zápisů za hodinu. Zkuste to později.`);
  }

  const claim = await claimWrite(db, base, idempotencyKey(args));
  if (!claim.claimed) {
    if (!claim.sameArgs) {
      return toolError("Tento idempotency_key už byl použit pro jiný zápis. Pro nový zápis vygenerujte nový klíč.");
    }
    if (claim.status === "ok" && claim.result && typeof claim.result === "object") {
      return toolSuccess({ ...(claim.result as Record<string, unknown>), alreadySaved: true });
    }
    if (claim.status === "pending") {
      return toolError("Zápis s tímto klíčem právě probíhá nebo nedoběhl. Ověřte výsledek v MojeBegina, než ho zopakujete s novým klíčem.");
    }
    return toolError(claim.error ?? FAILED_MESSAGE);
  }

  const { status, outcome } = await runTool(tool, parsed, session, issuer);
  await finishWrite(db, claim.id, {
    status,
    result: outcome.ok ? outcome.data : null,
    error: outcome.ok ? null : outcome.error,
  });
  return toResult(outcome);
}

export function agentMcpServer(db: Db, session: AgentSession, issuer: string): McpServer {
  return {
    instructions: SERVER_INSTRUCTIONS,
    listTools: () =>
      AGENT_TOOLS.filter((t) => !t.write || hasScope(session.scope, SCOPE_WRITE)).map((t) => t.definition),
    callTool: (name, args) => callAgentTool(db, session, issuer, name, args),
  };
}
