// GPT/MCP pilot — OAuth úložiště: udělení souhlasu (grant), autorizační
// kód, access/refresh tokeny, odvolání a ověření access tokenu na identitu.
//
// Stejný vzor jako lib/eshop/*: `db` je parametr (v aplikaci lib/db/client,
// v testech ovladač Neonu nad PGlite). Jednorázovost kódu a refresh tokenu
// hlídá atomický "claim" (UPDATE … WHERE used_at IS NULL RETURNING) — dvě
// souběžná použití nikdy nevydají dva páry tokenů. Opakované použití už
// použitého kódu/refresh tokenu = známka odcizení → odvolá se celý grant.
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { agentAuditLog, agentGrants, agentTokens, userProfiles, userRoles } from "@/lib/db/schema";
import type { AuthContext, SystemRole } from "@/lib/data/types";
import {
  ACCESS_TOKEN_TTL_MS,
  CODE_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  type AgentClient,
  type AgentConfig,
} from "./config";
import {
  AGENT_ROLES,
  findClient,
  hashToken,
  isAgentUserAllowed,
  newToken,
  safeEqual,
  scopeString,
  verifyPkce,
} from "./oauthCore";

type Db = NeonHttpDatabase<typeof schema>;

/** Přípona jména autora u všeho, co asistent zapíše — v historii je hned vidět, který asistent to byl. */
export function agentNameSuffix(client: Pick<AgentClient, "label">): string {
  return ` (přes ${client.label})`;
}

export type TokenSuccess = {
  ok: true;
  body: {
    access_token: string;
    token_type: "Bearer";
    expires_in: number;
    refresh_token: string;
    scope: string;
  };
};
export type TokenFailure = { ok: false; error: "invalid_grant" | "invalid_request"; description: string };

// --- Souhlas → autorizační kód --------------------------------------------

export async function issueAuthorizationCode(
  db: Db,
  input: {
    userId: string;
    systemRole: SystemRole;
    clientId: string;
    write: boolean;
    redirectUri: string;
    codeChallenge: string;
  },
  now: Date = new Date()
): Promise<string> {
  const grantId = crypto.randomUUID();
  const code = newToken("code");
  await db.batch([
    db.insert(agentGrants).values({
      id: grantId,
      userId: input.userId,
      systemRole: input.systemRole,
      clientId: input.clientId,
      scope: scopeString(input.write),
      createdAt: now,
    }),
    db.insert(agentTokens).values({
      tokenHash: hashToken(code),
      grantId,
      kind: "code",
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      createdAt: now,
    }),
  ]);
  return code;
}

async function revokeGrant(db: Db, grantId: string, reason: string, now: Date): Promise<void> {
  await db
    .update(agentGrants)
    .set({ revokedAt: now, revokedReason: reason })
    .where(and(eq(agentGrants.id, grantId), isNull(agentGrants.revokedAt)));
}

async function issueTokenPair(db: Db, grantId: string, scope: string, now: Date): Promise<TokenSuccess> {
  const accessToken = newToken("access");
  const refreshToken = newToken("refresh");
  await db.batch([
    db.insert(agentTokens).values({
      tokenHash: hashToken(accessToken),
      grantId,
      kind: "access",
      expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
      createdAt: now,
    }),
    db.insert(agentTokens).values({
      tokenHash: hashToken(refreshToken),
      grantId,
      kind: "refresh",
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      createdAt: now,
    }),
  ]);
  return {
    ok: true,
    body: {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: refreshToken,
      scope,
    },
  };
}

/**
 * Atomicky "spotřebuje" jednorázový kód/refresh token. Při opakovaném
 * použití odvolá grant (RFC 9700 — detekce znovupoužití).
 */
