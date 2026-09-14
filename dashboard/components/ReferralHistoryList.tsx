import type { ReferralHistoryEntry } from "@/mock/referral";

type ReferralHistoryListProps = {
  entries: ReferralHistoryEntry[];
};

export default function ReferralHistoryList({ entries }: ReferralHistoryListProps) {
  return (
    <div className="mb-4">
      <p className="text-sm text-neutral-500 mb-2">Historie doporučení</p>
      <div className="flex flex-col">
        {entries.map((entry, index) => (
          <div key={entry.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="w-2 h-2 rounded-full bg-begina-primary-700 mt-1.5 shrink-0" />
              {index < entries.length - 1 && (
                <span className="flex-1 w-px bg-neutral-200" />
              )}
            </div>
            <div className="pb-4">
              <p className="text-xs text-neutral-400">{entry.date}</p>
              <p className="text-sm">{entry.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
