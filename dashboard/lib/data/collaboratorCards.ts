import "server-only";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  collaboratorCards,
  collaboratorPayouts,
  collaboratorProductMovements,
  collaboratorProducts,
  collaboratorWorkEntries,
  userActivations,
  userProfiles,
  userRoles,
} from "@/lib/db/schema";
import { auth } from "@/lib/auth/server";
import { inviteCustomer } from "./admin";
import { upsertUserProfile, upsertUserProfileStatement } from "./userProfiles";
import { getAuthContext } from "./authContext";
import { ForbiddenError, UnauthenticatedError } from "./errors";
import {
  assignmentInputSchema,
  calculateCommissionKc,
  calculateWorkEarnedKc,
  inviteCollaboratorInputSchema,
  LUCIE_COLLABORATOR_CARD_ID,
  payoutInputSchema,
  productMovementInputSchema,
  workEntryDeleteInputSchema,
  workEntryEditInputSchema,
  workEntryInputSchema,
} from "./collaboratorCardsValidation";

type CardAccess = { userId: string; isAdmin: boolean; isOwner: boolean };

export async function getCurrentCollaboratorLanding(userId: string): Promise<string | null> {
  const [card] = await db.select({ id: collaboratorCards.id })
    .from(collaboratorCards)
    .where(eq(collaboratorCards.assigneeUserId, userId))
    .limit(1);
  return card?.id === LUCIE_COLLABORATOR_CARD_ID ? "/spoluprace/lucie" : null;
}

async function requireCardAccess(cardId: string, write: boolean): Promise<CardAccess> {
  const ctx = await getAuthContext();
  if (!ctx) throw new UnauthenticatedError();
  if (ctx.roleSelectionRequired) throw new ForbiddenError();

  const [card] = await db
    .select({ assigneeUserId: collaboratorCards.assigneeUserId })
    .from(collaboratorCards)
    .where(eq(collaboratorCards.id, cardId))
    .limit(1);
  if (!card) throw new Error("Karta spolupracovnice nebyla nalezena.");

  const isAdmin = ctx.systemRole === "ADMIN";
  const isOwner = card.assigneeUserId === ctx.userId;
  if (!isAdmin && !isOwner) throw new ForbiddenError();
  if (write && !isAdmin && !isOwner) throw new ForbiddenError();
  return { userId: ctx.userId, isAdmin, isOwner };
}

export type CollaboratorCardView = Awaited<ReturnType<typeof getLucieCollaboratorCard>>;

/**
 * Které zápisy práce jsou "už proplacené" (a tedy uzamčené proti úpravě/
 * smazání) — schváleno 12. 11. 2026: nejstarší zápisy se počítají jako
 * proplacené první (FIFO), dokud součet jejich částek nedosáhne CELKOVÉ
 * vyplacené částky z collaborator_payouts. Provize z prodeje do toho
 * nevstupuje — jen samotné zápisy práce.
 */
function lockedWorkEntryIds(entries: { id: string; earnedKc: number; occurredOn: string; createdAt: Date }[], paidKc: number): Set<string> {
  const sorted = [...entries].sort((a, b) =>
    a.occurredOn === b.occurredOn ? a.createdAt.getTime() - b.createdAt.getTime() : a.occurredOn.localeCompare(b.occurredOn)
  );
  const locked = new Set<string>();
  let cumulative = 0;
  for (const entry of sorted) {
    cumulative += entry.earnedKc;
    if (cumulative <= paidKc) locked.add(entry.id);
  }
  return locked;
}

