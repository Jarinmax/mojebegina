// Security Phase 2.2 — sdílené typy autorizační vrstvy.

export type SystemRole = "CUSTOMER" | "EMPLOYEE" | "EXECUTIVE" | "ADMIN";

export type OrgRole = "owner" | "member";

// Identita odvozená ze SERVER-SIDE session (auth.getSession()) — nikdy
// z parametrů, které pošle klient. `null` = nepřihlášen.
export type AuthContext = {
  userId: string;
  systemRole: SystemRole;
} | null;

export type Membership = {
  role: OrgRole;
};

export type Action = "read" | "write";
