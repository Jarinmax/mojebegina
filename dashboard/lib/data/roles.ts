// Security Phase 9 — jediný zdroj pravdy pro "jak se role jmenuje v UI" a
// "kam aktivní role vede po loginu/přepnutí". Čisté, bez I/O — používá se z
// app/vyber-roli (výběr/přepnutí role) i z app/page.tsx (implicitně, přes
// stejný princip, který tam už existoval per-role zvlášť).
import type { SystemRole } from "./types";

export const ROLE_LABELS: Record<SystemRole, string> = {
  CUSTOMER: "Zákaznický účet",
  EMPLOYEE: "Zaměstnanecký přístup",
  EXECUTIVE: "Vedení Beginy",
  ADMIN: "Administrace",
};

export function defaultPathForRole(role: SystemRole): string {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "EXECUTIVE":
      return "/executive";
    case "CUSTOMER":
    case "EMPLOYEE":
      return "/";
  }
}