export async function getLucieCollaboratorCard() {
  const cardId = LUCIE_COLLABORATOR_CARD_ID;
  const access = await requireCardAccess(cardId, false);
  const [card] = await db.select().from(collaboratorCards).where(eq(collaboratorCards.id, cardId)).limit(1);
  if (!card) throw new Error("Karta spolupracovnice nebyla nalezena.");

  const [workEntries, products, movements, payouts, assignee] = await Promise.all([
    db.select().from(collaboratorWorkEntries)
      .where(and(eq(collaboratorWorkEntries.cardId, cardId), isNull(collaboratorWorkEntries.deletedAt)))
      .orderBy(desc(collaboratorWorkEntries.occurredOn), desc(collaboratorWorkEntries.createdAt)),
    db.select().from(collaboratorProducts).where(and(eq(collaboratorProducts.cardId, cardId), eq(collaboratorProducts.active, true))).orderBy(asc(collaboratorProducts.name)),
    db.select({
      id: collaboratorProductMovements.id,
      productId: collaboratorProductMovements.productId,
      kind: collaboratorProductMovements.kind,
      quantity: collaboratorProductMovements.quantity,
      unitSalePriceKc: collaboratorProductMovements.unitSalePriceKc,
      commissionKc: collaboratorProductMovements.commissionKc,
      note: collaboratorProductMovements.note,
      occurredAt: collaboratorProductMovements.occurredAt,
    }).from(collaboratorProductMovements)
      .innerJoin(collaboratorProducts, eq(collaboratorProducts.id, collaboratorProductMovements.productId))
      .where(eq(collaboratorProducts.cardId, cardId))
      .orderBy(desc(collaboratorProductMovements.occurredAt)),
    db.select().from(collaboratorPayouts).where(eq(collaboratorPayouts.cardId, cardId)).orderBy(desc(collaboratorPayouts.paidAt)),
    card.assigneeUserId
      ? db.select({ name: userProfiles.name, email: userProfiles.email }).from(userProfiles).where(eq(userProfiles.userId, card.assigneeUserId)).limit(1)
      : Promise.resolve([]),
  ]);

  const productViews = products.map((product) => {
    const own = movements.filter((movement) => movement.productId === product.id);
    const stocked = own.filter((m) => m.kind === "stock_in").reduce((sum, m) => sum + m.quantity, 0);
    const adjusted = own.filter((m) => m.kind === "adjustment").reduce((sum, m) => sum + m.quantity, 0);
    const sold = own.filter((m) => m.kind === "sale").reduce((sum, m) => sum + Math.abs(m.quantity), 0);
    const revenueKc = own.filter((m) => m.kind === "sale").reduce((sum, m) => sum + Math.abs(m.quantity) * (m.unitSalePriceKc ?? 0), 0);
    const commissionKc = own.reduce((sum, m) => sum + m.commissionKc, 0);
    const stock = stocked + adjusted - sold;
    return { ...product, stocked, sold, stock, revenueKc, commissionKc, lowStock: stock <= product.lowStockThreshold };
  });

  const workEarnedKc = workEntries.reduce((sum, entry) => sum + entry.earnedKc, 0);
  const salesCommissionKc = productViews.reduce((sum, product) => sum + product.commissionKc, 0);
  const paidKc = payouts.reduce((sum, payout) => sum + payout.amountKc, 0);
  const locked = lockedWorkEntryIds(workEntries, paidKc);
  const workEntryViews = workEntries.map((entry) => ({ ...entry, locked: locked.has(entry.id) }));

  return {
    card,
    assignee: assignee[0] ?? null,
    access,
    workEntries: workEntryViews,
    movements,
    payouts,
    products: productViews,
    summary: {
      postCount: workEntries.reduce((sum, entry) => sum + entry.postCount, 0),
      durationMinutes: workEntries.reduce((sum, entry) => sum + entry.durationMinutes, 0),
      workEarnedKc,
      salesCommissionKc,
      earnedKc: workEarnedKc + salesCommissionKc,
      paidKc,
      remainingKc: workEarnedKc + salesCommissionKc - paidKc,
    },
  };
}

export async function addCollaboratorWorkEntry(input: unknown) {
  const access = await requireCardAccess(LUCIE_COLLABORATOR_CARD_ID, true);
  const parsed = workEntryInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Neplatné údaje." };
  const { rewardType, rateKc, postCount, durationMinutes } = parsed.data;
  const earnedKc = calculateWorkEarnedKc(rewardType, rateKc, postCount, durationMinutes);
  await db.insert(collaboratorWorkEntries).values({ cardId: LUCIE_COLLABORATOR_CARD_ID, ...parsed.data, earnedKc, createdBy: access.userId });
  return { ok: true as const };
}

export async function updateCollaboratorWorkEntry(input: unknown) {
  const access = await requireCardAccess(LUCIE_COLLABORATOR_CARD_ID, true);
  const parsed = workEntryEditInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Neplatné údaje." };
  const { id, rewardType, rateKc, postCount, durationMinutes, ...rest } = parsed.data;

  const view = await getLucieCollaboratorCard();
  const entry = view.workEntries.find((e) => e.id === id);
  if (!entry) return { ok: false as const, error: "Záznam práce nebyl nalezen." };
  if (entry.locked) return { ok: false as const, error: "Záznam je už proplacený — nejde běžně upravit." };

  const earnedKc = calculateWorkEarnedKc(rewardType, rateKc, postCount, durationMinutes);
  const updated = await db.update(collaboratorWorkEntries)
    .set({ ...rest, rewardType, rateKc, postCount, durationMinutes, earnedKc, updatedBy: access.userId, updatedAt: new Date() })
    .where(and(eq(collaboratorWorkEntries.id, id), eq(collaboratorWorkEntries.cardId, LUCIE_COLLABORATOR_CARD_ID), isNull(collaboratorWorkEntries.deletedAt)))
    .returning({ id: collaboratorWorkEntries.id });
  if (updated.length === 0) return { ok: false as const, error: "Záznam práce nebyl nalezen nebo byl mezitím smazán." };
  return { ok: true as const };
}

