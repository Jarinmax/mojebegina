// GPT/MCP pilot — konfigurace přístupu asistenta (ChatGPT konektor).
// VÝCHOZÍ STAV = VYPNUTO: dokud nejsou nastavené VŠECHNY proměnné níže,
// vrací agentConfig() null a /api/mcp, /oauth/authorize, /api/oauth/*
// i /.well-known/oauth-* odpovídají 404 — jako by neexistovaly.
//
// MCP_ISSUER=https://moje.begina.cz
//   Veřejná adresa MojeBegina, pod kterou ChatGPT server volá (bez lomítka
//   na konci). Musí sedět přesně — z ní se skládají všechny adresy
//   v discovery (issuer, /api/mcp, /oauth/authorize…). Jen https
//   (http jen pro localhost při vývoji).
// MCP_OAUTH_CLIENT_ID / MCP_OAUTH_CLIENT_SECRET
//   Předem domluvený (statický) OAuth klient, který se ručně vloží do
//   ChatGPT (Advanced settings konektoru). Žádná samoregistrace (DCR) —
//   nikdo cizí si klienta nezaloží. Secret aspoň 32 znaků.
// MCP_OAUTH_REDIRECT_URIS
//   Callback adresa(y) ChatGPT oddělené čárkou, PŘESNĚ jak je ChatGPT
//   ukáže v nastavení konektoru. Nic jiného se jako redirect nepřijme.
// MCP_ALLOWED_USER_IDS
//   Neon Auth userId oddělená čárkou — kdo smí asistentovi přístup vůbec
//   udělit (pilot: jen Jaroslav Viner; kolegové se přidají sem). Kromě toho
//   musí mít účet roli ADMIN nebo EXECUTIVE (lib/agent/oauthCore.ts, AGENT_ROLES).
//
// MCP_ALLOW_WRITE=on   (nepovinné, VÝCHOZÍ = VYPNUTO → asistent jen čte)
//   Teprve s ním může uživatel na souhlasové stránce povolit zápisy. Bez něj
//   se zápis nedá udělit vůbec, a i dřív udělený zápisový souhlas se chová
//   jako jen pro čtení (zápisové nástroje se nenabízejí ani nevykonají).
type Env = Record<string, string | undefined>;

export const SCOPE_READ = "mojebegina.read";
export const SCOPE_WRITE = "mojebegina.write";
export const SUPPORTED_SCOPES = [SCOPE_READ, SCOPE_WRITE] as const;

export const CODE_TTL_MS = 5 * 60 * 1000;
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Nejvýš tolik zápisů za hodinu na jeden udělený souhlas (pojistka proti zacyklenému asistentovi). */
export const WRITE_LIMIT_PER_HOUR = 60;

/** Nejvýš tolik čtecích volání za hodinu na jeden souhlas — běžná práce se vejde, hromadné vytěžení databáze ne. */
export const READ_LIMIT_PER_HOUR = 600;

export type AgentConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  allowedUserIds: Set<string>;
  writeEnabled: boolean;
};

function list(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function validIssuer(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const protocolOk = url.protocol === "https:" || (local && url.protocol === "http:");
  // Jen origin — žádná cesta, parametry ani lomítko na konci.
  return protocolOk && url.origin === raw;
}

export function agentConfig(env: Env = process.env): AgentConfig | null {
  const issuer = env.MCP_ISSUER?.trim() ?? "";
  const clientId = env.MCP_OAUTH_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.MCP_OAUTH_CLIENT_SECRET?.trim() ?? "";
  const redirectUris = list(env.MCP_OAUTH_REDIRECT_URIS);
  const allowedUserIds = list(env.MCP_ALLOWED_USER_IDS);

  if (!validIssuer(issuer) || !clientId || clientSecret.length < 32) return null;
  if (redirectUris.length === 0 || allowedUserIds.length === 0) return null;
  if (!redirectUris.every((uri) => uri.startsWith("https://"))) return null;

  return {
    issuer,
    clientId,
    clientSecret,
    redirectUris,
    allowedUserIds: new Set(allowedUserIds),
    writeEnabled: env.MCP_ALLOW_WRITE?.trim() === "on",
  };
}

export function mcpResourceUrl(config: AgentConfig): string {
  return `${config.issuer}/api/mcp`;
}

export function protectedResourceMetadataUrl(config: AgentConfig): string {
  return `${config.issuer}/.well-known/oauth-protected-resource/api/mcp`;
}

/** RFC 9728 — metadata chráněného zdroje (/api/mcp). */
export function protectedResourceMetadata(config: AgentConfig) {
  return {
    resource: mcpResourceUrl(config),
    authorization_servers: [config.issuer],
    scopes_supported: [...SUPPORTED_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "MojeBegina",
  };
}

/** RFC 8414 — metadata autorizačního serveru. */
export function authorizationServerMetadata(config: AgentConfig) {
  return {
    issuer: config.issuer,
    authorization_endpoint: `${config.issuer}/oauth/authorize`,
    token_endpoint: `${config.issuer}/api/oauth/token`,
    revocation_endpoint: `${config.issuer}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    // ChatGPT používá veřejného OAuth klienta s PKCE; stávající confidential režimy
    // ponecháváme kvůli zpětné kompatibilitě.
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    scopes_supported: [...SUPPORTED_SCOPES],
    // RFC 9207 — v odpovědi na /oauth/authorize posíláme i `iss`.
    authorization_response_iss_parameter_supported: true,
  };
}
