import Image from "next/image";
import logoMark from "@/public/logo-begina-mark.png";

type MembershipCardProps = {
  name: string;
  contactName?: string;
  memberId: string | null;
  status: string | null;
};

export default function MembershipCard({
  name,
  contactName,
  memberId,
  status,
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
          <p className="text-xl font-medium text-begina-primary-900">{name}</p>
          {contactName && (
            <p className="text-sm text-neutral-600 mt-0.5">{contactName}</p>
          )}
        </div>
        <div className="flex justify-between items-end">
          <div>
            <p className="text-[11px] text-neutral-500">Členské číslo</p>
            <p className="text-sm font-medium tracking-wide text-begina-primary-900">
              {memberId ?? "Neuvedeno"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-neutral-500">Status</p>
            <p className="text-sm font-medium text-begina-primary-900">
              {status ?? "Neuvedeno"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
