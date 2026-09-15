import type { ReferredCustomer } from "@/mock/referral";

const STATUS_LABEL: Record<ReferredCustomer["status"], string> = {
  invited: "Pozván",
  purchased: "Nakoupil",
};

type ReferralListProps = {
  customers: ReferredCustomer[];
};

export default function ReferralList({ customers }: ReferralListProps) {
  return (
    <div className="mb-4">
      <p className="text-sm text-neutral-500 mb-2">Doporučení zákazníci</p>

      {customers.length === 0 ? (
        <p className="text-sm text-neutral-500 bg-white border border-neutral-200 rounded-xl px-3.5 py-3">
          Zatím jste nikoho nepozvali. Sdílejte svůj kód a začněte získávat odměny.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {customers.map((customer) => (
            <div
              key={customer.id}
              className="flex items-center gap-3 bg-white border border-neutral-200 rounded-xl px-3.5 py-3"
            >
              <div className="w-8 h-8 rounded-full bg-begina-primary-100 flex items-center justify-center text-xs font-medium text-begina-primary-800 shrink-0">
                {customer.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{customer.name}</p>
                <p className="text-xs text-neutral-500">{customer.invitedAt}</p>
              </div>
              <span
                className={`text-[11px] font-medium rounded-full px-2 py-0.5 shrink-0 ${
                  customer.status === "purchased"
                    ? "bg-begina-primary-100 text-begina-primary-800"
                    : "bg-neutral-100 text-neutral-600"
                }`}
              >
                {STATUS_LABEL[customer.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
