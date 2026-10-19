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
import { invoices, orderItems, organizationMemberships, organizations, orders, userProfiles } from "@/lib/db/schema";
import { requireAdmin } from "./adminAuth";
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

  // Security Phase 9 — uživatel s víc rolemi a bez platné volby aktivní
  // role musí nejdřív zvolit, ne dostat "nejlepší odhad" bez zeptání (viz
  // ctx.roleSelectionRequired v lib/data/authContext.ts).
  if (ctx.roleSelectionRequired) {
    redirect("/vyber-roli");
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

type CustomerContact = { name: string | null; email: string | null };

// Bez kontroly přístupu — volají ji JEN hlídané vstupy níže
// (getCustomerAccount pro zákazníka, getCustomerPortalPreviewForAdmin).
async function loadCustomerAccount(organizationId: string, contact: CustomerContact): Promise<CustomerAccount | null> {
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
  if (!org) return null;

  // Kontaktní jméno/e-mail: u zákazníka z ověřené session (ctx), v admin
  // náhledu z profilu zákaznického účtu organizace. Neon Auth má jen jedno
  // pole "name", takže příjmení se nikdy neodvozuje (zůstává null).
  return {
    companyName: org.name,
    ico: org.ico,
    registeredAddress: org.registeredAddress,
    contactFirstName: contact.name ?? "Zákazník",
    contactLastName: null,
    initials: deriveInitials(contact.name),
    memberId: null, // schéma zatím nemá pole na členské číslo
    status: org.status,
    email: contact.email,
    phone: null, // schéma zatím nemá pole na telefon zákazníka
  };
}

export async function getCustomerAccount(
  ctx: NonNullAuthContext,
  organizationId: string
): Promise<CustomerAccount> {
  await assertOrgAccess(ctx, organizationId, "read");
  const account = await loadCustomerAccount(organizationId, { name: ctx.name, email: ctx.email });
  if (!account) {
    throw new Error("Organizace nenalezena");
  }
  return account;
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
  return loadCustomerOrders(organizationId);
}

// Bez kontroly přístupu — viz loadCustomerAccount.
async function loadCustomerOrders(organizationId: string): Promise<Order[]> {
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
    .where(and(eq(orders.buyerOrganizationId, organizationId), eq(orders.paymentStatus, "paid")))
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

// --- Administrátorský náhled zákaznické karty -------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CustomerPortalPreview = {
  organizationId: string;
  account: CustomerAccount;
  orders: Order[];
  /** zákaznický účet, jehož jménem karta mluví (první člen); null = organizace zatím bez účtu */
  previewContact: { name: string | null; email: string } | null;
};

/**
 * Data zákaznické karty vybrané organizace pro ADMINa — STEJNÉ funkce
 * načítání jako pro zákazníka (loadCustomerAccount / loadCustomerOrders),
 * jen jiná brána: nejdřív ADMIN z ověřené session, teprve potom čtení.
 * Žádná impersonace: session zůstává ADMIN, nic se nezapisuje, cookie se
 * nemění. Id z URL samo o sobě nic neotevře.
 */
export async function getCustomerPortalPreviewForAdmin(organizationId: string): Promise<CustomerPortalPreview | null> {
  const ctx = requireAdmin(await getAuthContext());
  if (!UUID_RE.test(organizationId)) return null;

  const [contact] = await db
    .select({ name: userProfiles.name, email: userProfiles.email })
    .from(organizationMemberships)
    .leftJoin(userProfiles, eq(userProfiles.userId, organizationMemberships.userId))
    .where(eq(organizationMemberships.organizationId, organizationId))
    .orderBy(asc(organizationMemberships.createdAt))
    .limit(1);
  const previewContact = contact?.email ? { name: contact.name, email: contact.email } : null;

  const account = await loadCustomerAccount(organizationId, { name: previewContact?.name ?? null, email: previewContact?.email ?? null });
  if (!account) return null;
  const orders = await loadCustomerOrders(organizationId);

  // Bezpečnostní stopa: aplikace nemá obecný auditní log (jen agent_audit_log
  // pro ChatGPT), proto zatím jen strukturovaný záznam do logů Vercelu.
  console.info(
    JSON.stringify({ event: "admin_customer_preview", adminUserId: ctx.userId, organizationId, at: new Date().toISOString() })
  );
  return { organizationId, account, orders, previewContact };
}

// --- Partnerský program: měsíční obrat ------------------------------
// Čistá funkce (bez DB) v customerOrderMath.ts — používá ji i sdílená
// prezentační komponenta karty.
export { getCurrentMonthlyPurchase } from "./customerOrderMath";
