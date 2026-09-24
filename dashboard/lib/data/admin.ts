// Security Phase 1.1B — autorizovaná datová vrstva Begina Adminu.
// Stejný princip jako lib/data/dashboard.ts pro zákazníky: kontrola a
// dotaz jsou neoddělitelné, DB klient se mimo lib/data/* nesmí importovat.
// Na rozdíl od zákaznických funkcí organizationId nikdy nepochází z "moje
// organizace" (admin žádnou nemá) — dostává ho jako explicitní parametr,
// typicky z URL segmentu admin stránky.
import "server-only";
import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { organizations, organizationMemberships, userActivations, userRoles } from "@/lib/db/schema";
import { auth } from "@/lib/auth/server";
import { getAuthContext } from "./authContext";
import { requireAdmin, requireAdminOrExecutive } from "./adminAuth";
import { validateCreateCustomerInput, type CreateCustomerInput } from "./createCustomerValidation";
import { planCustomerCreation, type ExistingUserInfo } from "./createCustomerPlan";
import {
  validateAddMemberInput,
  validateUpdateOrganizationInput,
  type AddMemberInput,
  type UpdateOrganizationInput,
} from "./organizationAdminValidation";
import {
  getUserProfile,
  getUserProfiles,
  upsertUserProfile,
  upsertUserProfileStatement,
} from "./userProfiles";
import type { AuthContext } from "./types";

export async function requireAdminContext(): Promise<NonNullable<AuthContext>> {
  const ctx = await getAuthContext();
  return requireAdmin(ctx);
}

// Security Phase 7 (Executive 1.0) — brána pro čtecí funkce sdílené mezi
// /admin a /executive (listOrganizations, getOrganizationDetail). EXECUTIVE
// má cross-organizační READ, žádné WRITE — všechny mutace níže zůstávají
// výhradně na requireAdminContext/requireAdmin, tahle funkce se v nich
// nikde nepoužívá.
export async function requireAdminOrExecutiveContext(): Promise<NonNullable<AuthContext>> {
  const ctx = await getAuthContext();
  return requireAdminOrExecutive(ctx);
}

export type OrganizationSummary = {
  id: string;
  name: string;
  ico: string;
  status: string | null;
  createdAt: Date;
};

