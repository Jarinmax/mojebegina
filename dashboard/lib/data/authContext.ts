// Security Phase 2.2 — reálné odvození AuthContext ze session. Používá se
// ze všech chráněných vstupních bodů (app/page.tsx, app/admin/layout.tsx,
// app/executive/layout.tsx, app/rizeni-firmy/layout.tsx, lib/data/admin.ts).
//
// Security Phase 9 — uživatel může mít víc řádků v user_roles (víc rolí
// najednou). Tahle funkce načte VŠECHNY (grantedRoles) a pak čistou funkcí
// resolveActiveRole (lib/data/activeRole.ts, bez I/O, testovaná zvlášť)
// určí, která je AKTIVNÍ pro tenhle request — cookie je jen návrh, vždy
// ověřený proti grantedRoles čerstvě načteným z DB. Sama nikde
// nepřesměrovává (na rozdíl od requireCustomerContext) — je to čistě
// čtení identity; kdo z `ctx.roleSelectionRequired` udělá redirect na výběr
// role, je na volajícím (viz app/vyber-roli a všechny 4 gatované vstupní
// body).
import "server-only";
import { cookies } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { userActivations, userRoles } from "@/lib/db/schema";
import { ACTIVE_ROLE_COOKIE, resolveActiveRole } from "./activeRole";
import { syncUserProfileFromSession } from "./userProfiles";
import type { AuthContext, SystemRole } from "./types";

const DEFAULT_SYSTEM_ROLE: SystemRole = "CUSTOMER";

// Security Phase 11 — jediné bezpečné místo, kde appka smí zaznamenat
// "uživatel aktivoval účet": tady, protože tady (a jen tady) máme ověřenou
// server-side session pro daný userId. `/nastavit-heslo` sám o sobě tohle
// zaznamenat nemůže — better-auth `resetPassword` vrací jen
// `{ status: true }`, žádné userId, a appka se úmyslně nespoléhá na čtení
// interních neon_auth tabulek (viz komentář u schema.ts). Podmínka
// `activatedAt IS NULL` dělá z UPDATE trvalý no-op po prvním úspěchu — u
// uživatele bez řádku (ADMIN, kterého tahle tabulka vůbec netýká) i po
// aktivaci nezasáhne žádný řádek. Chyba se nikdy nesmí projevit navenek —
// tohle je vedlejší účinek, ne podmínka pro přihlášení.
async function markActivatedIfNeeded(userId: string): Promise<void> {
  try {
    await db
      .update(userActivations)
      .set({ activatedAt: new Date() })
      .where(and(eq(userActivations.userId, userId), isNull(userActivations.activatedAt)));
  } catch {
    // Bookkeeping vedlejší účinek — selhání nesmí shodit odvození identity.
  }
}

// Security Phase 14 — stejný princip jako markActivatedIfNeeded: vedlejší
// účinek, nikdy podmínka pro přihlášení. syncUserProfileFromSession sama
// dělá SELECT → porovnání → zápis jen při skutečné změně (viz
// userProfiles.ts), takže tohle při běžném requestu nezpůsobí zbytečný
// DB WRITE — jen levný lookup podle primárního klíče.
async function syncUserProfileIfNeeded(
  userId: string,
  name: string | null,
  email: string
): Promise<void> {
  try {
    await syncUserProfileFromSession(userId, name, email);
  } catch {
    // Vedlejší účinek — selhání nesmí shodit odvození identity.
  }
}

// Identita se vždy odvozuje ze server-side session (httpOnly cookie
// ověřená přes Neon Auth) — nikdy z ničeho, co pošle klient.
export async function getAuthContext(): Promise<AuthContext> {
  const { data: session } = await auth.getSession();
  if (!session?.user) return null;

  await markActivatedIfNeeded(session.user.id);
  await syncUserProfileIfNeeded(session.user.id, session.user.name ?? null, session.user.email);

  const rows = await db
    .select({ systemRole: userRoles.systemRole })
    .from(userRoles)
    .where(eq(userRoles.userId, session.user.id));

  // Chybí-li jakýkoli řádek, uživatel je CUSTOMER — bezpečný default,
  // nikdy tichá eskalace na vyšší roli.
  const grantedRoles: SystemRole[] =
    rows.length > 0 ? rows.map((row) => row.systemRole as SystemRole) : [DEFAULT_SYSTEM_ROLE];

  const cookieStore = await cookies();
  const { systemRole, roleSelectionRequired } = resolveActiveRole(
    grantedRoles,
    cookieStore.get(ACTIVE_ROLE_COOKIE)?.value
  );

  return {
    userId: session.user.id,
    systemRole,
    grantedRoles,
    roleSelectionRequired,
    // Přímo z ověřené session, žádný DB dotaz — pro aktuálně přihlášeného
    // uživatele jsou tyto hodnoty vždy pravdivé.
    name: session.user.name ?? null,
    email: session.user.email,
  };
}
