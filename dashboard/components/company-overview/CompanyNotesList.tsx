import type { CompanyNote } from "@/lib/data/companyManagement";
import { formatCzechDate } from "@/lib/format";

// Security Phase 10 (Řízení firmy 1.0) — čistě prezentační výpis zápisů,
// nejnovější první (řazení už zajišťuje listCompanyNotes).
type Props = {
  notes: CompanyNote[];
};

export default function CompanyNotesList({ notes }: Props) {
  if (notes.length === 0) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
        Zatím žádný zápis.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {notes.map((note) => (
        <div key={note.id} className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-start justify-between gap-4 mb-1">
            <p className="text-sm font-medium text-begina-primary-900">{note.title}</p>
            <p className="text-xs text-neutral-400 whitespace-nowrap">
              {formatCzechDate(note.createdAt)}
            </p>
          </div>
          <p className="text-sm text-neutral-600 whitespace-pre-wrap mb-1">{note.body}</p>
          <p className="text-xs text-neutral-400">{note.authorName ?? "Neznámý autor"}</p>
        </div>
      ))}
    </div>
  );
}
