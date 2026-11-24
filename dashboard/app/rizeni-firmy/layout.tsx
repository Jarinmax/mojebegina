// Security Phase 8 — vstupní bod pro "Řízení firmy". Na rozdíl od
// app/admin/layout.tsx a app/executive/layout.tsx (každý striktně jen pro
// jednu roli) tahle sekce úmyslně povoluje OBĚ role vedení najednou —
// isAdminOrExecutive je pro ni určený sdílený predikát, isAdmin/isExecutive
// se tu nepoužívají, aby nedošlo k omylu a nezúžení jen na jednu roli.
// /admin a /executive zůstávají beze změny přísně oddělené.
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { PATH_HEADER } from "@/lib/site/hosts";
import { isSalesOnly, salesOnlyPathAllowed, SALES_ONLY_HOME } from "@/lib/data/salesOnlyAuth";
import { getAuthContext } from "@/lib/data/authContext";
import { isAdminOrExecutive } from "@/lib/data/adminAuth";
import CompanyOverviewHeader from "@/components/company-overview/CompanyOverviewHeader";
import TeamOptOut from "@/components/TeamOptOut";

export const dynamic = "force-dynamic";

export default async function CompanyOverviewLayout({
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
  if (!isAdminOrExecutive(ctx)) {
    redirect("/");
  }
  // 22. 11. 2026 (Lucie): obchodník (Blahout) jen Obchod / CRM.
  if (isSalesOnly(ctx)) {
    const path = (await headers()).get(PATH_HEADER) ?? "";
    if (!salesOnlyPathAllowed(path)) redirect(SALES_ONLY_HOME);
  }

  const backHref = isSalesOnly(ctx) ? "/prace" : ctx.systemRole === "ADMIN" ? "/admin" : "/executive";

  return (
    <div className="min-h-screen bg-neutral-50">
      <TeamOptOut />
      <CompanyOverviewHeader
        name={ctx.name}
        email={ctx.email}
        backHref={backHref}
        showRoleSwitch={ctx.grantedRoles.length > 1}
      />
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
