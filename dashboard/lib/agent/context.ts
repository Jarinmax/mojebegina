// GPT/MCP pilot — identita asistenta pro JEDNO volání nástroje.
//
// Datová vrstva (lib/data/*) si identitu vždy bere z getAuthContext() —
// jinak z cookie session prohlížeče. Volání z ChatGPT ale cookie nemá; má
// bearer token, který /api/mcp ověří (lib/agent/oauthStore.ts) a z něj
// sestaví STEJNÝ tvar AuthContext (uživatel, který souhlas udělil, jeho role
// čerstvě z DB). Ten se sem uloží jen na dobu jednoho volání nástroje přes
// AsyncLocalStorage a getAuthContext() ho vrátí místo session.
//
// Díky tomu každá existující brána (requireCrmAccess, requireCompanyNode-
// Access…) i každá datová funkce platí pro asistenta úplně stejně jako pro
// člověka v prohlížeči — žádná paralelní sada oprávnění. Hodnotu sem smí
// vložit JEN runAsAgent, volaný z /api/mcp po ověření tokenu; nic z požadavku
// ji nemůže podvrhnout.
//
// Spolu s identitou se ukládá i asistent (OAuth klient souhlasu): z něj je
// kanál mcp:chatgpt / mcp:claude pro čtení iDokladu (lib/idoklad-read) —
// odvozený z ověřeného tokenu, nikdy z argumentů nástroje.
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthContext } from "@/lib/data/types";
import type { AgentIntegration } from "./config";

type AgentStore = { ctx: NonNullable<AuthContext>; integration: AgentIntegration | null };

const agentStore = new AsyncLocalStorage<AgentStore>();

export function runAsAgent<T>(
  ctx: NonNullable<AuthContext>,
  fn: () => Promise<T>,
  integration: AgentIntegration | null = null
): Promise<T> {
  return agentStore.run({ ctx, integration }, fn);
}

export function currentAgentContext(): NonNullable<AuthContext> | null {
  return agentStore.getStore()?.ctx ?? null;
}

/** Kanál aktuálního asistenta; bez známého klienta „mcp:unknown“ — ten žádná povolená sada nezná. */
export function currentAgentChannel(): `mcp:${string}` {
  const integration = agentStore.getStore()?.integration;
  return integration ? `mcp:${integration}` : "mcp:unknown";
}
