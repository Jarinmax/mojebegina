// GPT/MCP pilot — MCP server pro ChatGPT (Streamable HTTP, bezstavový:
// každý POST nese JSON-RPC zprávu a dostane JSON odpověď; žádné SSE ani
// session). Bez platného access tokenu 401 s odkazem na OAuth metadata —
// tím ChatGPT pozná, že má uživatele poslat na /oauth/authorize.
// Bez konfigurace (lib/agent/config.ts) 404.
import { db } from "@/lib/db/client";
import { agentConfig, protectedResourceMetadataUrl } from "@/lib/agent/config";
import { resolveAccessToken } from "@/lib/agent/oauthStore";
import { handleJsonRpc } from "@/lib/agent/mcp/protocol";
import { agentMcpServer } from "@/lib/agent/mcp/server";
import { jsonNoStore, notFound } from "@/lib/agent/http";

export const maxDuration = 60;

const MAX_BODY_BYTES = 256 * 1024;

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function POST(request: Request) {
  const config = agentConfig();
  if (!config) return notFound();

  const token = bearerToken(request);
  const session = token ? await resolveAccessToken(db, config, token) : null;
  if (!session) {
    const params = [`resource_metadata="${protectedResourceMetadataUrl(config)}"`];
    if (token) params.push('error="invalid_token"');
    return jsonNoStore({ error: "unauthorized" }, 401, { "WWW-Authenticate": `Bearer ${params.join(", ")}` });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return jsonNoStore({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Požadavek je příliš velký." } }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonNoStore({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

  const server = agentMcpServer(db, session, config.issuer);

  // Dávka (protokol 2025-03-26) i jednotlivá zpráva; zprávy dávky se
  // zpracují postupně (zápisy se tak nepředbíhají).
  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > 20) {
      return jsonNoStore({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }, 400);
    }
    const responses = [];
    for (const message of body) {
      const response = await handleJsonRpc(message, server);
      if (response) responses.push(response);
    }
    return responses.length > 0 ? jsonNoStore(responses) : new Response(null, { status: 202 });
  }

  const response = await handleJsonRpc(body, server);
  return response ? jsonNoStore(response) : new Response(null, { status: 202 });
}

// Bezstavový server nenabízí SSE stream ani ukončení session.
export function GET() {
  return agentConfig() ? new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } }) : notFound();
}

export function DELETE() {
  return agentConfig() ? new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } }) : notFound();
}
