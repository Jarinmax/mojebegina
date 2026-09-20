// Security Phase 9 — čistá logika výběru aktivní role. Žádné I/O (žádná
// DB, žádné cookies() volání) — stejný vzor jako adminAuth.ts/authz.ts:
// testovatelné proti syntetickým datům, autContext.ts (které DB a cookie
// číst musí) je jediné místo, které tuhle funkci skutečně volá s reálnými
// hodnotami.
import type { SystemRole } from "./types";

export const ACTIVE_ROLE_COOKIE = "active_role";

const KNOWN_SYSTEM_ROLES: readonly SystemRole[] = ["CUSTOMER", "EMPLOYEE", "EXECUTIVE", "ADMIN"];

export function isSystemRole(value: string | undefined | null): value is SystemRole {
  return !!value && (KNOWN_SYSTEM_ROLES as readonly string[]).includes(value);
}

export type ResolvedActiveRole = {
  systemRole: SystemRole;
  roleSelectionRequired: boolean;
};

// KRITICKÝ princip (viz zadání Fáze 9, bod 4): `cookieValue` je jen NÁVRH
// od klienta, nikdy zdroj pravdy. Aktivní role smí být vždy jen role, kterou
// uživatel doopravdy má (v `grantedRoles`, čerstvě z DB) — podvržená,
// neznámá nebo mezitím odebraná hodnota v cookie se tiše ignoruje a spadne
// se na bezpečný default, nikdy na chybu ani na tichou eskalaci.
export function resolveActiveRole(
  grantedRoles: SystemRole[],
  cookieValue: string | undefined
): ResolvedActiveRole {
  if (grantedRoles.length === 0) {
    throw new Error("resolveActiveRole: grantedRoles nesmí být prázdné pole");
  }

  // Přesně jedna role = přesně dnešní chování, žádný výběr se nikdy
  // nenabízí ani nevyžaduje (viz zadání, bod 2).
  if (grantedRoles.length === 1) {
    return { systemRole: grantedRoles[0], roleSelectionRequired: false };
  }

  if (isSystemRole(cookieValue) && grantedRoles.includes(cookieValue)) {
    return { systemRole: cookieValue, roleSelectionRequired: false };
  }

  // Víc rolí, ale cookie chybí/je neplatná/obsahuje mezitím odebranou roli
  // — nutný výběr. systemRole je jen bezpečný "prozatímní" odhad (vždy
  // reálně přidělená role), volající (viz app/vyber-roli, layouty) na
  // `roleSelectionRequired` musí zareagovat přesměrováním na výběr dřív,
  // než se `systemRole` použije k čemukoli.
  return { systemRole: grantedRoles[0], roleSelectionRequired: true };
}
