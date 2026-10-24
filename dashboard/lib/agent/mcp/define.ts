// GPT/MCP pilot — společná definice nástroje (schéma, anotace, kontrola
// argumentů). Samostatný soubor, aby se nástroje daly dělit po doménách
// (tools.ts, tools/*.ts) bez kruhových importů.
import type { ToolDefinition } from "./protocol";
import { idempotencyKey } from "./args";

export type ToolOutcome =
  | { ok: true; data: Record<string, unknown>; summary?: Record<string, number | boolean> }
  | { ok: false; error: string };

export type AgentTool = {
  definition: ToolDefinition;
  write: boolean;
  /** Vyhodí ArgError při neplatném argumentu. */
  parse(args: Record<string, unknown>): unknown;
  execute(parsed: unknown, issuer: string): Promise<ToolOutcome>;
};

export function defineTool<P>(tool: {
  name: string;
  title: string;
  description: string;
  write: boolean;
  properties: Record<string, unknown>;
  required: string[];
  parse(args: Record<string, unknown>): P;
  execute(parsed: P, issuer: string): Promise<ToolOutcome>;
}): AgentTool {
  const properties = tool.write
    ? {
        ...tool.properties,
        idempotency_key: {
          type: "string",
          description:
            "Jedinečný klíč TOHOTO zápisu (např. nové UUID). Když stejný zápis opakuješ (třeba po chybě spojení), pošli stejný klíč — nic se nezapíše dvakrát. Pro každý nový zápis nový klíč.",
        },
      }
    : tool.properties;
  return {
    write: tool.write,
    definition: {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: {
        type: "object",
        properties,
        required: tool.write ? [...tool.required, "idempotency_key"] : tool.required,
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: !tool.write,
        destructiveHint: false,
        idempotentHint: !tool.write,
        openWorldHint: false,
      },
    },
    parse: (args) => {
      if (tool.write) idempotencyKey(args);
      return tool.parse(args);
    },
    execute: (parsed, issuer) => tool.execute(parsed as P, issuer),
  };
}

export const leadUrl = (issuer: string, id: string) => `${issuer}/rizeni-firmy/obchod/leady/${id}`;
export const customerUrl = (issuer: string, id: string) => `${issuer}/rizeni-firmy/obchod/zakaznici/${id}`;
export const taskUrl = (issuer: string, id: string) => `${issuer}/rizeni-firmy/uzel/${id}`;

