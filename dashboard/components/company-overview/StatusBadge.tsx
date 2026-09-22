// Security Phase 12 (Řízení firmy 2.0) — vizuální odznak stavu, sdílený
// mezi kartami uzlů a detailem. Barvy podle standardní sémantiky
// semaforu, nezávislé na begina-* brand tokenech (ty jsou pro UI chrome).
type Status = "green" | "amber" | "red";

const LABELS: Record<Status, string> = {
  green: "V pořádku",
  amber: "Pozor",
  red: "Vyžaduje zásah",
};

const CLASSES: Record<Status, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
};

const DOT_CLASSES: Record<Status, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

type Props = {
  status: Status;
  className?: string;
};

export default function StatusBadge({ status, className }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium border rounded-full px-2 py-0.5 ${CLASSES[status]} ${className ?? ""}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${DOT_CLASSES[status]}`} />
      {LABELS[status]}
    </span>
  );
}
