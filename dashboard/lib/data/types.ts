// Security Phase 2.2 — sdílené typy autorizační vrstvy.

export type SystemRole = "CUSTOMER" | "EMPLOYEE" | "EXECUTIVE" | "ADMIN";

export type OrgRole = "owner" | "member";

// Identita odvozená ze SERVER-SIDE session (auth.getSession()) — nikdy
// z parametrů, které pošle klient. `null` = nepřihlášen. `name`/`email`
// pocházejí přímo z ověřené Neon Auth session (ne z DB dotazu) — pro
// aktuálně přihlášeného uživatele jsou vždy pravdivé.
export type AuthContext = {
  userId: string;
  systemRole: SystemRole;
  name: string | null;
  email: string;
} | null;

export type Membership = {
  role: OrgRole;
};

export type Action = "read" | "write";
