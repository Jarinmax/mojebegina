import Link from "next/link";
import { ChevronLeft } from "lucide-react";

type PageHeaderProps = {
  title: string;
  backHref?: string;
};

export default function PageHeader({ title, backHref = "/" }: PageHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-3">
      <Link
        href={backHref}
        aria-label="Zpět"
        className="w-8 h-8 -ml-1.5 flex items-center justify-center text-neutral-600"
      >
        <ChevronLeft className="w-5 h-5" />
      </Link>
      <span className="font-medium text-base text-begina-primary-900">{title}</span>
    </div>
  );
}
