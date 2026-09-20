// Security Phase 1.1B — autorizovaná datová vrstva Begina Adminu.
// Stejný princip jako lib/data/dashboard.ts pro zákazníky: kontrola a
// dotaz jsou neoddělitelné, DB klient se mimo lib/data/* nesmí importovat.
// Na rozdíl od zákaznických funkcí organizationId nikdy nepochází z "moje
// organizace" (admin žádnou nemá) — dostává ho jako explicitní parametr,
// typicky z URL segmentu admin stránky.
import "server-only";
import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { organizations, organizationMemberships } from "@/lib/db/schema";
import { auth } from "@/lib/auth/server";
import { getAuthContext } from "./authContext";
import { requireAdmin } from "./adminAuth";
import { validateCreateCustomerInput, type CreateCustomerInput } from "./createCustomerValidation";
import {
  validateAddMemberInput,
  validateUpdateOrganizationInput,
  type AddMemberInput,
  type UpdateOrganizationInput,
} from "./organizationAdminValidation";
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
  name: string | null;
  email: string | null;
};

export type OrganizationDetail = OrganizationSummary & {
  registeredAddress: string;
  members: OrganizationMember[];
};

// Security Phase 6 — jméno/e-mail nejsou v naší DB (organization_memberships
// drží jen userId), pocházejí z Neon Auth. `admin.getUser` v runtime
// @neondatabase/auth NEEXISTUJE (TypeScript typy ho slibovaly z vnitřní
// závislosti na plné better-auth knihovně, ale ověřeno přímo v běžícím
// kódu na Preview — "auth.admin.getUser is not a function"). Skutečně
// implementovaná sada je užší — používáme `listUsers` s filtrem na
// jednotlivé id, po jednom volání na člena (organizace mívají málo
// členů, N paralelních volání není problém).
async function getAuthUserById(
  userId: string
): Promise<{ name: string | null; email: string } | null> {
  const { data, error } = await auth.admin.listUsers({
    query: {
      filterField: "id",
      filterOperator: "eq",
      filterValue: userId,
      limit: 1,
    },
  });

  if (error || !data) {
    return null;
  }

  const user = data.users[0];
  if (!user) {
    return null;
  }

  return { name: user.name ?? null, email: user.email };
}