export async function listOrganizations(): Promise<OrganizationSummary[]> {
  await requireAdminOrExecutiveContext();

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

// Security Phase 11 — stav pozvání/aktivace je vlastnost uživatele (viz
// user_activations v lib/db/schema.ts), promítnutá sem jen kvůli UI.
export type OnboardingStatus = "not_invited" | "pending" | "active";

export type OrganizationMember = {
  userId: string;
  role: "owner" | "member";
  createdAt: Date;
  name: string | null;
  email: string | null;
  onboardingStatus: OnboardingStatus;
};

async function getOnboardingStatusesByUserIds(
  userIds: string[]
): Promise<Map<string, OnboardingStatus>> {
  const map = new Map<string, OnboardingStatus>();
  if (userIds.length === 0) {
    return map;
  }

  const rows = await db
    .select({
      userId: userActivations.userId,
      invitedAt: userActivations.invitedAt,
      activatedAt: userActivations.activatedAt,
    })
    .from(userActivations)
    .where(inArray(userActivations.userId, userIds));

  rows.forEach((row) => {
    map.set(row.userId, row.activatedAt ? "active" : row.invitedAt ? "pending" : "not_invited");
  });

  // Chybí-li řádek úplně (uživatel nikdy neprošel naším onboarding
  // tokem), bezpečný default je "not_invited" — nikdy "active".
  userIds.forEach((userId) => {
    if (!map.has(userId)) {
      map.set(userId, "not_invited");
    }
  });

  return map;
}

export type OrganizationDetail = OrganizationSummary & {
  registeredAddress: string;
  members: OrganizationMember[];
};

// Security Phase 14 — jméno/e-mail nejsou v naší DB (organization_memberships
// drží jen userId), čtou se z lokálního adresáře user_profiles (viz
// userProfiles.ts) — NE živě z Neon Auth. `auth.admin.listUsers` s
// `filterField: "id"` se ukázal jako nespolehlivý (tiše vrací prázdný
// výsledek pro existující uživatele); `user_profiles` se plní při vzniku
// membershipu a při každém přihlášení (getAuthContext), takže je pro
// uživatele relevantní pro tuhle appku vždy spolehlivě zaplněný.
export async function getOrganizationDetail(
  organizationId: string
): Promise<OrganizationDetail | null> {
  await requireAdminOrExecutiveContext();

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

  const userIds = memberships.map((m) => m.userId);
  const [profiles, onboardingStatuses] = await Promise.all([
    getUserProfiles(userIds),
    getOnboardingStatusesByUserIds(userIds),
  ]);

  return {
    ...org,
    members: memberships.map((m) => {
      const profile = profiles.get(m.userId);
      return {
        ...m,
        role: m.role as OrganizationMember["role"],
        name: profile?.name ?? null,
        email: profile?.email ?? null,
        onboardingStatus: onboardingStatuses.get(m.userId) ?? "not_invited",
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
// Security Phase 11 — založení organizace už samo o sobě NEPOSÍLÁ aktivační
// e-mail (dřívější "Krok 3"). Nový zákazník se nejdřív připraví interně
// (historie, kontrola) a teprve samostatnou akcí "Pozvat zákazníka"
// (inviteCustomer níže) se mu pošle odkaz na nastavení hesla — viz
// user_activations v lib/db/schema.ts.
//
// Validace vstupu je v samostatném createCustomerValidation.ts (bez
// "server-only"), aby šla testovat stejně jako requireAdmin/
// requireOrgAccess — tenhle soubor testovat nejde (Vitest neumí
// "server-only" resolvnout, na rozdíl od Next.js bundleru).

export type CreateCustomerResult =
  | { ok: true; organizationId: string }
  | { ok: false; error: string };

// P0 hotfix — aktivační/reset odkaz se dřív vždy odvozoval z Host hlavičky
// příchozího požadavku. Když ADMIN akci ("Pozvat zákazníka"/"Poslat znovu
// odkaz") spustil, zatímco sám prohlížel appku přes *.vercel.app doménu
// (chráněnou Vercel Deployment Protection), ne přes moje.begina.cz, odkaz
// v e-mailu vedl na tu chráněnou Vercel doménu — příjemce místo
// /nastavit-heslo narazil na Vercel přihlašovací stránku. V produkci
// (VERCEL_ENV === "production") proto origin pevně fixujeme na jedinou
// skutečnou produkční doménu bez ohledu na to, odkud ADMIN akci spustil.
// Mimo produkci (Preview/dev) zůstává odvození z hlavičky beze změny.
async function getAppOrigin(): Promise<string> {
  if (process.env.VERCEL_ENV === "production") {
    return "https://moje.begina.cz";
  }

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "moje.begina.cz";
  return `${proto}://${host}`;
}

// Security Phase 13 — oprava mezery zjištěné při zakládání Fillette s.r.o.:
// tahle funkce dřív VŽDY volala auth.admin.createUser, i pro e-mail, který
// v Neon Auth už existoval (typicky někdo z vedení, co si zakládá vlastní
// firmu jako zákazníka) — spadla na USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL a
// nedalo se to opravit jinak než ručním SQL. Teď se nejdřív bezpečně podívá,
// jestli e-mail už existuje (stejná technika jako addOrganizationMember,
// Fáze 6), a rozhodnutí "založit nový účet, nebo znovupoužít existující
// identitu" nechá na čisté, testované funkci planCustomerCreation (viz
// createCustomerPlan.ts — tam i vysvětlení, proč user_activations a
// systemRole/user_roles vyžadují každé jiné zacházení).
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

  const { data: existingUsers, error: lookupError } = await auth.admin.listUsers({
    query: {
      filterField: "email",
      filterOperator: "eq",
      filterValue: input.contactEmail,
      limit: 1,
    },
  });
  if (lookupError) {
    return { ok: false, error: "Nepodařilo se ověřit e-mail. Zkuste to prosím znovu." };
  }
  const existingAuthUser = existingUsers?.users?.[0] ?? null;

  let existingUserInfo: ExistingUserInfo | null = null;
  if (existingAuthUser) {
    const [roleRow] = await db
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(
        and(eq(userRoles.userId, existingAuthUser.id), eq(userRoles.systemRole, "CUSTOMER"))
      )
      .limit(1);
    existingUserInfo = { id: existingAuthUser.id, hasCustomerRole: Boolean(roleRow) };
  }

  const plan = planCustomerCreation(existingUserInfo);

  let authUserId: string;
  if (plan.mode === "new_user") {
    // Neon Auth uživatel BEZ hesla. ADMIN heslo zákazníka nikdy nezadává
    // ani nezná — better-auth admin plugin credential účet vůbec
    // nezaloží, dokud si zákazník sám nenastaví heslo přes /nastavit-heslo.
    const { data: created, error: createUserError } = await auth.admin.createUser({
      email: input.contactEmail,
      name: input.contactName,
    });

    if (createUserError || !created) {
      if (createUserError?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
        // Vzácný souběh — účet vznikl mezi kontrolou výše a tímhle
        // voláním. Ne chyba dat, jen zkuste znovu (další pokus už
        // existující identitu najde a znovupoužije).
        return {
          ok: false,
          error: "Uživatel s tímto e-mailem už v systému existuje. Zkuste to prosím znovu.",
        };
      }
      return { ok: false, error: "Nepodařilo se založit uživatelský účet. Zkuste to prosím znovu." };
    }
    authUserId = created.user.id;
  } else {
    authUserId = plan.userId;
  }

  // Organizace + membership (+ u nového účtu i onboarding stav, u
  // znovupoužité identity i případný CUSTOMER řádek) v jediném atomickém
  // HTTP batchi — neon-http driver nepodporuje db.transaction (viz
  // drizzle-orm/neon-http/session: "No transactions support"), takže id
  // organizace generujeme sami předem a inserce pošleme přes db.batch, aby
  // buď prošly všechny, nebo žádná (žádná "osiřelá" organizace bez
  // membershipu).
  const organizationId = randomUUID();
  try {
    if (plan.mode === "new_user") {
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
        // invitedAt/activatedAt zůstávají NULL — "Nepozván", dokud ADMIN
        // sám nespustí "Pozvat zákazníka".
        db.insert(userActivations).values({ userId: authUserId }),
        upsertUserProfileStatement(authUserId, input.contactName, input.contactEmail),
      ]);
    } else if (plan.grantCustomerRole) {
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
        // Existující identita ještě neměla CUSTOMER mezi svými rolemi
        // (např. měla jen EXECUTIVE) — přidá se JEN tenhle nový řádek,
        // žádná existující role se nemaže ani neupravuje. onConflictDoNothing
        // je pojistka proti souběhu (uniqueIndex userId+systemRole).
        db.insert(userRoles).values({ userId: authUserId, systemRole: "CUSTOMER" }).onConflictDoNothing(),
        // existingAuthUser je tu vždy definovaný (plan.mode === "reuse_user"
        // vznikne jen z nalezené identity, viz planCustomerCreation).
        upsertUserProfileStatement(
          authUserId,
          existingAuthUser?.name ?? null,
          existingAuthUser?.email ?? input.contactEmail
        ),
      ]);
    } else {
      // Identita CUSTOMER roli už měla (vlastní i jinou organizaci) —
      // stačí organizace + membership. user_activations se záměrně vůbec
      // nedotýká (je to vlastnost identity, ne tohohle membershipu, viz
      // createCustomerPlan.ts) a userRoles taky ne (řádek už existuje).
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
        upsertUserProfileStatement(
          authUserId,
          existingAuthUser?.name ?? null,
          existingAuthUser?.email ?? input.contactEmail
        ),
      ]);
    }
  } catch (dbError) {
    if (plan.mode === "new_user") {
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
    }
    // Ve větvi "reuse_user" žádný nový auth účet nevznikl — existující
    // identita zůstává beze změny, není co uklízet.

    const message = String(dbError instanceof Error ? dbError.message : dbError).toLowerCase();
    if (message.includes("ico")) {
      return { ok: false, error: "Organizace s tímto IČO už existuje." };
    }
    return { ok: false, error: "Nepodařilo se založit organizaci. Zkuste to prosím znovu." };
  }

  return { ok: true, organizationId };
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
  | { ok: true; created: boolean }
  | { ok: false; error: string };

