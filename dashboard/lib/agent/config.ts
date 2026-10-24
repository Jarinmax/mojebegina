// GPT/MCP pilot — konfigurace přístupu asistentů (konektory ChatGPT a Claude).
// VÝCHOZÍ STAV = VYPNUTO: dokud není nastavený MCP_ISSUER, MCP_ALLOWED_USER_IDS
// a aspoň jeden ÚPLNÝ klient (níže), vrací agentConfig() null a /api/mcp, /oauth/authorize, /api/oauth/*
// i /.well-known/oauth-* odpovídají 404 — jako by neexistovaly.
//
// MCP_ISSUER=https://moje.begina.cz
//   Veřejná adresa MojeBegina, pod kterou asistenti server volají (bez lomítka
//   na konci). Musí sedět přesně — z ní se skládají všechny adresy
//   v discovery (issuer, /api/mcp, /oauth/authorize…). Jen https
//   (http jen pro localhost při vývoji).
//
// Klienti (asistenti) — každý má VLASTNÍ statického OAuth klienta, souhlas
// (grant) je vázaný na klienta, který ho získal, a kanál pro audit čtení
// iDokladu je mcp:chatgpt / mcp:claude podle toho klienta. Žádná
// samoregistrace (DCR) — nikdo cizí si klienta nezaloží. Secret aspoň
// 32 znaků. Neúplně nastavený klient se ignoruje (ostatní fungují dál);
// stejné client_id u dvou klientů = vypnuto celé (nejednoznačné).
//
// ChatGPT (Lucy):
//   MCP_OAUTH_CLIENT_ID / MCP_OAUTH_CLIENT_SECRET — vkládají se ručně do
//     ChatGPT (Advanced settings konektoru).
//   MCP_OAUTH_REDIRECT_URIS — callback(y) ChatGPT oddělené čárkou, PŘESNĚ
//     jak je ChatGPT ukáže v nastavení konektoru.
// Claude (vlastní konektor v claude.ai):
//   MCP_CLAUDE_OAUTH_CLIENT_ID / MCP_CLAUDE_OAUTH_CLIENT_SECRET — vkládají se
//     do Claude (Settings › Connectors › Add custom connector › Advanced
//     settings: OAuth Client ID / Secret).
//   MCP_CLAUDE_OAUTH_REDIRECT_URIS — callback Claude, dnes
//     https://claude.ai/api/mcp/auth_callback (ověřit při připojení).
// Nic jiného se jako redirect nepřijme.
//
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

export type AgentIntegration = "chatgpt" | "claude";

export type AgentClient = {
  integration: AgentIntegration;
  /** Název asistenta pro lidi (souhlasová stránka, přípona autora v historii). */
  label: string;
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
};

export type AgentConfig = {
  issuer: string;
  clients: AgentClient[];
  allowedUserIds: Set<string>;
  writeEnabled: boolean;
};

const CLIENT_ENV: { integration: AgentIntegration; label: string; prefix: string }[] = [
  { integration: "chatgpt", label: "ChatGPT", prefix: "MCP_OAUTH" },
  { integration: "claude", label: "Claude", prefix: "MCP_CLAUDE_OAUTH" },
];

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

function clientFromEnv(env: Env, spec: (typeof CLIENT_ENV)[number]): AgentClient | null {
  const clientId = env[`${spec.prefix}_CLIENT_ID`]?.trim() ?? "";
  const clientSecret = env[`${spec.prefix}_CLIENT_SECRET`]?.trim() ?? "";
  const redirectUris = list(env[`${spec.prefix}_REDIRECT_URIS`]);
  if (!clientId || clientSecret.length < 32 || redirectUris.length === 0) return null;
  if (!redirectUris.every((uri) => uri.startsWith("https://"))) return null;
  return { integration: spec.integration, label: spec.label, clientId, clientSecret, redirectUris };
}

export function agentConfig(env: Env = process.env): AgentConfig | null {
  const issuer = env.MCP_ISSUER?.trim() ?? "";
  const allowedUserIds = list(env.MCP_ALLOWED_USER_IDS);
  const clients = CLIENT_ENV.map((spec) => clientFromEnv(env, spec)).filter((c): c is AgentClient => c !== null);

  if (!validIssuer(issuer) || clients.length === 0 || allowedUserIds.length === 0) return null;
  if (new Set(clients.map((c) => c.clientId)).size !== clients.length) return null;

  return {
    issuer,
    clients,
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
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    revocation_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    scopes_supported: [...SUPPORTED_SCOPES],
    // RFC 9207 — v odpovědi na /oauth/authorize posíláme i `iss`.
    authorization_response_iss_parameter_supported: true,
  };
}
