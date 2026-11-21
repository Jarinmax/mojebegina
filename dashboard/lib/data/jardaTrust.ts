// Svěřené peníze na Jardově kartě (21. 11. 2026). Soukromé:
//   • vidí jen Jarda (vlastní), Jaroslav Viner a Lucie Königsbergová,
//   • zapisují Viner a Lucie (vklad, jednorázová platba, pravidelná platba),
//   • nic se nemaže — oprava = zrušení záznamu a nový zápis.
// Konkrétní částky a účel jsou jen v databázi, ne v kódu.
// Výpočet zůstatku a výhledu: trustValidation.ts.
import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { collaboratorCards, trustEntries, trustRecurring } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { ForbiddenError, UnauthenticatedError } from "./errors";
import { isWorkManager, LUCIE_USER_ID } from "./workTasksAuth";
import { JARDA_CARD_ID, JARDA_USER_ID } from "./jardaRewards";
import { pragueDateString } from "./pragueTime";
import { addMonths, computeTrust, isDate, isMonth, type TrustEntry, type TrustPlan } from "./trustValidation";
import type { AuthContext } from "./types";

const isLucie = (ctx: AuthContext) => ctx !== null && !ctx.roleSelectionRequired && ctx.userId === LUCIE_USER_ID;

export function canViewJardaTrust(ctx: AuthContext): boolean {
  return ctx !== null && !ctx.roleSelectionRequired && (ctx.userId === JARDA_USER_ID || isWorkManager(ctx) || isLucie(ctx));
}

export function canEditJardaTrust(ctx: AuthContext): boolean {
  return isWorkManager(ctx) || isLucie(ctx);
}

async function requireView() {
  const ctx = await getAuthContext();
  if (!ctx) throw new UnauthenticatedError();
  if (!canViewJardaTrust(ctx)) throw new ForbiddenError();
  return ctx;
}

async function requireEdit() {
  const ctx = await requireView();
  if (!canEditJardaTrust(ctx)) throw new ForbiddenError();
  return ctx;
}

export async function getJardaTrustView() {
  const ctx = await requireView();
  const [entryRows, planRows] = await Promise.all([
    db
      .select()
      .from(trustEntries)
      .where(and(eq(trustEntries.cardId, JARDA_CARD_ID), isNull(trustEntries.cancelledAt)))
      .orderBy(asc(trustEntries.entryDate), asc(trustEntries.createdAt)),
    db.select().from(trustRecurring).where(eq(trustRecurring.cardId, JARDA_CARD_ID)).orderBy(asc(trustRecurring.startMonth)),
  ]);
  const entries: TrustEntry[] = entryRows.map((e) => ({
    id: e.id,
    entryDate: e.entryDate,
    kind: e.kind as TrustEntry["kind"],
    amountKc: e.amountKc,
    description: e.description,
  }));
  const plans: TrustPlan[] = planRows.map((p) => ({
    id: p.id,
    label: p.label,
    amountKc: p.amountKc,
    dayOfMonth: p.dayOfMonth,
    startMonth: p.startMonth,
    endMonth: p.endMonth,
    note: p.note,
  }));
  const today = pragueDateString();
  return { canEdit: canEditJardaTrust(ctx), today, plans, ...computeTrust(entries, plans, today) };
}

export type TrustActionResult = { ok: true } | { ok: false; error: string };

async function ensureCard(createdBy: string) {
  // Karta vzniká při nasazení (scripts/migrate-jarda-karta.mjs); pojistka.
  await db
    .insert(collaboratorCards)
    .values({ id: JARDA_CARD_ID, displayName: "Jaroslav Blahout – obchod a volání", assigneeUserId: JARDA_USER_ID, defaultCommissionPercent: 0, createdBy })
    .onConflictDoNothing();
}

