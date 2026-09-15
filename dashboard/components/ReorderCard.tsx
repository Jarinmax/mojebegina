import Link from "next/link";
import { RefreshCw, ChevronRight } from "lucide-react";

type ReorderCardProps = {
  summary: string;
  href: string;
};

export default function ReorderCard({ summary, href }: ReorderCardProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 bg-white border border-begina-primary-700 rounded-xl p-3.5 mb-4"
    >
      <span className="text-begina-primary-700">
        <RefreshCw className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Objednat znovu</p>
        <p className="text-xs text-neutral-500 truncate">{summary}</p>
      </div>
      <span className="text-neutral-400">
        <ChevronRight className="w-4 h-4" />
      </span>
    </Link>
  );
}