export async function deleteCollaboratorWorkEntry(input: unknown) {
  const access = await requireCardAccess(LUCIE_COLLABORATOR_CARD_ID, true);
  const parsed = workEntryDeleteInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Neplatný záznam." };

  const view = await getLucieCollaboratorCard();
  const entry = view.workEntries.find((e) => e.id === parsed.data.id);
  if (!entry) return { ok: false as const, error: "Záznam práce nebyl nalezen." };
  if (entry.locked) return { ok: false as const, error: "Záznam je už proplacený — nejde běžně smazat." };

  const deleted = await db.update(collaboratorWorkEntries)
    .set({ deletedBy: access.userId, deletedAt: new Date() })
    .where(and(eq(collaboratorWorkEntries.id, parsed.data.id), eq(collaboratorWorkEntries.cardId, LUCIE_COLLABORATOR_CARD_ID), isNull(collaboratorWorkEntries.deletedAt)))
    .returning({ id: collaboratorWorkEntries.id });
  if (deleted.length === 0) return { ok: false as const, error: "Záznam práce nebyl nalezen nebo byl mezitím smazán." };
  return { ok: true as const };
}

export async function addCollaboratorProductMovement(input: unknown) {
  const access = await requireCardAccess(LUCIE_COLLABORATOR_CARD_ID, true);
  const parsed = productMovementInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Neplatné údaje." };

  const [product] = await db.select().from(collaboratorProducts).where(and(
    eq(collaboratorProducts.id, parsed.data.productId),
    eq(collaboratorProducts.cardId, LUCIE_COLLABORATOR_CARD_ID),
    eq(collaboratorProducts.active, true)
  )).limit(1);
  if (!product) return { ok: false as const, error: "Produkt na Luciině kartě nebyl nalezen." };

  const movementRows = await db.select({ kind: collaboratorProductMovements.kind, quantity: collaboratorProductMovements.quantity })
    .from(collaboratorProductMovements).where(eq(collaboratorProductMovements.productId, product.id));
  const currentStock = movementRows.reduce((sum, row) => row.kind === "sale" ? sum - Math.abs(row.quantity) : sum + row.quantity, 0);
  if (parsed.data.kind === "sale" && currentStock < parsed.data.quantity) {
    return { ok: false as const, error: `Na skladě je jen ${currentStock} ks. Prodej ${parsed.data.quantity} ks nelze zapsat.` };
  }

  const unitSalePriceKc = parsed.data.kind === "sale" ? parsed.data.unitSalePriceKc! : null;
  const commissionKc = parsed.data.kind === "sale"
    ? calculateCommissionKc(parsed.data.quantity, parsed.data.unitSalePriceKc!, product.commissionPercent)
    : 0;
  await db.insert(collaboratorProductMovements).values({
    productId: product.id,
    kind: parsed.data.kind,
    quantity: parsed.data.quantity,
    unitSalePriceKc,
    commissionPercentSnapshot: parsed.data.kind === "sale" ? product.commissionPercent : null,
    commissionKc,
    note: parsed.data.note || null,
    createdBy: access.userId,
  });
  return { ok: true as const };
}

export async function addCollaboratorPayout(input: unknown) {
  const access = await requireCardAccess(LUCIE_COLLABORATOR_CARD_ID, true);
  if (!access.isAdmin) throw new ForbiddenError();
  const parsed = payoutInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Neplatné údaje." };
  const view = await getLucieCollaboratorCard();
  if (parsed.data.amountKc > view.summary.remainingKc) return { ok: false as const, error: `K výplatě zbývá ${view.summary.remainingKc} Kč.` };
  await db.insert(collaboratorPayouts).values({ cardId: LUCIE_COLLABORATOR_CARD_ID, ...parsed.data, note: parsed.data.note || null, createdBy: access.userId });
  return { ok: true as const };
}

export async function assignLucieCardByEmail(input: unknown) {
  const access = await requireCardAccess(LUCIE_COLLABORATOR_CARD_ID, true);
  if (!access.isAdmin) throw new ForbiddenError();
  const parsed = assignmentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Zadejte platný e-mail pozvaného účtu." };
  const [profile] = await db.select({ userId: userProfiles.userId, name: userProfiles.name, email: userProfiles.email })
    .from(userProfiles).where(eq(userProfiles.email, parsed.data.email)).limit(1);
  if (!profile) return { ok: false as const, error: "Účet s tímto e-mailem zatím v MojeBegina není. Nejdřív Lucii pozvěte a potom kartu přiřaďte." };
  const roles = await db.select({ role: userRoles.systemRole }).from(userRoles).where(and(eq(userRoles.userId, profile.userId), inArray(userRoles.systemRole, ["CUSTOMER", "EMPLOYEE", "EXECUTIVE"])));
  if (roles.length === 0) return { ok: false as const, error: "Účet nemá povolenou roli pro MojeBegina." };
  await db.update(collaboratorCards).set({ assigneeUserId: profile.userId, updatedAt: new Date() }).where(eq(collaboratorCards.id, LUCIE_COLLABORATOR_CARD_ID));
  return { ok: true as const, profile };
}

