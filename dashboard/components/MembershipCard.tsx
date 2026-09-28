import Image from "next/image";
import logoMark from "@/public/logo-begina-mark.png";
import EshopLink from "@/components/EshopLink";

type MembershipCardProps = {
  name: string;
  contactName?: string;
  memberId: string | null;
  status: string | null;
  /** Tlačítko „Nakoupit / E-shop“ dole na kartě (cíl viz lib/eshopLink.ts). */
  showShopLink?: boolean;
};

export default function MembershipCard({
  name,
  contactName,
  memberId,
  status,
  showShopLink = false,
}: MembershipCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-4 mb-4 bg-white border border-neutral-200 shadow-sm">
      <div className="absolute inset-0">
        <Image
          src={logoMark}
          alt=""
          fill
          sizes="200px"
          className="object-contain object-right opacity-[0.08] pointer-events-none select-none"
        />
      </div>

      <div className="relative z-10">
        <p className="text-xs mb-1 text-neutral-500">Moje Begina · členská karta</p>
        <div className="mb-3">
          <p className="text-xl font-medium text-begina-primary-900 break-words">{name}</p>
          {contactName && (
            <p className="text-sm text-neutral-600 mt-0.5 break-words">{contactName}</p>
          )}
        </div>
        <div className="flex flex-wrap justify-between items-end gap-x-3 gap-y-2">
          <div className="min-w-0">
            <p className="text-[11px] text-neutral-500">Členské číslo</p>
            <p className="text-sm font-medium tracking-wide text-begina-primary-900 break-words">
              {memberId ?? "Neuvedeno"}
            </p>
          </div>
          <div className="text-right min-w-0">
            <p className="text-[11px] text-neutral-500">Status</p>
            <p className="text-sm font-medium text-begina-primary-900 break-words">
              {status ?? "Neuvedeno"}
            </p>
          </div>
        </div>
        {showShopLink && (
          <div className="mt-4">
            <EshopLink label="Nakoupit / E-shop" variant="card" />
          </div>
        )}
      </div>
    </div>
  );
}
