// Čtení iDokladu — adaptér pro MCP server MojeBegina (PR #21, lib/agent/mcp).
//
// Nástroje se NEdefinují podruhé: každý MCP nástroj jen předá argumenty
// společnému runIdokladRead() (tools.ts) s kanálem asistenta. Oprávnění,
// limity, audit (idoklad_read_log) i čtení jsou tak stejné pro ChatGPT
// (Lucy), Claude i UI MojeBegina.
//
// Registrace v lib/agent/mcp/tools.ts (IDOKLAD_TOOLS):
//
//   idokladAgentTools(defineTool, () => currentAgentChannel())
//
// kde currentAgentChannel() (lib/agent/context.ts) vrátí „mcp:<klient>“ podle
// OAuth klienta aktuálního souhlasu (mcp:chatgpt / mcp:claude). Typ
// defineTool se sem záměrně neimportuje — adaptér na lib/agent nezávisí.
import "server-only";
import { IDOKLAD_READ_TOOLS, runIdokladRead } from "./tools";

type ToolOutcome = { ok: true; data: Record<string, unknown>; summary?: Record<string, number | boolean> } | { ok: false; error: string };

type DefineToolLike<T> = (tool: {
  name: string;
  title: string;
  description: string;
  write: false;
  properties: Record<string, unknown>;
  required: string[];
  parse(args: Record<string, unknown>): Record<string, unknown>;
  execute(parsed: Record<string, unknown>, issuer: string): Promise<ToolOutcome>;
}) => T;

export function idokladAgentTools<T>(defineTool: DefineToolLike<T>, channel: () => `mcp:${string}`): T[] {
  return IDOKLAD_READ_TOOLS.map((t) =>
    defineTool({
      name: t.name,
      title: t.title,
      description: `${t.description} Údaje jsou důvěrné (fakturace Begina) — nepředávej je mimo konverzaci s oprávněnou osobou.`,
      write: false,
      properties: t.properties,
      required: t.required,
      // kontrola argumentů proběhne ve společném runneru (zapíše i neplatný pokus do auditu)
      parse: (args) => args,
      execute: async (args) => {
        const outcome = await runIdokladRead(t.name, args, channel());
        return outcome.ok ? { ok: true, data: outcome.data, summary: outcome.summary } : { ok: false, error: outcome.error };
      },
    })
  );
}
