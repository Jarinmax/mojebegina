// Security Phase 7 (Executive 1.0) — vstupní bod pro celý /executive,
// strukturálně stejný jako app/admin/layout.tsx. `isExecutive` je striktní
// — ADMIN sem nespadá (má vlastní /admin), takže i ADMIN účet by tu byl
// přesměrován na "/". lib/data/admin.ts si navíc při každém čtecím dotazu
// ověřuje ADMIN-nebo-EXECUTIVE znovu (requireAdminOrExecutiveContext) —
// tenhle guard je první vrstva, ne jediná.
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isExecutive } from "@/lib/data/adminAuth";
import ExecutiveHeader from "@/components/executive/ExecutiveHeader";

export const dynamic = "force-dynamic";

export default async function ExecutiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect("/login");
  }
  // Security Phase 9 — viz app/admin/layout.tsx, stejný princip.
  if (ctx.roleSelectionRequired) {
    redirect("/vyber-roli");
  }
  if (!isExecutive(ctx)) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <ExecutiveHeader
        name={ctx.name}
        email={ctx.email}
        showRoleSwitch={ctx.grantedRoles.length > 1}
      />
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
