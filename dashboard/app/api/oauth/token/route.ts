// GPT/MCP pilot — token endpoint (RFC 6749 + OAuth 2.1): výměna
// autorizačního kódu (s PKCE) a rotace refresh tokenu. Klient se ověřuje
// statickým client_id/client_secret z env (Basic hlavička nebo tělo).
import { db } from "@/lib/db/client";
import { agentConfig } from "@/lib/agent/config";
import { authenticateClient, readClientCredentials } from "@/lib/agent/oauthCore";
import { exchangeAuthorizationCode, exchangeRefreshToken } from "@/lib/agent/oauthStore";
import { jsonNoStore, notFound, oauthError } from "@/lib/agent/http";

export async function POST(request: Request) {
  const config = agentConfig();
  if (!config) return notFound();

  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return oauthError("invalid_request", "Tělo musí být application/x-www-form-urlencoded.");
  }

  const credentials = readClientCredentials(request.headers.get("authorization"), form);
  if (!authenticateClient(config, credentials)) {
    return oauthError("invalid_client", "Neplatné přihlášení klienta.", 401, {
      "WWW-Authenticate": 'Basic realm="MojeBegina"',
    });
  }
  const clientId = config.clientId;

  const grantType = form.get("grant_type");
  if (grantType === "authorization_code") {
    const code = form.get("code");
    const redirectUri = form.get("redirect_uri");
    const codeVerifier = form.get("code_verifier");
    if (!code || !redirectUri || !codeVerifier) {
      return oauthError("invalid_request", "Chybí code, redirect_uri nebo code_verifier.");
    }
    const result = await exchangeAuthorizationCode(db, { clientId, code, redirectUri, codeVerifier });
    return result.ok ? jsonNoStore(result.body) : oauthError(result.error, result.description);
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token");
    if (!refreshToken) return oauthError("invalid_request", "Chybí refresh_token.");
    const result = await exchangeRefreshToken(db, { clientId, refreshToken });
    return result.ok ? jsonNoStore(result.body) : oauthError(result.error, result.description);
  }

  return oauthError("unsupported_grant_type", "Podporováno: authorization_code, refresh_token.");
}