async function claimSingleUse(db: Db, token: string, kind: "code" | "refresh", now: Date) {
  const tokenHash = hashToken(token);
  const [claimed] = await db
    .update(agentTokens)
    .set({ usedAt: now })
    .where(and(eq(agentTokens.tokenHash, tokenHash), eq(agentTokens.kind, kind), isNull(agentTokens.usedAt)))
    .returning();
  if (claimed) return claimed;

  const [existing] = await db
    .select({ grantId: agentTokens.grantId })
    .from(agentTokens)
    .where(and(eq(agentTokens.tokenHash, tokenHash), eq(agentTokens.kind, kind)))
    .limit(1);
  if (existing) {
    await revokeGrant(db, existing.grantId, `${kind}_reuse`, now);
  }
  return null;
}

async function activeGrant(db: Db, grantId: string, clientId: string) {
  const [grant] = await db.select().from(agentGrants).where(eq(agentGrants.id, grantId)).limit(1);
  if (!grant || grant.revokedAt || !safeEqual(grant.clientId, clientId)) return null;
  return grant;
}

// --- /api/oauth/token ------------------------------------------------------

export async function exchangeAuthorizationCode(
  db: Db,
  input: { clientId: string; code: string; redirectUri: string; codeVerifier: string },
  now: Date = new Date()
): Promise<TokenSuccess | TokenFailure> {
  const invalid: TokenFailure = { ok: false, error: "invalid_grant", description: "Neplatný nebo použitý kód." };

  const claimed = await claimSingleUse(db, input.code, "code", now);
  if (!claimed || claimed.expiresAt.getTime() <= now.getTime()) return invalid;

  const grant = await activeGrant(db, claimed.grantId, input.clientId);
  if (!grant) return invalid;
  if (claimed.redirectUri !== input.redirectUri) return invalid;
  if (!claimed.codeChallenge || !verifyPkce(input.codeVerifier, claimed.codeChallenge)) {
    return { ok: false, error: "invalid_grant", description: "PKCE ověření selhalo." };
  }

  return issueTokenPair(db, grant.id, grant.scope, now);
}

export async function exchangeRefreshToken(
  db: Db,
  input: { clientId: string; refreshToken: string },
  now: Date = new Date()
): Promise<TokenSuccess | TokenFailure> {
  const invalid: TokenFailure = { ok: false, error: "invalid_grant", description: "Neplatný refresh token." };

  const claimed = await claimSingleUse(db, input.refreshToken, "refresh", now);
  if (!claimed || claimed.expiresAt.getTime() <= now.getTime()) return invalid;

  const grant = await activeGrant(db, claimed.grantId, input.clientId);
  if (!grant) return invalid;

  return issueTokenPair(db, grant.id, grant.scope, now);
}

/**
 * RFC 7009 — odvolání jakéhokoli tokenu odvolá celý grant (asistent se musí
 * znovu připojit). S clientId jen grant TOHO klienta: ChatGPT neodpojí Claude
 * a naopak (cizí token = tichý úspěch, RFC 7009 §2.2).
 */
