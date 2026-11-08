// MojeBegina → e-shop: „Objednat znovu“ (a „Nový nákup“ s údaji karty).
//
// /objednat-znovu/<id objednávky> — košík s položkami té objednávky,
// /objednat-znovu/novy            — prázdný košík, jen předvyplněné údaje.
//
// Ověří přihlášení a členství na kartě (stejně jako historie objednávek),
// vydá krátkodobý podepsaný pas (lib/eshop/customerHandoff.ts) a přesměruje
// do košíku e-shopu. Pas je v části adresy za „#“ — prohlížeč ji neposílá
// na server ani v Refereru.
import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, organizationMemberships } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/data/authContext";
import { assertOrgAccess } from "@/lib/data/organizations";
import { handoffSecret, signHandoff } from "@/lib/eshop/customerHandoff";
import { eshopAbsoluteUrl } from "@/lib/eshop/paths";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, ctx: RouteContext<"/objednat-znovu/[orderId]">) {
  const { orderId } = await ctx.params;
  const isNew = orderId === "novy";
  if (!isNew && !UUID_RE.test(orderId)) return new NextResponse("Nenalezeno", { status: 404 });

  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/objednat-znovu/${orderId}`)}`, request.url));
  }

  let organizationId: string | null = null;
  if (isNew) {
    const [membership] = await db
      .select({ organizationId: organizationMemberships.organizationId })
      .from(organizationMemberships)
      .where(eq(organizationMemberships.userId, auth.userId))
      .orderBy(asc(organizationMemberships.createdAt))
      .limit(1);
    organizationId = membership?.organizationId ?? null;
  } else {
    const [order] = await db
      .select({ organizationId: orders.buyerOrganizationId })
      .from(orders)
      .where(and(eq(orders.id, orderId)))
      .limit(1);
    organizationId = order?.organizationId ?? null;
  }
  if (!organizationId) return new NextResponse("Objednávka nebyla nalezena.", { status: 404 });

  // stejné oprávnění jako historie objednávek karty — člen karty, nikdo jiný
  try {
    await assertOrgAccess(auth, organizationId, "read");
  } catch {
    return new NextResponse("Objednávka nebyla nalezena.", { status: 404 });
  }
  const [member] = await db
    .select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.userId, auth.userId), eq(organizationMemberships.organizationId, organizationId)))
    .limit(1);
  // pas jen pro skutečného člena karty (ne admin/vedení s přístupem napříč kartami)
  if (!member) return new NextResponse("Objednávat za tuto kartu může jen její člen.", { status: 403 });

  const secret = handoffSecret();
  if (!secret) return new NextResponse("Opakované objednávání teď není dostupné.", { status: 503 });
  const token = signHandoff({ userId: auth.userId, organizationId, reorderOrderId: isNew ? null : orderId }, secret);
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${eshopAbsoluteUrl(origin, "/kosik")}#prevzit=${token}`, 303);
}
