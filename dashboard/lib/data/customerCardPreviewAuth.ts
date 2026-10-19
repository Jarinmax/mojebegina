// Úzké oprávnění customer_card_preview — náhled zákaznické karty očima
// zákazníka. NEZÁVISLÉ na roli: nestačí ADMIN, EXECUTIVE ani EMPLOYEE;
// rozhoduje jen aktivní udělení konkrétnímu user_id v user_permissions
// (udělit/odebrat: docs/nahled-zakaznika). Navíc nesmí být aktivní role
// CUSTOMER — kdo právě vystupuje jako zákazník, cizí karty neotevírá.
// Selhání čtení (např. DB bez migrace 0023) = bez oprávnění.
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userPermissions } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { AuthContext } from "./types";

export const CUSTOMER_CARD_PREVIEW = "customer_card_preview";

async function hasActiveGrant(userId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: userPermissions.id })
      .from(userPermissions)
      .where(
        and(
          eq(userPermissions.userId, userId),
          eq(userPermissions.permission, CUSTOMER_CARD_PREVIEW),
          isNull(userPermissions.revokedAt)
        )
      )
      .limit(1);
    return Boolean(row);
  } catch (error) {
    console.error("Oprávnění náhledu karty se nepodařilo ověřit", error instanceof Error ? error.name : typeof error);
    return false;
  }
}

/** Smí tento přihlášený uživatel otevřít náhled zákaznické karty? (pro tlačítko) */
export async function canPreviewCustomerCards(ctx: AuthContext): Promise<boolean> {
  if (!ctx || ctx.roleSelectionRequired || ctx.systemRole === "CUSTOMER") return false;
  return hasActiveGrant(ctx.userId);
}

/** Brána před čtením dat náhledu: bez oprávnění výjimka (stránka → 404). */
export async function requireCustomerCardPreview(): Promise<NonNullable<AuthContext>> {
  const ctx = await getAuthContext();
  if (!ctx) throw new UnauthenticatedError();
  if (!(await canPreviewCustomerCards(ctx))) throw new ForbiddenError();
  return ctx;
}
