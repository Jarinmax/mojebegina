// Security Phase 8 — vstupní bod pro "Řízení firmy". Na rozdíl od
// app/admin/layout.tsx a app/executive/layout.tsx (každý striktně jen pro
// jednu roli) tahle sekce úmyslně povoluje OBĚ role vedení najednou —
// isAdminOrExecutive je pro ni určený sdílený predikát, isAdmin/isExecutive
// se tu nepoužívají, aby nedošlo k omylu a nezúžení jen na jednu roli.
// /admin a /executive zůstávají beze změny přísně oddělené.
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isAdminOrExecutive } from "@/lib/data/adminAuth";
import CompanyOverviewHeader from "@/components/company-overview/CompanyOverviewHeader";

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
  if (!isAdminOrExecutive(ctx)) {
    redirect("/");
  }

  const backHref = ctx.systemRole === "ADMIN" ? "/admin" : "/executive";

  return (
    <div className="min-h-screen bg-neutral-50">
      <CompanyOverviewHeader name={ctx.name} email={ctx.email} backHref={backHref} />
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
