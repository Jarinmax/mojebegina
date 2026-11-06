import Link from "next/link";
import type { WorkNotification } from "@/lib/data/workTasks";
import { markWorkNotificationsReadAction } from "./actions";
import { fmtDateTime } from "./workTaskLabels";

// Práce 2.0 — trvale uložená upozornění (tabulka notifications) přímo v
// MojeBegina: nepřečtená nahoře zvýrazněná; „Označit jako přečtené“ je
// obyčejné tlačítko (formulář na serverovou akci).
export default function NotificationsPanel({ items }: { items: WorkNotification[] }) {
  const unread = items.filter((n) => !n.read);
  if (items.length === 0) return null;
  return (
    <details className="rounded-xl border border-blue-200 bg-white px-4 py-3" open={unread.length > 0}>
      <summary className="text-sm font-medium text-begina-primary-900 cursor-pointer">
        Upozornění {unread.length > 0 ? `(${unread.length} nových)` : ""}
      </summary>
      <ul className="mt-2 flex flex-col gap-2">
        {items.slice(0, 10).map((n) => (
          <li key={n.id} className={`rounded-lg px-3 py-2 ${n.read ? "bg-neutral-50" : "bg-blue-50"}`}>
            <Link href={n.href ?? "/prace"} className="block">
              <p className={`text-sm ${n.read ? "text-neutral-600" : "font-medium text-begina-primary-900"}`}>{n.title}</p>
              <p className="text-sm text-neutral-600">{n.body}</p>
              <p className="text-xs text-neutral-400">{fmtDateTime(n.createdAt)}</p>
            </Link>
          </li>
        ))}
      </ul>
      {unread.length > 0 && (
        <form action={markWorkNotificationsReadAction} className="mt-2">
          <button type="submit" className="min-h-11 text-sm font-medium text-blue-700 underline">
            Označit vše jako přečtené
          </button>
        </form>
      )}
    </details>
  );
}
