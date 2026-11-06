// GPT/MCP pilot — RFC 8414: adresy autorizačního serveru (authorize, token,
// revoke) a podporované metody. Bez konfigurace (lib/agent/config.ts) 404.
import { agentConfig, authorizationServerMetadata } from "@/lib/agent/config";
import { jsonNoStore, notFound } from "@/lib/agent/http";

export const dynamic = "force-dynamic";

export function GET() {
  const config = agentConfig();
  return config ? jsonNoStore(authorizationServerMetadata(config)) : notFound();
}
