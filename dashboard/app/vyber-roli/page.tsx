import { redirect } from "next/navigation";
import Image from "next/image";
import logoMark from "@/public/logo-begina-mark.png";
import { getAuthContext } from "@/lib/data/authContext";
import { defaultPathForRole, ROLE_LABELS } from "@/lib/data/roles";
import AdminSignOutButton from "@/components/admin/AdminSignOutButton";
import { setActiveRoleAction } from "./actions";

// Security Phase 9 — jediná stránka, která uživateli s víc rolemi nabídne
// volbu aktivní role. Dva vstupní důvody:
//   1. automaticky, když ctx.roleSelectionRequired (víc rolí, žádná platná
//      cookie) — všechny 4 chráněné vstupní body (app/page.tsx přes
//      requireCustomerContext, app/admin, app/executive, app/rizeni-firmy)
//      sem přesměrují dřív, než by cokoli udělaly s neurčenou aktivní rolí;
//   2. ručně přes "Přepnout roli" (?switch=1) i když už má platnou aktivní
//      roli — proto se stránka nechová jako čistý "guard", co by uživatele
//      s už vyřešenou rolí vždycky poslal pryč.
// Uživatel s jen jednou rolí sem nikdy nemá důvod přijít, a i kdyby URL
// zadal ručně, níž ho to hned pošle na jeho jedinou roli — žádný zbytečný
// výběr (zadání, bod 2).
export const dynamic = "force-dynamic";

export default async function VyberRoliPage(props: PageProps<"/vyber-roli">) {
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect("/login");
  }

  if (ctx.grantedRoles.length <= 1) {
    redirect(defaultPathForRole(ctx.systemRole));
  }

  const searchParams = await props.searchParams;
  const isExplicitSwitch = searchParams?.switch === "1";
  if (!isExplicitSwitch && !ctx.roleSelectionRequired) {
    redirect(defaultPathForRole(ctx.systemRole));
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center px-4">
      <Image src={logoMark} alt="Begina" className="h-9 w-auto mb-6" priority />

      <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-xl p-5">
        <h1 className="text-lg font-medium text-begina-primary-900 mb-1">Zvolte roli</h1>
        <p className="text-sm text-neutral-500 mb-5">
          Váš účet má přístup k víc částem Moje Begina. V jaké roli chcete pokračovat?
        </p>

        <div className="flex flex-col gap-2">
          {ctx.grantedRoles.map((role) => (
            <form key={role} action={setActiveRoleAction.bind(null, role)}>
              <button
                type="submit"
                className="w-full text-left text-sm font-medium text-begina-primary-900 bg-neutral-50 hover:bg-begina-primary-50 border border-neutral-200 rounded-lg px-4 py-3 transition-colors"
              >
                {ROLE_LABELS[role]}
              </button>
            </form>
          ))}
        </div>

        <div className="mt-5 text-center">
          <AdminSignOutButton />
        </div>
      </div>
    </div>
  );
}
