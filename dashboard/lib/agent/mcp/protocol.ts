// GPT/MCP pilot — minimální MCP server (JSON-RPC 2.0 přes Streamable HTTP,
// bezstavový: žádná session, žádné SSE). Stačí na to, co ChatGPT od
// konektoru potřebuje: initialize, ping, tools/list, tools/call. Čistá
// funkce bez DB a bez Next.js — testovaná v __tests__/protocol.test.ts.
//
// Vlastní implementace místo SDK: podmnožina protokolu je malá a stabilní,
// bez nové závislosti a s plnou kontrolou nad tím, co server přijme.

/** Od nejnovější; klientovi vrátíme jeho verzi, umíme-li ji, jinak naši nejnovější. */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
};

export type CallToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export type McpServer = {
  instructions: string;
  listTools(): ToolDefinition[];
  /** null = neznámý nástroj (chyba protokolu, ne chyba nástroje). */
  callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult | null>;
};

type JsonRpcId = string | number;

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId | null; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId | null; error: { code: number; message: string } };

export const SERVER_INFO = { name: "mojebegina", title: "MojeBegina", version: "0.1.0" };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function error(id: JsonRpcId | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** Jedna JSON-RPC zpráva → odpověď; null pro notifikaci (bez id) — ta nemá odpověď. */
export async function handleJsonRpc(message: unknown, server: McpServer): Promise<JsonRpcResponse | null> {
  if (!isObject(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return error(null, -32600, "Invalid Request");
  }
  const hasId = "id" in message && message.id !== undefined;
  if (!hasId) return null; // notifikace (např. notifications/initialized)
  const id = message.id;
  if (typeof id !== "string" && typeof id !== "number") return error(null, -32600, "Invalid Request");

  const params = isObject(message.params) ? message.params : {};

  switch (message.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : SUPPORTED_PROTOCOL_VERSIONS[0];
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: server.instructions,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: server.listTools() } };
    case "tools/call": {
      if (typeof params.name !== "string") return error(id, -32602, "Chybí název nástroje.");
      const args = params.arguments === undefined ? {} : params.arguments;
      if (!isObject(args)) return error(id, -32602, "Argumenty nástroje musí být objekt.");
      const result = await server.callTool(params.name, args);
      if (!result) return error(id, -32602, `Neznámý nástroj: ${params.name}`);
      return { jsonrpc: "2.0", id, result };
    }
    default:
      return error(id, -32601, `Metoda není podporována: ${message.method}`);
  }
}

/** Výsledek nástroje: data jako JSON text (pro model) i structuredContent. */
export function toolSuccess(data: Record<string, unknown>): CallToolResult {
  const plain = JSON.parse(JSON.stringify(data)) as Record<string, unknown>; // Date → ISO text
  return { content: [{ type: "text", text: JSON.stringify(plain) }], structuredContent: plain };
}

export function toolError(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
