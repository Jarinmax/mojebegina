// Security Phase 2.3 — autorizovaná datová vrstva dashboardu.
// Jediné místo, odkud smí stránky dashboardu číst zákaznická data. Každá
// funkce, která čte data konkrétní organizace, si sama zavolá
// assertOrgAccess() — kontrola a dotaz jsou neoddělitelné (viz
// lib/data/organizations.ts). organizationId, který se v appce používá,
// vždy pochází z DB (přes getMyOrganizationId), nikdy z URL, localStorage
// ani jiné hodnoty poslané klientem.
import "server-only";
import { redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoices, orderItems, organizationMemberships, organizations, orders } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { assertOrgAccess } from "./organizations";
import type { AuthContext } from "./types";
import type { CustomerAccount, Order } from "@/mock/customer";

type NonNullAuthContext = NonNullable<AuthContext>;

// --- Vstupní bod pro stránky dashboardu -------------------------------

export type CustomerContext = {
  ctx: NonNullAuthContext;
  organizationId: string | null;
};

// Přihlášení je podmínka nutná pro cokoli na dashboardu. Nepřihlášený
// uživatel se přesměruje na /login dřív, než se cokoli začne načítat.
// organizationId může být null — to znamená "přihlášen, ale zatím bez
// členství v žádné organizaci" a stránky na to musí umět reagovat vlastním
// (neprázdným) stavem, ne pádem.
export async function requireCustomerContext(): Promise<CustomerContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect("/login");
  }

  const organizationId = await getMyOrganizationId(ctx);
  return { ctx, organizationId };
}

// Jediný zdroj pravdy o tom, "moje organizace" — dotaz je omezený na
// ctx.userId (server-side ověřená identita), klient nemá žádný parametr,
// kterým by mohl vybrat cizí organizaci.
async function getMyOrganizationId(ctx: NonNullAuthContext): Promise<string | null> {
  const [row] = await db
    .select({ organizationId: organizationMemberships.organizationId })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.userId, ctx.userId))
    .orderBy(asc(organizationMemberships.createdAt))
    .limit(1);

  return row?.organizationId ?? null;
}

// --- Zákaznický účet ----------------------------------------------------

function deriveInitials(name: string | null): string {
  if (!name) return "?";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export async function getCustomerAccount(
  ctx: NonNullAuthContext,
  organizationId: string
): Promise<CustomerAccount> {
  await assertOrgAccess(ctx, organizationId, "read");

  const [org] = await db
    .select({
      name: organizations.name,
      ico: organizations.ico,
      registeredAddress: organizations.registeredAddress,
      status: organizations.status,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org) {
    throw new Error("Organizace nenalezena");
  }

  // Kontaktní jméno/e-mail pochází výhradně z ověřené session (ctx), ne
  // z DB — viz lib/data/types.ts. Neon Auth má jen jedno pole "name", ne
  // rozdělené jméno/příjmení, takže příjmení se odsud nikdy neodvozuje
  // (žádné vymýšlení) — zůstává vždy null, dokud appka nezíská skutečný,
  // samostatný údaj o příjmení.
  return {
    companyName: org.name,
    ico: org.ico,
    registeredAddress: org.registeredAddress,
    contactFirstName: ctx.name ?? "Zákazník",
    contactLastName: null,
    initials: deriveInitials(ctx.name),
    memberId: null, // schéma zatím nemá pole na členské číslo
    status: org.status,
    email: ctx.email,
    phone: null, // schéma zatím nemá pole na telefon zákazníka
  };
}

// --- Objednávky -----------------------------------------------------

// Datum se ukládá bez known času (jen kalendářní den) na 12:00 UTC (viz
// migrace), aby formátování bylo nezávislé na časové zóně serverless
// funkce. Zobrazujeme přes UTC gettery ze stejného důvodu.
function formatCzechDate(date: Date): string {
  return `${date.getUTCDate()}. ${date.getUTCMonth() + 1}. ${date.getUTCFullYear()}`;
}

function formatMonthKey(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

export async function getCustomerOrders(
  ctx: NonNullAuthContext,
  organizationId: string
): Promise<Order[]> {
  await assertOrgAccess(ctx, organizationId, "read");

  // Dashboard zatím zobrazuje jen uhrazené objednávky — Order["status"]
  // (typ sdílený s mock/customer.ts a OrderCard.tsx) zná jen "Uhrazeno".
  const orderRows = await db
    .select({
      id: orders.id,
      orderedAt: orders.orderedAt,
      totalKc: orders.totalKc,
      invoiceNumber: invoices.invoiceNumber,
    })
    .from(orders)
    .leftJoin(invoices, eq(invoices.orderId, orders.id))
    .where(and(eq(orders.buyerOrganizationId, organizationId), eq(orders.status, "paid")))
    .orderBy(desc(orders.orderedAt));

  const result: Order[] = [];
  for (const row of orderRows) {
    const items = await db
      .select({
        name: orderItems.name,
        quantity: orderItems.quantity,
        priceKc: orderItems.unitPriceKc,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, row.id));

    result.push({
      id: row.id,
      orderNumber: `Faktura č. ${row.invoiceNumber ?? row.id}`,
      date: formatCzechDate(row.orderedAt),
      monthKey: formatMonthKey(row.orderedAt),
      items,
      products: items.map((item) => `${item.quantity}× ${item.name}`).join(", "),
      totalKc: row.totalKc,
      status: "Uhrazeno",
    });
  }

  return result;
}

// --- Partnerský program: měsíční obrat ------------------------------

// Stejné pravidlo jako dřív v mock/customer.ts: počítá se jen uhrazená
// hodnota zboží za AKTUÁLNÍ kalendářní měsíc (podle hodin serveru), ne
// napevno zapsaný měsíc.
export function getCurrentMonthlyPurchase(customerOrders: Order[]): number {
  const monthKey = formatMonthKey(new Date());
  return customerOrders
    .filter((order) => order.monthKey === monthKey)
    .reduce((sum, order) => sum + order.totalKc, 0);
}
