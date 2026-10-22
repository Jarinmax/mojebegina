// Jarda – volání a provize, část 2 — čtení oznámení PŘIHLÁŠENÉHO
// obchodníka (panel "Nové nákupy", app/rizeni-firmy/obchod/page.tsx).
// Samostatný soubor od notifications.ts (zápis), aby veřejný Stripe
// webhook, který notifications.ts volá bez session, nikdy nenatáhl
// authContext/crmAuth do svého grafu — viz komentář tam.
import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { notifications } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { getAuthContext } from "./authContext";
import { requireCrmAccess } from "./crmAuth";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
};

/** Nepřečtená oznámení přihlášeného obchodníka, od nejnovějšího. */
export async function listMyUnreadNotifications(): Promise<NotificationRow[]> {
  const ctx = await getAuthContext();
  const access = requireCrmAccess(ctx);

  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      href: notifications.href,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(eq(notifications.userId, access.userId), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt))
    .limit(20);
}

/** Jen svoje oznámení — žádný parametr userId zvenku, aby šlo "přečíst" jen vlastní. */
export async function markNotificationRead(notificationId: string): Promise<void> {
  const ctx = await getAuthContext();
  const access = requireCrmAccess(ctx);

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, access.userId)));
}