export async function addJardaTrustEntry(input: { kind: string; amountKc: number; entryDate: string; description: string }): Promise<TrustActionResult> {
  const ctx = await requireEdit();
  if (input.kind !== "deposit" && input.kind !== "withdrawal") return { ok: false, error: "Vyberte, jestli jde o vklad, nebo platbu." };
  const amount = Math.round(Number(input.amountKc));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return { ok: false, error: "Zadejte kladnou částku v Kč." };
  if (!isDate(input.entryDate)) return { ok: false, error: "Zadejte datum." };
  const description = input.description.trim().slice(0, 300);
  if (!description) return { ok: false, error: "Napište, o co jde." };
  await ensureCard(ctx.userId);
  await db.insert(trustEntries).values({ cardId: JARDA_CARD_ID, kind: input.kind, amountKc: amount, entryDate: input.entryDate, description, createdBy: ctx.userId });
  return { ok: true };
}

export async function cancelJardaTrustEntry(entryId: string): Promise<TrustActionResult> {
  const ctx = await requireEdit();
  const updated = await db
    .update(trustEntries)
    .set({ cancelledAt: new Date(), cancelledBy: ctx.userId })
    .where(and(eq(trustEntries.id, entryId), eq(trustEntries.cardId, JARDA_CARD_ID), isNull(trustEntries.cancelledAt)))
    .returning({ id: trustEntries.id });
  return updated.length ? { ok: true } : { ok: false, error: "Záznam nenalezen." };
}

/**
 * Pravidelná platba (název, výše, den v měsíci) od daného měsíce. Pokud
 * stávající pravidlo ještě nezačalo platit (žádná splátka nenastala), jen se
 * opraví; jinak se stávající ukončí měsícem před změnou a vznikne nové.
 */
export async function setJardaRecurring(input: { label: string; amountKc: number; dayOfMonth: number; fromMonth: string }): Promise<TrustActionResult> {
  const ctx = await requireEdit();
  const amount = Math.round(Number(input.amountKc));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return { ok: false, error: "Zadejte kladnou částku v Kč." };
  if (!isMonth(input.fromMonth)) return { ok: false, error: "Vyberte měsíc, od kterého platba platí." };
  const label = input.label.trim().slice(0, 80);
  if (!label) return { ok: false, error: "Napište název pravidelné platby." };
  const dayOfMonth = Math.round(Number(input.dayOfMonth));
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) return { ok: false, error: "Den v měsíci musí být 1–28." };
  const today = pragueDateString();

  const open = (await db.select().from(trustRecurring).where(and(eq(trustRecurring.cardId, JARDA_CARD_ID), isNull(trustRecurring.endMonth)))).at(0);
  // Už odečtená platba se zpětně nemění: změna platí nejdřív od měsíce, jehož splatnost ještě nenastala.
  const day = String(Math.min(open?.dayOfMonth ?? dayOfMonth, dayOfMonth)).padStart(2, "0");
  if (`${input.fromMonth}-${day}` <= today) {
    return { ok: false, error: `Platba za ${input.fromMonth} už byla odečtena (${Number(day)}. den v měsíci) — změna může platit nejdřív od dalšího měsíce.` };
  }
  if (open) {
    if (input.fromMonth <= open.startMonth) {
      // Stávající pravidlo ještě neplatí (první splatnost je po dnešku) → jen oprava.
      await db
        .update(trustRecurring)
        .set({ label, amountKc: amount, dayOfMonth, startMonth: input.fromMonth, note: [open.note, `Opraveno ${today}: ${open.amountKc} → ${amount} Kč od ${input.fromMonth}.`].filter(Boolean).join(" ") })
        .where(eq(trustRecurring.id, open.id));
      return { ok: true };
    }
    await db.batch([
      db.update(trustRecurring).set({ endMonth: addMonths(input.fromMonth, -1) }).where(eq(trustRecurring.id, open.id)),
      db.insert(trustRecurring).values({ cardId: JARDA_CARD_ID, label, amountKc: amount, dayOfMonth, startMonth: input.fromMonth, createdBy: ctx.userId }),
    ]);
    return { ok: true };
  }
  await ensureCard(ctx.userId);
  await db.insert(trustRecurring).values({ cardId: JARDA_CARD_ID, label, amountKc: amount, dayOfMonth, startMonth: input.fromMonth, createdBy: ctx.userId });
  return { ok: true };
}