export async function revokeByToken(db: Db, token: string, clientId?: string, now: Date = new Date()): Promise<void> {
  const [row] = await db
    .select({ grantId: agentTokens.grantId, clientId: agentGrants.clientId })
    .from(agentTokens)
    .innerJoin(agentGrants, eq(agentTokens.grantId, agentGrants.id))
    .where(eq(agentTokens.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return;
  if (clientId !== undefined && !safeEqual(row.clientId, clientId)) return;
  await revokeGrant(db, row.grantId, "revoked_by_client", now);
}

// --- /api/mcp: access token → identita --------------------------------------

export type AgentSession = {
  grantId: string;
  scope: string;
  /** Klient (asistent), kterému byl souhlas udělen — určuje kanál mcp:chatgpt / mcp:claude. */
  client: AgentClient;
  ctx: NonNullable<AuthContext>;
};

/**
 * Ověří access token a sestaví AuthContext uživatele, který souhlas udělil —
 * při KAŽDÉM volání znovu z DB: odebraná role, vyřazení z allowlistu nebo
 * odvolaný souhlas platí okamžitě, ne až po vypršení tokenu.
 */
export async function resolveAccessToken(
  db: Db,
  config: AgentConfig,
  token: string,
  now: Date = new Date()
): Promise<AgentSession | null> {
  const [row] = await db
    .select({ grant: agentGrants, expiresAt: agentTokens.expiresAt })
    .from(agentTokens)
    .innerJoin(agentGrants, eq(agentTokens.grantId, agentGrants.id))
    .where(and(eq(agentTokens.tokenHash, hashToken(token)), eq(agentTokens.kind, "access")))
    .limit(1);
  if (!row || row.expiresAt.getTime() <= now.getTime() || row.grant.revokedAt) return null;

  const { grant } = row;
  // Výměna client_id klienta ve Vercelu (MCP_OAUTH_CLIENT_ID, MCP_CLAUDE_OAUTH_CLIENT_ID)
  // = okamžité odpojení všech dosavadních souhlasů TOHO klienta.
  const client = findClient(config, grant.clientId);
  if (!client || !isAgentUserAllowed(config, grant.userId)) return null;

  const roleRows = await db
    .select({ systemRole: userRoles.systemRole })
    .from(userRoles)
    .where(eq(userRoles.userId, grant.userId));
  const grantedRoles = roleRows.map((r) => r.systemRole as SystemRole);
  const role = grant.systemRole as SystemRole;
  if (!AGENT_ROLES.includes(role) || !grantedRoles.includes(role)) return null;

  const [profile] = await db
    .select({ name: userProfiles.name, email: userProfiles.email })
    .from(userProfiles)
    .where(eq(userProfiles.userId, grant.userId))
    .limit(1);

  await db.update(agentGrants).set({ lastUsedAt: now }).where(eq(agentGrants.id, grant.id));

  return {
    grantId: grant.id,
    scope: grant.scope,
    client,
    ctx: {
      userId: grant.userId,
      systemRole: role,
      grantedRoles,
      roleSelectionRequired: false,
      name: `${profile?.name ?? profile?.email ?? "Neznámý uživatel"}${agentNameSuffix(client)}`,
      email: profile?.email ?? "",
    },
  };
}

// --- Přehled pro uživatele (/rizeni-firmy/asistent) ------------------------

export type GrantSummary = {
  id: string;
  clientId: string;
  systemRole: string;
  scope: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export async function listActiveGrants(db: Db, userId: string): Promise<GrantSummary[]> {
  return db
    .select({
      id: agentGrants.id,
      clientId: agentGrants.clientId,
      systemRole: agentGrants.systemRole,
      scope: agentGrants.scope,
      createdAt: agentGrants.createdAt,
      lastUsedAt: agentGrants.lastUsedAt,
    })
    .from(agentGrants)
    .where(and(eq(agentGrants.userId, userId), isNull(agentGrants.revokedAt)))
    .orderBy(desc(agentGrants.createdAt));
}

/** Uživatel smí odvolat jen SVŮJ souhlas (podmínka userId přímo v UPDATE). */
export async function revokeOwnGrant(db: Db, userId: string, grantId: string, now: Date = new Date()): Promise<boolean> {
  const rows = await db
    .update(agentGrants)
    .set({ revokedAt: now, revokedReason: "revoked_by_user" })
    .where(and(eq(agentGrants.id, grantId), eq(agentGrants.userId, userId), isNull(agentGrants.revokedAt)))
    .returning({ id: agentGrants.id });
  return rows.length > 0;
}

export type AuditSummary = {
  id: string;
  tool: string;
  isWrite: boolean;
  status: string;
  error: string | null;
  createdAt: Date;
};

export async function listRecentAudit(
  db: Db,
  userId: string,
  days = 7,
  now: Date = new Date(),
  limit = 50
): Promise<AuditSummary[]> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return db
    .select({
      id: agentAuditLog.id,
      tool: agentAuditLog.tool,
      isWrite: agentAuditLog.isWrite,
      status: agentAuditLog.status,
      error: agentAuditLog.error,
      createdAt: agentAuditLog.createdAt,
    })
    .from(agentAuditLog)
    .where(and(eq(agentAuditLog.userId, userId), gt(agentAuditLog.createdAt, since)))
    .orderBy(desc(agentAuditLog.createdAt))
    .limit(limit);
}
