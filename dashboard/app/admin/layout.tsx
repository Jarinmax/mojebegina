// Security Phase 1.1B — vstupní bod pro celý /admin. Jediné místo, kde se
// kontroluje přístup (redirect, ne throw — CUSTOMER/EMPLOYEE/EXECUTIVE má
// jen tiše skončit zpátky na svém dashboardu, ne vidět chybovou stránku).
// lib/data/admin.ts si navíc při každém dotazu ověřuje ADMIN znovu
// (requireAdminContext) — tenhle guard je první vrstva, ne jediná.
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isAdmin } from "@/lib/data/adminAuth";
import AdminHeader from "@/components/admin/AdminHeader";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect("/login");
  }
  // Security Phase 9 — uživatel s víc rolemi a bez platné volby aktivní
  // role musí nejdřív zvolit (viz ctx.roleSelectionRequired), dřív než se
  // ctx.systemRole vůbec použije v isAdmin() níže.
  if (ctx.roleSelectionRequired) {
    redirect("/vyber-roli");
  }
  if (!isAdmin(ctx)) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader name={ctx.name} email={ctx.email} showRoleSwitch={ctx.grantedRoles.length > 1} />
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