// Nikdy nevytváří druhou identitu pro e-mail, který v Neon Auth už
// existuje — nejdřív vždy hledá podle e-mailu, teprve když nenajde nic,
// založí nový (bezheslový) účet stejnou cestou jako Fáze 5. Existujícímu
// uživateli se jen přidá membership, žádný reset-hesla e-mail (heslo už
// má — nový membership není důvod ho měnit).
//
// Security Phase 11 — nový uživatel (created=true) se stejně jako u
// createCustomerOrganization NEPOZVE automaticky, jen dostane
// user_activations řádek ("Nepozván"); pozvání je ta samá samostatná akce
// "Pozvat zákazníka" na detailu organizace.
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
    if (created) {
      await db.batch([
        db.insert(organizationMemberships).values({ userId, organizationId, role: input.role }),
        db.insert(userActivations).values({ userId }),
        upsertUserProfileStatement(userId, input.name, input.email),
      ]);
    } else {
      await db.insert(organizationMemberships).values({ userId, organizationId, role: input.role });
      // Best-effort, mimo atomický zápis membershipu výše — nevadí, pokud
      // selže (self-heal při příštím přihlášení, viz getAuthContext).
      // existing (nalezená identita) má přednost před tím, co ADMIN
      // zrovna napsal do formuláře — je to autoritativnější zdroj.
      await upsertUserProfile(userId, existing?.name ?? input.name, existing?.email ?? input.email).catch(
        () => {}
      );
    }
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

  return { ok: true, created };
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

