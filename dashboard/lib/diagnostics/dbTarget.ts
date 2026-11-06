// GPT/MCP pilot — diagnostika „kam se Preview deployment skutečně připojuje“.
// Čisté funkce bez I/O (testy v __tests__/dbTarget.test.ts). Z adres se
// vrací VÝHRADNĚ hostname — nikdy uživatel, heslo, databáze ani parametry.
// Stránka: app/diagnostika-db (jen ADMIN, jen VERCEL_ENV=preview).

/** Production `main` (ověřeno read-only 13. 10. 2026, viz docs/gpt-mcp/00_kde_jsem.sql). */
export const PRODUCTION_DB = {
  branchId: "br-odd-surf-b2by4tja",
  endpointId: "ep-orange-lake-b2zctiy8",
  timelineId: "70a96b3677653646e65343cae8e27182",
} as const;

/** Neon větev Preview pilotu (preview/claude/upbeat-goodall-pj64t5). */
export const PILOT_PREVIEW_DB = {
  branchId: "br-super-dust-b2wbw2wk",
  endpointId: "ep-bold-fire-b2x24ylv",
} as const;

type Env = Record<string, string | undefined>;

/**
 * Adresa stránky. Záměrně MIMO /admin: layout /admin pošle nepřihlášeného
 * na /login bez návratové adresy (layout cestu nezná) a po přihlášení by
 * skončil na "/" → /admin (Organizace). Stránka si přihlášení hlídá sama
 * a na /login předá ?next= (povolené v safeNextPath).
 */
export const DB_DIAGNOSTICS_PATH = "/diagnostika-db";

/** Diagnostika existuje jen na Preview (jinde 404 ještě před přihlášením). */
export function isPreviewDeployment(env: Env): boolean {
  return env.VERCEL_ENV === "preview";
}

/** Diagnostika existuje jen na Preview a jen pro aktivní roli ADMIN. */
export function dbDiagnosticsAllowed(env: Env, systemRole: string | null | undefined): boolean {
  return isPreviewDeployment(env) && systemRole === "ADMIN";
}

/** Hostname z connection stringu; cokoli jiného (uživatel, heslo, db, query) zahodí. */
export function connectionHostname(connectionString: string | undefined): string | null {
  if (!connectionString) return null;
  try {
    const hostname = new URL(connectionString.trim()).hostname;
    return hostname || null;
  } catch {
    return null;
  }
}

/** Samotný hostname (PGHOST) — jen když opravdu vypadá jako hostname. */
export function plainHostname(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !/^[A-Za-z0-9.-]+$/.test(trimmed)) return null;
  return trimmed;
}

/** ep-…-pooler.c-6.eu-central-1.aws.neon.tech → ep-… (endpoint ID Neonu). */
export function neonEndpointId(hostname: string | null): string | null {
  const first = hostname?.split(".")[0] ?? "";
  const id = first.replace(/-pooler$/, "");
  return /^ep-[a-z0-9-]+$/.test(id) ? id : null;
}

export type ServerReport = {
  branchId: string | null;
  endpointId: string | null;
  timelineId: string | null;
};

export type Verdict = "pilot" | "production" | "other" | "unknown";

/**
 * Souhrnný verdikt. „pilot“ jen když endpoint z DATABASE_URL, endpoint z
 * PGHOST (z něj jde Neon Auth) i endpoint a větev nahlášené samotným
 * serverem Postgres sedí na Preview větev pilotu. Jakákoli stopa
 * Production má přednost.
 */
export function dbVerdict(
  vars: { urlEndpointId: string | null; pgHostEndpointId: string | null },
  server: ServerReport | null
): Verdict {
  if (
    vars.urlEndpointId === PRODUCTION_DB.endpointId ||
    vars.pgHostEndpointId === PRODUCTION_DB.endpointId ||
    server?.endpointId === PRODUCTION_DB.endpointId ||
    server?.branchId === PRODUCTION_DB.branchId ||
    server?.timelineId === PRODUCTION_DB.timelineId
  ) {
    return "production";
  }
  if (!vars.urlEndpointId || !vars.pgHostEndpointId || !server?.endpointId || !server.branchId) return "unknown";
  if (
    vars.urlEndpointId === PILOT_PREVIEW_DB.endpointId &&
    vars.pgHostEndpointId === PILOT_PREVIEW_DB.endpointId &&
    server.endpointId === PILOT_PREVIEW_DB.endpointId &&
    server.branchId === PILOT_PREVIEW_DB.branchId
  ) {
    return "pilot";
  }
  return "other";
}

/** Údaje o deploymentu ze systémových proměnných Vercelu (nic tajného). */
export function deploymentInfo(env: Env) {
  return {
    environment: env.VERCEL_ENV ?? null,
    commitSha: env.VERCEL_GIT_COMMIT_SHA ?? null,
    commitRef: env.VERCEL_GIT_COMMIT_REF ?? null,
    deploymentId: env.VERCEL_DEPLOYMENT_ID ?? null,
    deploymentHost: plainHostname(env.VERCEL_URL),
  };
}
