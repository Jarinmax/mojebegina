// Security Phase 2.2 — sdílené typy autorizační vrstvy.

export type SystemRole = "CUSTOMER" | "EMPLOYEE" | "EXECUTIVE" | "ADMIN";

export type OrgRole = "owner" | "member";

// Identita odvozená ze SERVER-SIDE session (auth.getSession()) — nikdy
// z parametrů, které pošle klient. `null` = nepřihlášen. `name`/`email`
// pocházejí přímo z ověřené Neon Auth session (ne z DB dotazu) — pro
// aktuálně přihlášeného uživatele jsou vždy pravdivé.
//
// Security Phase 9 — jeden uživatel může mít víc rolí najednou (víc řádků
// v user_roles, viz lib/db/schema.ts). `grantedRoles` je úplný, ze session
// vždy čerstvě z DB ověřený seznam rolí, které uživatel doopravdy má.
// `systemRole` zůstává jedna konkrétní hodnota — AKTIVNÍ role pro TENHLE
// request (viz lib/data/activeRole.ts) — takže každá dosavadní kontrola
// tvaru `ctx.systemRole === "ADMIN"` napříč celou appkou funguje beze
// změny, jen teď čte "aktivní", ne "jedinou možnou" roli.
// `roleSelectionRequired` je true, jen když má uživatel víc než jednu roli
// a request nemá platnou (cookie) volbu aktivní role — v tom případě
// `systemRole` je jen nejlepší bezpečný odhad (grantedRoles[0]), NIKDY se
// nesmí použít k autorizaci bez zkontrolování týhle vlajky nejdřív.
export type AuthContext = {
  userId: string;
  systemRole: SystemRole;
  grantedRoles: SystemRole[];
  roleSelectionRequired: boolean;
  name: string | null;
  email: string;
} | null;

export type Membership = {
  role: OrgRole;
};

export type Action = "read" | "write";
