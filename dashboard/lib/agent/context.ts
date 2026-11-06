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
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthContext } from "@/lib/data/types";

const agentStore = new AsyncLocalStorage<NonNullable<AuthContext>>();

export function runAsAgent<T>(ctx: NonNullable<AuthContext>, fn: () => Promise<T>): Promise<T> {
  return agentStore.run(ctx, fn);
}

export function currentAgentContext(): NonNullable<AuthContext> | null {
  return agentStore.getStore() ?? null;
}
