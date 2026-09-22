// Security Phase 14 — lokální adresář identity (user_profiles), náhrada za
// nespolehlivé auth.admin.listUsers({filterField: "id"}) (viz schema.ts
// komentář u user_profiles a diagnostika v konverzaci: tiše vrací prázdný
// výsledek pro existující uživatele). Neon Auth zůstává jedinou autoritou
// pro autentizaci — tahle tabulka je čistě zobrazovací/kontaktní cache,
// psaná jen v okamžicích, kdy jméno/e-mail bezpečně známe.
import "server-only";
import { eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userProfiles, organizationMemberships, companyNodes } from "@/lib/db/schema";
import { auth } from "@/lib/auth/server";
import { hasProfileChanged } from "./userProfileSync";

export type UserProfile = { name: string | null; email: string };

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const [row] = await db
    .select({ name: userProfiles.name, email: userProfiles.email })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  return row ?? null;
}

export async function getUserProfiles(
  userIds: string[]
): Promise<Map<string, UserProfile>> {
  const map = new Map<string, UserProfile>();
  if (userIds.length === 0) {
    return map;
  }

  const rows = await db
    .select({ userId: userProfiles.userId, name: userProfiles.name, email: userProfiles.email })
    .from(userProfiles)
    .where(inArray(userProfiles.userId, userIds));

  rows.forEach((row) => {
    map.set(row.userId, { name: row.name, email: row.email });
  });

  return map;
}

// Statement builder (NENÍ awaitnutý zde) — určený pro vložení jako další
// prvek do existujícího db.batch([...]) v createCustomerOrganization/
// addOrganizationMember, aby profil vznikl atomicky spolu s organizací/
// membershipem. Vždy bezpodmínečně upsertuje — volající už v tu chvíli
// jméno/e-mail spolehlivě zná (buď z právě založeného Auth účtu, nebo
// z funkčního `listUsers(filterField: "email")` lookupu), takže není co
// nejdřív číst a porovnávat.
export function upsertUserProfileStatement(userId: string, name: string | null, email: string) {
  return db
    .insert(userProfiles)
    .values({ userId, name, email })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { name, email, updatedAt: new Date() },
    });
}

// Pro volání mimo db.batch (addOrganizationMember, existující identita) —
// samostatný, best-effort zápis.
export async function upsertUserProfile(
  userId: string,
  name: string | null,
  email: string
): Promise<void> {
  await upsertUserProfileStatement(userId, name, email);
}

// Optimalizovaná cesta pro getAuthContext (běží při KAŽDÉM přihlášeném
// requestu): SELECT → čisté porovnání (hasProfileChanged) → zápis JEN při
// skutečné změně nebo chybějícím řádku. `onConflictDoUpdate` v
// upsertUserProfileStatement zůstává jako pojistka proti souběhu dvou
// requestů, co obě vyhodnotí "chybí"/"změněno" současně — atomický UPSERT
// to vyřeší bez zvláštního ošetření chyby tady.
export async function syncUserProfileFromSession(
  userId: string,
  name: string | null,
  email: string
): Promise<void> {
  const existing = await getUserProfile(userId);
  if (!hasProfileChanged(existing, { name, email })) {
    return;
  }
  await upsertUserProfileStatement(userId, name, email);
}

export type BackfillSummary = {
  authUsersScanned: number;
  candidateUserIds: number;
  upserted: number;
  notFoundInAuth: string[];
};

// Jednorázový migrační backfill — NIKDY nepoužívá
// listUsers({filterField: "id"}), jen stránkovaný výpis BEZ filtru (jiná
// cesta kódem, viz diagnostika), a lokálně si dohledá, kteří uživatelé nás
// vůbec zajímají (userId z organization_memberships + company_nodes.owner_user_id).
// Volá se výhradně z jednorázového, nikde nelinkovaného route handleru (viz
// app/admin/backfill-user-profiles-once/route.ts) — žádné trvalé tlačítko
// v ADMIN UI; ten route handler se po dokončení backfillu na Production
// smaže. Idempotentní, bezpečné spustit vícekrát.
//
// Výjimka z pravidla "kontrola a dotaz jsou neoddělitelné" (viz hlavička
// admin.ts): ADMIN gate NENÍ tady uvnitř, ale v route handleru samotném.
// Důvod: getAuthContext (authContext.ts) už sama volá syncUserProfileFromSession
// z TOHOTO souboru — import getAuthContext/requireAdminContext zpátky sem
// by vytvořil cyklickou závislost (authContext.ts → userProfiles.ts →
// authContext.ts). Funkce proto NENÍ bezpečná k volání odjinud bez
// vlastního ADMIN gate na volající straně.
export async function backfillUserProfiles(): Promise<BackfillSummary> {
  const [memberRows, ownerRows] = await Promise.all([
    db.selectDistinct({ userId: organizationMemberships.userId }).from(organizationMemberships),
    db
      .selectDistinct({ userId: companyNodes.ownerUserId })
      .from(companyNodes)
      .where(isNotNull(companyNodes.ownerUserId)),
  ]);

  const candidateIds = new Set<string>();
  memberRows.forEach((r) => candidateIds.add(r.userId));
  ownerRows.forEach((r) => {
    if (r.userId) candidateIds.add(r.userId);
  });

  const authUsersById = new Map<string, { name: string | null; email: string }>();
  const limit = 100;
  let offset = 0;
  while (true) {
    const { data, error } = await auth.admin.listUsers({ query: { limit, offset } });
    if (error || !data) {
      break;
    }
    data.users.forEach((u) => {
      authUsersById.set(u.id, { name: u.name ?? null, email: u.email });
    });
    if (data.users.length < limit) {
      break;
    }
    offset += limit;
  }

  let upserted = 0;
  const notFoundInAuth: string[] = [];
  for (const userId of candidateIds) {
    const authUser = authUsersById.get(userId);
    if (!authUser) {
      notFoundInAuth.push(userId);
      continue;
    }
    await upsertUserProfile(userId, authUser.name, authUser.email);
    upserted += 1;
  }

  return {
    authUsersScanned: authUsersById.size,
    candidateUserIds: candidateIds.size,
    upserted,
    notFoundInAuth,
  };
}
