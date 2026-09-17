// Security Phase 2.2 — reálné odvození AuthContext ze session.
// ZATÍM NEPOUŽITO — žádná stránka ani route handler tohle nevolá. Připraveno
// pro Fázi 2.3, kdy se dashboard přepne na databázi.
import "server-only";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { userRoles } from "@/lib/db/schema";
import type { AuthContext, SystemRole } from "./types";

const DEFAULT_SYSTEM_ROLE: SystemRole = "CUSTOMER";

// Identita se vždy odvozuje ze server-side session (httpOnly cookie
// ověřená přes Neon Auth) — nikdy z ničeho, co pošle klient.
export async function getAuthContext(): Promise<AuthContext> {
  const { data: session } = await auth.getSession();
  if (!session?.user) return null;

  const [row] = await db
    .select({ systemRole: userRoles.systemRole })
    .from(userRoles)
    .where(eq(userRoles.userId, session.user.id))
    .limit(1);

  return {
    userId: session.user.id,
    // Chybí-li řádek, uživatel je CUSTOMER — bezpečný default, nikdy
    // tichá eskalace na vyšší roli.
    systemRole: (row?.systemRole as SystemRole | undefined) ?? DEFAULT_SYSTEM_ROLE,
  };
}
