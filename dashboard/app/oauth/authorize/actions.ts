"use server";

// GPT/MCP pilot — rozhodnutí na souhlasové stránce. Skrytá pole formuláře
// se NIKDY nepovažují za ověřená: dotaz od asistenta (client_id, redirect_uri,
// PKCE…) se tu kontroluje znovu stejnou funkcí jako na stránce, identita se
// bere ze session a role musí být mezi rolemi účtu.
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { getAuthContext } from "@/lib/data/authContext";
import type { SystemRole } from "@/lib/data/types";
import { agentConfig } from "@/lib/agent/config";
import {
  AUTHORIZE_PATH,
  agentEligibleRoles,
  authorizeRedirect,
  checkAuthorizeParams,
  isAgentUserAllowed,
  paramsFromQuery,
} from "@/lib/agent/oauthCore";
import { issueAuthorizationCode } from "@/lib/agent/oauthStore";

export async function decideAuthorizationAction(formData: FormData): Promise<void> {
  const config = agentConfig();
  if (!config) throw new Error("Přístup asistenta není zapnutý.");

  const query = String(formData.get("query") ?? "");
  const check = checkAuthorizeParams(config, paramsFromQuery(query));
  if (!check.ok) {
    if (!check.redirectable) throw new Error(check.message);
    redirect(authorizeRedirect(config, check.redirectUri, check.state, { error: check.error, error_description: check.description }));
  }
  const { redirectUri, state } = check.value;

  const ctx = await getAuthContext();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(`${AUTHORIZE_PATH}?${query}`)}`);

  const deny = () =>
    redirect(authorizeRedirect(config, redirectUri, state, { error: "access_denied", error_description: "Uživatel přístup nepovolil." }));

  if (formData.get("decision") !== "allow") deny();

  const eligible = agentEligibleRoles(ctx.grantedRoles);
  const role = String(formData.get("role") ?? "") as SystemRole;
  if (!isAgentUserAllowed(config, ctx.userId) || !eligible.includes(role)) deny();

  const code = await issueAuthorizationCode(db, {
    userId: ctx.userId,
    systemRole: role,
    clientId: check.value.clientId,
    write: config.writeEnabled && check.value.write && formData.get("write") === "on",
    redirectUri,
    codeChallenge: check.value.codeChallenge,
  });

  redirect(authorizeRedirect(config, redirectUri, state, { code }));
}
