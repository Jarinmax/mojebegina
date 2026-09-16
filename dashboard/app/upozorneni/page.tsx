import PageHeader from "@/components/PageHeader";
import DecorativeMark from "@/components/DecorativeMark";
import NotificationCard from "@/components/NotificationCard";
import BottomNav from "@/components/BottomNav";
import { bottomNavItems } from "@/mock/customer";
import { notifications } from "@/mock/notifications";

export default function Page() {
  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
      <DecorativeMark />
      <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24 relative z-10">
        <PageHeader title="Upozornění" />

        {notifications.map((notification) => (
          <NotificationCard key={notification.id} notification={notification} />
        ))}
      </div>

      <BottomNav items={bottomNavItems} activeHref="/upozorneni" />
    </div>
  );
}