// Pozvání nové spolupracovnice do appky — dřív šlo kartu jen PŘIŘADIT k už
// existujícímu účtu (assignLucieCardByEmail), žádná cesta appkou neuměla
// účet vůbec založit (appka je zvaná, žádná samoobslužná registrace).
// Stejný vzor jako addOrganizationMember/createCustomerOrganization
// (admin.ts): Neon Auth účet BEZ hesla (auth.admin.createUser), role
// EMPLOYEE (uživatel vidí appku stejně jako jiný zaměstnanecký přístup),
// user_activations řádek a profil atomicky v jednom db.batch, pak rovnou
// přiřazení karty — ušetří druhý krok přes AssignCardForm, protože e-mail
// už máme ověřený z téhle akce. Odeslání pozvánky (reset hesla) je ta samá
// funkce jako "Pozvat zákazníka" (inviteCustomer) — negeneruje ani nezná
// heslo, jen pošle odkaz na /nastavit-heslo.
export async function inviteLucieCollaborator(input: unknown) {
  const access = await requireCardAccess(LUCIE_COLLABORATOR_CARD_ID, true);
  if (!access.isAdmin) throw new ForbiddenError();
  const parsed = inviteCollaboratorInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Zadejte jméno a platný e-mail." };

  const { data: existingUsers, error: lookupError } = await auth.admin.listUsers({
    query: { filterField: "email", filterOperator: "eq", filterValue: parsed.data.email, limit: 1 },
  });
  if (lookupError) return { ok: false as const, error: "Nepodařilo se ověřit e-mail. Zkuste to prosím znovu." };
  const existing = existingUsers?.users?.[0] ?? null;

  let userId: string;
  let created = false;
  if (existing) {
    userId = existing.id;
  } else {
    // Neon Auth uživatel BEZ hesla — ten appka nikdy nezadává ani nezná,
    // Lucie si ho sama nastaví přes odkaz z pozvánky.
    const { data: createdUser, error: createUserError } = await auth.admin.createUser({
      email: parsed.data.email,
      name: parsed.data.name,
    });
    if (createUserError || !createdUser) {
      return { ok: false as const, error: "Nepodařilo se založit uživatelský účet. Zkuste to prosím znovu." };
    }
    userId = createdUser.user.id;
    created = true;
  }

  try {
    if (created) {
      await db.batch([
        db.insert(userRoles).values({ userId, systemRole: "EMPLOYEE" }),
        db.insert(userActivations).values({ userId }),
        upsertUserProfileStatement(userId, parsed.data.name, parsed.data.email),
        db.update(collaboratorCards).set({ assigneeUserId: userId, updatedAt: new Date() }).where(eq(collaboratorCards.id, LUCIE_COLLABORATOR_CARD_ID)),
      ]);
    } else {
      // Existující identita (např. už je zákazník) — jen přidá EMPLOYEE
      // mezi role, žádná stávající role/data se nemění. userActivations
      // může už existovat (jiná role ji dřív založila) — onConflictDoNothing.
      await db.insert(userRoles).values({ userId, systemRole: "EMPLOYEE" }).onConflictDoNothing();
      await db.insert(userActivations).values({ userId }).onConflictDoNothing();
      await upsertUserProfile(userId, existing?.name ?? parsed.data.name, existing?.email ?? parsed.data.email).catch(() => {});
      await db.update(collaboratorCards).set({ assigneeUserId: userId, updatedAt: new Date() }).where(eq(collaboratorCards.id, LUCIE_COLLABORATOR_CARD_ID));
    }
  } catch {
    if (created) {
      // Best-effort úklid — nový auth účet vznikl jen kvůli týhle pozvánce.
      try {
        await auth.admin.removeUser({ userId });
      } catch {
        return {
          ok: false as const,
          error: `Nepodařilo se pozvat spolupracovnici a automatický úklid uživatelského účtu (${parsed.data.email}) selhal — smažte ho prosím ručně v Neon Console.`,
        };
      }
    }
    return { ok: false as const, error: "Nepodařilo se pozvat spolupracovnici. Zkuste to prosím znovu." };
  }

  const invited = await inviteCustomer(userId);
  if (!invited.ok) return { ok: false as const, error: invited.error };

  return { ok: true as const, email: parsed.data.email };
}

