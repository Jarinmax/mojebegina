// GPT/MCP pilot — RFC 9728: kde je autorizační server pro /api/mcp.
// ChatGPT sem dojde z hlavičky WWW-Authenticate (resource_metadata) při
// první odpovědi 401 z /api/mcp. Bez konfigurace (lib/agent/config.ts) 404.
import { agentConfig, protectedResourceMetadata } from "@/lib/agent/config";
import { jsonNoStore, notFound } from "@/lib/agent/http";

export const dynamic = "force-dynamic";

export function GET() {
  const config = agentConfig();
  return config ? jsonNoStore(protectedResourceMetadata(config)) : notFound();
}
