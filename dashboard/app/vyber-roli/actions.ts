"use server";

// Security Phase 9 — nastavení aktivní role. Jediné místo v appce, které do
// ACTIVE_ROLE_COOKIE zapisuje. `role` se sem předává přes .bind() z tlačítek
// na app/vyber-roli/page.tsx (stejný vzor jako organizationId/userId v
// app/admin/organizace/[id]/actions.ts) — ale i tak se nikdy nepoužije bez
// ověření: pokud uživatel danou roli doopravdy nemá v grantedRoles, cookie
// se vůbec nenastaví a žádost skončí zpátky na výběru role.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { ACTIVE_ROLE_COOKIE } from "@/lib/data/activeRole";
import { defaultPathForRole } from "@/lib/data/roles";
import type { SystemRole } from "@/lib/data/types";

export async function setActiveRoleAction(role: SystemRole, _formData: FormData): Promise<void> {
  void _formData;

  const ctx = await getAuthContext();
  if (!ctx || !ctx.grantedRoles.includes(role)) {
    // Podvržený/neplatný požadavek — žádná cookie se nenastaví, uživatel
    // se vrátí na výběr se svými skutečnými rolemi.
    redirect("/vyber-roli");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dní — jen UI preference, ne bezpečnostní token; server ji stejně ověřuje vždy znovu proti grantedRoles.
  });

  redirect(defaultPathForRole(role));
}
