// Varianta s cestou zdroje (RFC 9728 §3.1): /.well-known/oauth-protected-resource/api/mcp
// — na tuhle adresu odkazuje WWW-Authenticate z /api/mcp. Obsah stejný jako bez cesty.
import { agentConfig, protectedResourceMetadata } from "@/lib/agent/config";
import { jsonNoStore, notFound } from "@/lib/agent/http";

export const dynamic = "force-dynamic";

export function GET() {
  const config = agentConfig();
  return config ? jsonNoStore(protectedResourceMetadata(config)) : notFound();
}