export type InviteCustomerResult = { ok: true } | { ok: false; error: string };

// Security Phase 11 — samostatná akce "Pozvat zákazníka", oddělená od
// založení organizace/uživatele. Smí se spustit jen z UX stavu "Nepozván"
// (viz OnboardingStatus výše), ale ověřuje se to i tady na serveru —
// stejný vzor jako removeOrganizationMember (obranná kontrola, ne jen
// spoléhání na to, že UI nezobrazí špatné tlačítko).
export async function inviteCustomer(userId: string): Promise<InviteCustomerResult> {
  await requireAdminContext();

  const [state] = await db
    .select({ invitedAt: userActivations.invitedAt, activatedAt: userActivations.activatedAt })
    .from(userActivations)
    .where(eq(userActivations.userId, userId))
    .limit(1);

  if (!state) {
    return { ok: false, error: "Uživatele se nepodařilo najít." };
  }
  if (state.activatedAt) {
    return { ok: false, error: "Uživatel už má účet aktivní." };
  }
  if (state.invitedAt) {
    return { ok: false, error: "Uživatel už byl pozván — použijte „Poslat znovu odkaz“." };
  }

  const user = await getUserProfile(userId);
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

  await db.update(userActivations).set({ invitedAt: new Date() }).where(eq(userActivations.userId, userId));

  return { ok: true };
}

export type ResendActivationResult = { ok: true } | { ok: false; error: string };

// Stejný mechanismus jako aktivační e-mail ve Fázi 5 — better-auth
// nerozlišuje "první nastavení hesla" od "zapomenuté heslo", takže tohle
// pokrývá obojí (nový uživatel, co ztratil aktivační e-mail, i stávající,
// co zapomněl heslo).
export async function resendActivationLink(userId: string): Promise<ResendActivationResult> {
  await requireAdminContext();

  const user = await getUserProfile(userId);
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
