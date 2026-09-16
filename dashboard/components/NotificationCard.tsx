import Link from "next/link";
import type { NotificationItem } from "@/mock/notifications";

type NotificationCardProps = {
  notification: NotificationItem;
};

const CARD_CLASS =
  "block bg-white border border-neutral-200 rounded-xl p-3.5 mb-3";

export default function NotificationCard({
  notification,
}: NotificationCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-medium text-begina-primary-900">
          {notification.title}
        </p>
        {!notification.read && (
          <span className="w-2 h-2 rounded-full bg-begina-accent-700 mt-1.5 shrink-0" />
        )}
      </div>
      <p className="text-sm text-neutral-600">{notification.body}</p>
    </>
  );

  if (notification.href) {
    return (
      <Link href={notification.href} className={CARD_CLASS}>
        {content}
      </Link>
    );
  }

  return <div className={CARD_CLASS}>{content}</div>;
}
