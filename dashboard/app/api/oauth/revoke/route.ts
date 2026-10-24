// GPT/MCP pilot — RFC 7009: odvolání tokenu klientem (např. odpojení
// konektoru v ChatGPT nebo Claude). Odvolá celý souhlas, ale jen souhlas
// TOHO klienta; odpověď je 200 i pro neznámý nebo cizí token (RFC 7009
// §2.2 — neprozrazovat, zda token existoval).
import { db } from "@/lib/db/client";
import { agentConfig } from "@/lib/agent/config";
import { authenticateClient, readClientCredentials } from "@/lib/agent/oauthCore";
import { revokeByToken } from "@/lib/agent/oauthStore";
import { notFound, oauthError } from "@/lib/agent/http";

export async function POST(request: Request) {
  const config = agentConfig();
  if (!config) return notFound();

  const form = new URLSearchParams(await request.text());
  const client = authenticateClient(config, readClientCredentials(request.headers.get("authorization"), form));
  if (!client) {
    return oauthError("invalid_client", "Neplatné přihlášení klienta.", 401, {
      "WWW-Authenticate": 'Basic realm="MojeBegina"',
    });
  }

  const token = form.get("token");
  if (token) await revokeByToken(db, token, client.clientId);
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
