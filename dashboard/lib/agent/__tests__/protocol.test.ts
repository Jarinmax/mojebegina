// GPT/MCP pilot — JSON-RPC vrstva MCP serveru a kontrola argumentů nástrojů.
import { describe, expect, it } from "vitest";
import { handleJsonRpc, toolSuccess, type McpServer } from "../mcp/protocol";
import { ArgError, idempotencyKey, optionalEnum, optionalString, requiredString, requiredUuid } from "../mcp/args";

const server: McpServer = {
  instructions: "pokyny",
  listTools: () => [
    {
      name: "echo",
      title: "Echo",
      description: "",
      inputSchema: { type: "object" },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ],
  callTool: async (name, args) => (name === "echo" ? toolSuccess({ args }) : null),
};

describe("MCP JSON-RPC", () => {
  it("initialize: vrátí verzi klienta, umíme-li ji, jinak naši nejnovější", async () => {
    const res = await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, server);
    expect(res).toMatchObject({
      id: 1,
      result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "mojebegina" }, instructions: "pokyny" },
    });
    const old = await handleJsonRpc({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2024-11-05" } }, server);
    expect(old).toMatchObject({ result: { protocolVersion: "2025-11-25" } });
  });

  it("notifikace nemá odpověď", async () => {
    expect(await handleJsonRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, server)).toBeNull();
  });

  it("tools/list a tools/call", async () => {
    expect(await handleJsonRpc({ jsonrpc: "2.0", id: "a", method: "tools/list" }, server)).toMatchObject({
      result: { tools: [{ name: "echo" }] },
    });
    const call = await handleJsonRpc(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "echo", arguments: { x: 1 } } },
      server
    );
    expect(call).toMatchObject({ result: { structuredContent: { args: { x: 1 } } } });
  });

  it("chyby protokolu", async () => {
    expect(await handleJsonRpc({ id: 1, method: "ping" }, server)).toMatchObject({ error: { code: -32600 } });
    expect(await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "resources/list" }, server)).toMatchObject({
      error: { code: -32601 },
    });
    expect(
      await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "neni" } }, server)
    ).toMatchObject({ error: { code: -32602 } });
    expect(
      await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "echo", arguments: [1] } }, server)
    ).toMatchObject({ error: { code: -32602 } });
  });

  it("toolSuccess: Date → ISO text i v structuredContent", () => {
    const result = toolSuccess({ at: new Date("2026-10-13T10:00:00Z") });
    expect(result.structuredContent).toEqual({ at: "2026-10-13T10:00:00.000Z" });
    expect(JSON.parse(result.content[0].text)).toEqual({ at: "2026-10-13T10:00:00.000Z" });
  });
});

describe("argumenty nástrojů", () => {
  it("text: ořez, prázdný = null, délka", () => {
    expect(optionalString({ a: "  x " }, "a", 5)).toBe("x");
    expect(optionalString({ a: "   " }, "a", 5)).toBeNull();
    expect(() => optionalString({ a: 5 }, "a", 5)).toThrow(ArgError);
    expect(() => requiredString({ a: "123456" }, "a", 5)).toThrow(ArgError);
    expect(() => requiredString({}, "a", 5)).toThrow(ArgError);
  });

  it("id musí být UUID (žádné vymyšlené id ani SQL)", () => {
    expect(requiredUuid({ id: "00000000-0000-4000-8000-0000000000AA" }, "id")).toBe("00000000-0000-4000-8000-0000000000aa");
    for (const bad of ["1", "x' OR 1=1 --", "", "00000000-0000-4000-8000-0000000000a"]) {
      expect(() => requiredUuid({ id: bad }, "id")).toThrow(ArgError);
    }
  });

  it("výčet a idempotency_key", () => {
    expect(optionalEnum({ p: "high" }, "p", ["low", "high"] as const)).toBe("high");
    expect(() => optionalEnum({ p: "x" }, "p", ["low"] as const)).toThrow(ArgError);
    expect(idempotencyKey({ idempotency_key: "3f2b6c1e-aaaa-4bbb-8ccc-123456789abc" })).toBe(
      "3f2b6c1e-aaaa-4bbb-8ccc-123456789abc"
    );
    for (const bad of [undefined, "kratky", "x".repeat(101), "mezera v klíči"]) {
      expect(() => idempotencyKey({ idempotency_key: bad })).toThrow(ArgError);
    }
  });
});

describe("audit — argumenty bez obsahu CRM", async () => {
  const { auditArgs } = await import("../mcp/audit");
  it("id, true/false a řídicí hodnoty zůstanou; text jen jako délka; klíč a neznámé typy pryč", () => {
    expect(
      auditArgs({
        lead_id: "00000000-0000-4000-8000-0000000000c1",
        text: "Poznámka s telefonem 777 111 222",
        query: "Petra Malá",
        priority: "high",
        follow_up_date: "2026-10-20",
        only_mine: true,
        idempotency_key: "key-12345678",
        nested: { token: "mba_x" },
      })
    ).toEqual({
      lead_id: "00000000-0000-4000-8000-0000000000c1",
      text: "[32 znaků]",
      query: "[10 znaků]",
      priority: "high",
      follow_up_date: "2026-10-20",
      only_mine: true,
      nested: "[object]",
    });
  });
});
