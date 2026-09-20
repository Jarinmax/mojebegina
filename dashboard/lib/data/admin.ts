// Security Phase 1.1B — autorizovaná datová vrstva Begina Adminu.
// Stejný princip jako lib/data/dashboard.ts pro zákazníky: kontrola a
// dotaz jsou neoddělitelné, DB klient se mimo lib/data/* nesmí importovat.
// Na rozdíl od zákaznických funkcí organizationId nikdy nepochází z "moje
// organizace" (admin žádnou nemá) — dostává ho jako explicitní parametr,
// typicky z URL segmentu admin stránky.
import "server-only";
import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { organizations, organizationMemberships } from "@/lib/db/schema";
import { auth } from "@/lib/auth/server";
import { getAuthContext } from "./authContext";
import { requireAdmin } from "./adminAuth";
import { validateCreateCustomerInput, type CreateCustomerInput } from "./createCustomerValidation";
import type { AuthContext } from "./types";

export async function requireAdminContext(): Promise<NonNullable<AuthContext>> {
  const ctx = await getAuthContext();
  return requireAdmin(ctx);
}

export type OrganizationSummary = {
  id: string;
  name: string;
  ico: string;
  status: string | null;
  createdAt: Date;
};

export async function listOrganizations(): Promise<OrganizationSummary[]> {
  await requireAdminContext();

  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      ico: organizations.ico,
      status: organizations.status,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .orderBy(asc(organizations.name));
}

export type OrganizationMember = {
  userId: string;
  role: "owner" | "member";
  createdAt: Date;
};

export type OrganizationDetail = OrganizationSummary & {
  registeredAddress: string;
  members: OrganizationMember[];
};

export async function getOrganizationDetail(
  organizationId: string
): Promise<OrganizationDetail | null> {
  await requireAdminContext();

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      ico: organizations.ico,
      registeredAddress: organizations.registeredAddress,
      status: organizations.status,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org) {
    return null;
  }

  const members = await db
    .select({
      userId: organizationMemberships.userId,
      role: organizationMemberships.role,
      createdAt: organizationMemberships.createdAt,
    })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.organizationId, organizationId))
    .orderBy(asc(organizationMemberships.createdAt));

  return {
    ...org,
    members: members.map((m) => ({ ...m, role: m.role as OrganizationMember["role"] })),
  };
}

// Security Phase 5 — založení nového zákazníka z Begina Adminu.
// Cesta A (ověřeno diagnostikou před implementací): Neon Auth Better Auth
// admin plugin, `auth.admin.createUser` bez `password` — server sám
// nevytváří (a tedy nezná) heslo zákazníka. Aktivace přes stejný
// `reset-password` mechanismus jako /nastavit-heslo (Fáze 1.1A): pokud
// uživatel nemá credential účet, `resetPassword` ho při prvním použití
// tokenu rovnou založí — appka mezi "první nastavení" a "reset" nijak
// nerozlišuje.
//
// Validace vstupu je v samostatném createCustomerValidation.ts (bez
// "server-only"), aby šla testovat stejně jako requireAdmin/
// requireOrgAccess — tenhle soubor testovat nejde (Vitest neumí
// "server-only" resolvnout, na rozdíl od Next.js bundleru).

export type CreateCustomerResult =
  | { ok: true; organizationId: string; emailSent: boolean }
  | { ok: false; error: string };

async function getAppOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "moje.begina.cz";
  return `${proto}://${host}`;
}

export async function createCustomerOrganization(
  rawInput: CreateCustomerInput
): Promise<CreateCustomerResult> {
  // Stejná kontrola jako u každého jiného admin dotazu — jen
  // systemRole === "ADMIN" smí tuhle akci vůbec spustit.
  await requireAdminContext();

  const validated = validateCreateCustomerInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const input = validated.value;

  // Krok 1: Neon Auth uživatel BEZ hesla. ADMIN heslo zákazníka nikdy
  // nezadává ani nezná — better-auth admin plugin credential účet vůbec
  // nezaloží, dokud si zákazník sám nenastaví heslo přes /nastavit-heslo.
  const { data: created, error: createUserError } = await auth.admin.createUser({
    email: input.contactEmail,
    name: input.contactName,
  });

  if (createUserError || !created) {
    if (createUserError?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
      return { ok: false, error: "Uživatel s tímto e-mailem už v systému existuje." };
    }
    return { ok: false, error: "Nepodařilo se založit uživatelský účet. Zkuste to prosím znovu." };
  }

  const authUserId = created.user.id;

  // Krok 2: organizace + membership v jediném atomickém HTTP batchi —
  // neon-http driver nepodporuje db.transaction (viz
  // drizzle-orm/neon-http/session: "No transactions support"), takže id
  // organizace generujeme sami předem a obě inserce pošleme přes
  // db.batch, aby buď prošly obě, nebo žádná (žádná "osiřelá" organizace
  // bez membershipu).
  const organizationId = randomUUID();
  try {
    await db.batch([
      db.insert(organizations).values({
        id: organizationId,
        name: input.name,
        ico: input.ico,
        registeredAddress: input.registeredAddress,
        status: "Zákazník Begina",
      }),
      db.insert(organizationMemberships).values({
        userId: authUserId,
        organizationId,
        role: "owner",
      }),
    ]);
  } catch (dbError) {
    // Best-effort úklid osiřelého auth uživatele — DB zápis selhal, ale
    // Neon Auth účet už existuje. Nejde o transakci napříč dvěma
    // systémy, takže tohle je kompenzační krok, ne záruka: pokud selže i
    // úklid, admin dostane e-mail v chybové hlášce a může to dohledat
    // ručně v Neon Console.
    try {
      await auth.admin.removeUser({ userId: authUserId });
    } catch {
      return {
        ok: false,
        error: `Nepodařilo se založit organizaci a automatický úklid uživatelského účtu (${input.contactEmail}) selhal — smažte ho prosím ručně v Neon Console.`,
      };
    }

    const message = String(dbError instanceof Error ? dbError.message : dbError).toLowerCase();
    if (message.includes("ico")) {
      return { ok: false, error: "Organizace s tímto IČO už existuje." };
    }
    return { ok: false, error: "Nepodařilo se založit organizaci. Zkuste to prosím znovu." };
  }

  // Krok 3: aktivační e-mail — až PO úspěšném založení organizace a
  // membershipu, ne dřív. Selhání odeslání e-mailu organizaci/účet
  // nezakládá zpět — admin dostane najevo, že e-mail neodešel, a může ho
  // poslat znovu (stejná cesta, kterou používá "zapomenuté heslo").
  let emailSent = true;
  try {
    const origin = await getAppOrigin();
    const { error: resetError } = await auth.requestPasswordReset({
      email: input.contactEmail,
      redirectTo: `${origin}/nastavit-heslo`,
    });
    if (resetError) {
      emailSent = false;
    }
  } catch {
    emailSent = false;
  }

  return { ok: true, organizationId, emailSent };
}
