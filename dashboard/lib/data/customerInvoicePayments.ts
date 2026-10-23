import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";
import { loadCustomerInvoiceByIco } from "@/lib/eshop/invoicing/customerInvoicePayment";
import { assertOrgAccess } from "./organizations";
import type { AuthContext } from "./types";

export async function getCustomerPayableInvoice(
  ctx: NonNullable<AuthContext>,
  organizationId: string,
  invoiceId: number
) {
  await assertOrgAccess(ctx, organizationId, "read");
  const [org] = await db
    .select({ ico: organizations.ico })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) return null;
  return loadCustomerInvoiceByIco(invoiceId, org.ico);
}
