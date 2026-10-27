// Práce 1.0 — pracovní obrazovka. Vlastní brána podle konkrétních osob
// (workTasksAuth.ts), ne jen podle role: vedoucí Viner a pracovník Blahout.
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isWorkAssignee, isWorkManager } from "@/lib/data/workTasksAuth";
import CompanyOverviewHeader from "@/components/company-overview/CompanyOverviewHeader";

export const dynamic = "force-dynamic";

export default async function PraceLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.roleSelectionRequired) redirect("/vyber-roli");
  if (!isWorkManager(ctx) && !isWorkAssignee(ctx)) redirect("/");

  return (
    <div className="min-h-screen bg-neutral-50">
      <CompanyOverviewHeader
        name={ctx.name}
        email={ctx.email}
        backHref={ctx.systemRole === "ADMIN" ? "/admin" : "/executive"}
        showRoleSwitch={ctx.grantedRoles.length > 1}
      />
      <main className="max-w-xl mx-auto px-4 py-5">{children}</main>
    </div>
  );
}
