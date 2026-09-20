import Link from "next/link";

// Security Phase 8 — vstupní karta na dashboard ADMIN i EXECUTIVE, oba
// odkazují na stejnou /rizeni-firmy. Jediná komponenta, žádná duplikace
// mezi app/admin/page.tsx a app/executive/page.tsx.
export default function CompanyOverviewCard() {
  return (
    <Link
      href="/rizeni-firmy"
      className="block bg-white border border-neutral-200 rounded-xl p-4 mb-5 hover:border-begina-primary-300 transition-colors"
    >
      <h2 className="text-sm font-medium text-begina-primary-900">Řízení firmy</h2>
      <p className="text-sm text-neutral-500 mt-0.5">
        Struktura, strategie a systém řízení Beginy
      </p>
    </Link>
  );
}
