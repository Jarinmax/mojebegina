import Link from "next/link";
import type { NotificationRow } from "@/lib/data/notificationsInbox";
import { markNotificationReadAction } from "./actions";

// Jarda – volání a provize, část 2 — "Po zaplacené objednávce mu v
// MojeBegina vznikne oznámení o nákupu" — tohle je to oznámení (jen
// interní záznam, žádný e-mail). "Přečtení" je samostatný server action
// bez prevState (viz actions.ts) — po revalidaci položka zmizí sama,
// žádný klientský stav není potřeba.
export default function NewPurchaseNotifications({ notifications }: { notifications: NotificationRow[] }) {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-begina-accent-100 rounded-xl p-4 mt-3">
      <p className="text-sm font-medium text-begina-primary-900 mb-2">Nové nákupy</p>
      <div className="flex flex-col gap-2">
        {notifications.map((n) => (
          <div key={n.id} className="flex items-start justify-between gap-2 text-sm">
            <Link href={n.href ?? "#"} className="text-begina-primary-900 hover:underline">
              {n.body}
            </Link>
            <form action={markNotificationReadAction.bind(null, n.id)}>
              <button type="submit" className="text-xs text-neutral-400 hover:text-begina-primary-900 whitespace-nowrap">
                Přečteno
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
