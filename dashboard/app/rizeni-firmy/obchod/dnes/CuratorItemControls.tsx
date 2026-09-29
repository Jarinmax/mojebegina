import { removeQueueItemAction, moveQueueItemUpAction, moveQueueItemDownAction } from "./actions";

// Security Phase 19 (Denní volání 1.0) — kurátorské ovládání jedné
// položky. Bez "use client" — jednoduché fire-and-forget formuláře se
// serverovou akcí bez argumentů z formData (bind na itemId), stejný vzor
// jako app/rizeni-firmy/ceo/[id]/page.tsx (aktivní/neaktivní přepínač).
export default function CuratorItemControls({
  itemId,
  isFirst,
  isLast,
}: {
  itemId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="flex items-center gap-2 pt-1 border-t border-neutral-100">
      <form action={moveQueueItemUpAction.bind(null, itemId)}>
        <button
          type="submit"
          disabled={isFirst}
          className="text-xs font-medium text-neutral-600 border border-neutral-200 rounded-lg px-2 py-1 disabled:opacity-30"
        >
          ↑ Výš
        </button>
      </form>
      <form action={moveQueueItemDownAction.bind(null, itemId)}>
        <button
          type="submit"
          disabled={isLast}
          className="text-xs font-medium text-neutral-600 border border-neutral-200 rounded-lg px-2 py-1 disabled:opacity-30"
        >
          ↓ Níž
        </button>
      </form>
      <form action={removeQueueItemAction.bind(null, itemId)} className="ml-auto">
        <button type="submit" className="text-xs font-medium text-begina-accent-700 px-2 py-1">
          Odebrat
        </button>
      </form>
    </div>
  );
}
