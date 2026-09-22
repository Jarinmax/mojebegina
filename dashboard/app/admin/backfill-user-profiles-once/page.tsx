import BackfillButton from "./BackfillButton";

// Security Phase 14 — JEDNORÁZOVÝ migrační backfill user_profiles pro
// uživatele založené před Fází 14. Záměrně NENÍ v žádné navigaci (ani
// v AdminHeader) — jen přímá URL pro ADMINA, gatovaná stejně jako celý
// /admin (viz app/admin/layout.tsx) plus vlastní kontrolou v actions.ts.
// Stránka s tlačítkem místo holé URL/route handleru — jde spustit
// klepnutím i bez počítače/konzole (na mobilu), a technicky zůstává
// POST (server action), takže nejde o mutující GET endpoint.
// AŽ SE NA PRODUCTION JEDNOU POTVRZENĚ SPUSTÍ ÚSPĚŠNĚ, TENHLE ADRESÁŘ SE
// MÁ SMAZAT — není to trvalá funkce appky.
export const dynamic = "force-dynamic";

export default function BackfillUserProfilesOncePage() {
  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-medium text-begina-primary-900 mb-1">
        Jednorázový backfill user_profiles
      </h1>
      <p className="text-sm text-neutral-500 mb-4">
        Fáze 14 — doplní lokální profily (jméno/e-mail) pro uživatele, kteří
        existují v organization_memberships (a company_nodes, pokud už na
        tomhle prostředí existuje) z doby před zavedením user_profiles.
        Bezpečné spustit i vícekrát.
      </p>
      <BackfillButton />
    </div>
  );
}
