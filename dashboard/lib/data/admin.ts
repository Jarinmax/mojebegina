// Security Phase 1.1B — autorizovaná datová vrstva Begina Adminu.
// Stejný princip jako lib/data/dashboard.ts pro zákazníky: kontrola a
// dotaz jsou neoddělitelné, DB klient se mimo lib/data/* nesmí importovat.
// Na rozdíl od zákaznických funkcí organizationId nikdy nepochází z "moje
// organizace" (admin žádnou nemá) — dostává ho jako explicitní parametr,
// typicky z URL segmentu admin stránky.
import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { organizations, organizationMemberships } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { requireAdmin } from "./adminAuth";
import type { AuthContext } from "./types";

export async function requireAdminContext(): Promise<NonNullable<AuthContext>> {
  const ctx = await getAuthContext();
  return requireAdmin(ctx);
}

export type OrganizationSummary = {
  id: string;
  name: string;
  ico: string;
  status: string | null;
  createdAt: Date;
};

export async function listOrganizations(): Promise<OrganizationSummary[]> {
  await requireAdminContext();

  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      ico: organizations.ico,
      status: organizations.status,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .orderBy(asc(organizations.name));
}

export type OrganizationMember = {
  userId: string;
  role: "owner" | "member";
  createdAt: Date;
};

export type OrganizationDetail = OrganizationSummary & {
  registeredAddress: string;
  members: OrganizationMember[];
};

export async function getOrganizationDetail(
  organizationId: string
): Promise<OrganizationDetail | null> {
  await requireAdminContext();

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      ico: organizations.ico,
      registeredAddress: organizations.registeredAddress,
      status: organizations.status,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org) {
    return null;
  }

  const members = await db
    .select({
      userId: organizationMemberships.userId,
      role: organizationMemberships.role,
      createdAt: organizationMemberships.createdAt,
    })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.organizationId, organizationId))
    .orderBy(asc(organizationMemberships.createdAt));

  return {
    ...org,
    members: members.map((m) => ({ ...m, role: m.role as OrganizationMember["role"] })),
  };
}
