import Link from "next/link";
import { MONTH_NAMES } from "@/lib/ekonomika/economy";

// Výběr roku a měsíce pro Finance (Lucie 26. 11. 2026): všude od nejnovějšího
// — nejdřív letošní rok a aktuální měsíc, budoucí měsíce se neukazují.
type Props = {
  year: number;
  month: number;
  nowYear: number;
  nowMonth: number;
  minYear: number;
  href: (year: number, month: number) => string;
};

const pill = (active: boolean) =>
  `text-sm rounded-full border px-3 py-1.5 capitalize ${active ? "bg-begina-primary-900 text-begina-primary-50 border-begina-primary-900" : "bg-white text-begina-primary-900 border-neutral-300"}`;

export default function MonthPicker({ year, month, nowYear, nowMonth, minYear, href }: Props) {
  const years = Array.from({ length: Math.max(nowYear - minYear + 1, 1) }, (_, i) => nowYear - i);
  const lastMonth = year === nowYear ? nowMonth : 12;
  const months = Array.from({ length: lastMonth }, (_, i) => lastMonth - i);
  return (
    <div className="flex flex-col gap-2 mb-3">
      <div className="flex flex-wrap gap-2">
        {years.map((y) => (
          <Link key={y} href={href(y, y === nowYear ? nowMonth : 12)} className={`${pill(y === year)} px-4 py-2`}>
            {y}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {months.map((m) => (
          <Link key={m} href={href(year, m)} className={pill(m === month)} aria-current={m === month ? "true" : undefined}>
            {MONTH_NAMES[m - 1]}
          </Link>
        ))}
      </div>
    </div>
  );
}