async function getAuthUsersByIds(
  userIds: string[]
): Promise<Map<string, { name: string | null; email: string }>> {
  const map = new Map<string, { name: string | null; email: string }>();

  const results = await Promise.all(
    userIds.map((id) => getAuthUserById(id).catch(() => null))
  );

  results.forEach((result, i) => {
    if (result) {
      map.set(userIds[i], result);
    }
  });

  return map;
}

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

  const memberships = await db
    .select({
      userId: organizationMemberships.userId,
      role: organizationMemberships.role,
      createdAt: organizationMemberships.createdAt,
    })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.organizationId, organizationId))
    .orderBy(asc(organizationMemberships.createdAt));

  const authUsers = await getAuthUsersByIds(memberships.map((m) => m.userId));

  return {
    ...org,
    members: memberships.map((m) => {
      const authUser = authUsers.get(m.userId);
      return {
        ...m,
        role: m.role as OrganizationMember["role"],
        name: authUser?.name ?? null,
        email: authUser?.email ?? null,
      };
    }),
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

// Security Phase 6 — správa existující organizace (editace, přidání/
// odebrání uživatele, opětovné odeslání aktivačního odkazu). Validace
// vstupu je stejně jako u Fáze 5 v samostatném souboru bez "server-only"
// (organizationAdminValidation.ts), aby šla testovat.

export type UpdateOrganizationResult = { ok: true } | { ok: false; error: string };

// IČO je editovatelné (ADMIN musí umět opravit chybu vzniklou při
// založení) se stejnou validací tvaru jako createCustomerOrganization.
// Ověření proti ARES je samostatná, pozdější fáze.
export async function updateOrganization(
  organizationId: string,
  rawInput: UpdateOrganizationInput
): Promise<UpdateOrganizationResult> {
  await requireAdminContext();

  const validated = validateUpdateOrganizationInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const input = validated.value;

  try {
    await db
      .update(organizations)
      .set({
        name: input.name,
        ico: input.ico,
        registeredAddress: input.registeredAddress,
        status: input.status,
      })
      .where(eq(organizations.id, organizationId));
  } catch (dbError) {
    const message = String(dbError instanceof Error ? dbError.message : dbError).toLowerCase();
    if (message.includes("ico")) {
      return { ok: false, error: "Organizace s tímto IČO už existuje." };
    }
    return { ok: false, error: "Nepodařilo se uložit změny. Zkuste to prosím znovu." };
  }

  return { ok: true };
}

export type AddMemberResult =
  | { ok: true; created: boolean; emailSent: boolean }
  | { ok: false; error: string };

// Nikdy nevytváří druhou identitu pro e-mail, který v Neon Auth už
// existuje — nejdřív vždy hledá podle e-mailu, teprve když nenajde nic,
// založí nový (bezheslový) účet stejnou cestou jako Fáze 5. Existujícímu
// uživateli se jen přidá membership, žádný reset-hesla e-mail (heslo už
// má — nový membership není důvod ho měnit).
export async function addOrganizationMember(
  organizationId: string,
  rawInput: AddMemberInput
): Promise<AddMemberResult> {
  await requireAdminContext();

  const validated = validateAddMemberInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const input = validated.value;

  const { data: existingUsers, error: lookupError } = await auth.admin.listUsers({
    query: {
      filterField: "email",
      filterOperator: "eq",
      filterValue: input.email,
      limit: 1,
    },
  });

  if (lookupError) {
    return { ok: false, error: "Nepodařilo se ověřit e-mail. Zkuste to prosím znovu." };
  }

  const existing = existingUsers?.users?.[0];
  let userId: string;
  let created = false;

  if (existing) {
    userId = existing.id;
  } else {
    const { data: createdUser, error: createUserError } = await auth.admin.createUser({
      email: input.email,
      name: input.name,
    });
    if (createUserError || !createdUser) {
      return { ok: false, error: "Nepodařilo se založit uživatelský účet. Zkuste to prosím znovu." };
    }
    userId = createdUser.user.id;
    created = true;
  }

  try {
    await db.insert(organizationMemberships).values({
      userId,
      organizationId,
      role: input.role,
    });
  } catch (dbError) {
    if (created) {
      // Best-effort úklid — nový auth účet vznikl jen kvůli tomuhle
      // membershipu, který se teď nepodařilo zapsat.
      try {
        await auth.admin.removeUser({ userId });
      } catch {
        return {
          ok: false,
          error: `Nepodařilo se přidat člena a automatický úklid uživatelského účtu (${input.email}) selhal — smažte ho prosím ručně v Neon Console.`,
        };
      }
    }
    const message = String(dbError instanceof Error ? dbError.message : dbError).toLowerCase();
    if (message.includes("org_membership_user_org_idx") || message.includes("duplicate")) {
      return { ok: false, error: "Tento uživatel už je členem této organizace." };
    }
    return { ok: false, error: "Nepodařilo se přidat člena. Zkuste to prosím znovu." };
  }

  let emailSent = true;
  if (created) {
    try {
      const origin = await getAppOrigin();
      const { error: resetError } = await auth.requestPasswordReset({
        email: input.email,
        redirectTo: `${origin}/nastavit-heslo`,
      });
      if (resetError) {
        emailSent = false;
      }
    } catch {
      emailSent = false;
    }
  }

  return { ok: true, created, emailSent };
}

export type RemoveMemberResult = { ok: true } | { ok: false; error: string };

// Odebrání přístupu maže JEN organization_memberships řádek — nikdy
// auth.admin.removeUser. Ten by smazal globální Neon Auth účet napříč
// celou appkou, i kdyby měl uživatel přístup i k jiné organizaci.
// Pojistka proti odebrání posledního člena je UX/byznys ochrana (aby
// organizace nezůstala bez jediného přístupu), ne vlastnost datového
// modelu — do budoucna klidně měnitelná/odstranitelná.
export async function removeOrganizationMember(
  organizationId: string,
  userId: string
): Promise<RemoveMemberResult> {
  await requireAdminContext();

  const remaining = await db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.organizationId, organizationId));

  if (remaining.length <= 1) {
    return { ok: false, error: "Nelze odebrat posledního člena organizace." };
  }

  await db
    .delete(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.userId, userId)
      )
    );

  return { ok: true };
}

export type ResendActivationResult = { ok: true } | { ok: false; error: string };

// Stejný mechanismus jako aktivační e-mail ve Fázi 5 — better-auth
// nerozlišuje "první nastavení hesla" od "zapomenuté heslo", takže tohle
// pokrývá obojí (nový uživatel, co ztratil aktivační e-mail, i stávající,
// co zapomněl heslo).
export async function resendActivationLink(userId: string): Promise<ResendActivationResult> {
  await requireAdminContext();

  const user = await getAuthUserById(userId);
  if (!user) {
    return { ok: false, error: "Uživatele se nepodařilo najít." };
  }

  try {
    const origin = await getAppOrigin();
    const { error: resetError } = await auth.requestPasswordReset({
      email: user.email,
      redirectTo: `${origin}/nastavit-heslo`,
    });
    if (resetError) {
      return { ok: false, error: "Nepodařilo se odeslat e-mail. Zkuste to prosím znovu." };
    }
  } catch {
    return { ok: false, error: "Nepodařilo se odeslat e-mail. Zkuste to prosím znovu." };
  }

  return { ok: true };
}
