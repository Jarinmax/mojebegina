import PageHeader from "@/components/PageHeader";
import DecorativeMark from "@/components/DecorativeMark";
import ReferralCodeCard from "@/components/ReferralCodeCard";
import ReferralStats from "@/components/ReferralStats";
import ReferralList from "@/components/ReferralList";
import ReferralHistoryList from "@/components/ReferralHistoryList";
import BottomNav from "@/components/BottomNav";
import { bottomNavItems } from "@/mock/customer";
import {
  referralProfile,
  referredCustomers,
  referralStats,
  referralHistory,
} from "@/mock/referral";

export default function Page() {
  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
      <DecorativeMark />
      <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24 relative z-10">
        <PageHeader title="Doporučte Beginu" />

        <p className="text-sm text-neutral-500 mb-4">
          Pozvěte přátele k Begině. Slevy a odměny níže jsou zatím
          placeholder — doplníme je podle pravidel partnerského programu.
        </p>

        <ReferralCodeCard code={referralProfile.code} link={referralProfile.link} />

        <ReferralStats
          invitedCount={referralStats.invitedCount}
          purchasedCount={referralStats.purchasedCount}
        />

        <ReferralList customers={referredCustomers} />
        <ReferralHistoryList entries={referralHistory} />
      </div>

      <BottomNav items={bottomNavItems} activeHref="/doporucit" />
    </div>
  );
}
