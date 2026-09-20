import Link from "next/link";

// Security Phase 9 — viditelný přepínač role (zadání, bod 8). `?switch=1`
// říká app/vyber-roli/page.tsx, že jde o VĚDOMÉ přepnutí, ne o automatický
// výběr po loginu — bez toho by stránka uživatele s už vyřešenou aktivní
// rolí hned přesměrovala pryč (viz komentář tam). Renderuje se vůbec jen
// když `visible` je true — volající (AdminHeader/ExecutiveHeader/
// CompanyOverviewHeader/Header) to spočítá z `ctx.grantedRoles.length > 1`,
// takže uživatel s jednou rolí přepínač nikdy neuvidí.
type Props = {
  visible: boolean;
};

export default function SwitchRoleLink({ visible }: Props) {
  if (!visible) {
    return null;
  }

  return (
    <Link
      href="/vyber-roli?switch=1"
      className="text-xs font-medium text-neutral-500 hover:text-begina-primary-900"
    >
      Přepnout roli
    </Link>
  );
}
