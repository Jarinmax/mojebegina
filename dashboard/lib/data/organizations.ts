// Security Phase 2.2 — ukázka autorizované datové funkce nad Drizzle.
// ZATÍM NEPOUŽITO. Ukazuje vzor, kterým se v Fázi 2.3 budou psát všechny
// dotazy na zákaznická data: kontrola a dotaz nejdou rozdělit, session je
// povinný první parametr, DB klient se mimo lib/data/* nesmí importovat.
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { organizationMemberships } from "@/lib/db/schema";
import { requireOrgAccess } from "./authz";
import type { Action, AuthContext, Membership } from "./types";

async function getMembershipFromDb(
  userId: string,
  organizationId: string
): Promise<Membership | null> {
  const [row] = await db
    .select({ role: organizationMemberships.role })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.organizationId, organizationId)
      )
    )
    .limit(1);

  return row ? { role: row.role as Membership["role"] } : null;
}

export async function assertOrgAccess(
  ctx: AuthContext,
  organizationId: string,
  action: Action = "read"
) {
  return requireOrgAccess(ctx, organizationId, action, getMembershipFromDb);
}
