"use client";

import { useSyncExternalStore } from "react";
import { formatQuantity, type RecipeItem } from "@/lib/receptury/recipes";

// Odškrtávání při výrobě (Lucie 27. 11. 2026): klepnutím na řádek zezelená —
// surovina už je v hrnci. Stav se pamatuje v tomto prohlížeči pro danou
// recepturu a počet begin, takže nezmizí ani po obnovení stránky.
const LOCAL_EVENT = "receptura-hotovo";

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "[]";
  } catch {
    return "[]";
  }
}

function parse(raw: string): number[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(LOCAL_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LOCAL_EVENT, callback);
  };
}

export function IngredientChecklist({ storageKey, items, count }: { storageKey: string; items: RecipeItem[]; count: number }) {
  const key = `receptura-hotovo:${storageKey}:${count}`;
  const raw = useSyncExternalStore(subscribe, () => read(key), () => "[]");
  const done = parse(raw);

  const save = (next: number[]) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // bez paměti prohlížeče se stav neuloží
    }
    window.dispatchEvent(new Event(LOCAL_EVENT));
  };
  const toggle = (index: number) => save(done.includes(index) ? done.filter((n) => n !== index) : [...done, index]);
  const left = items.length - done.length;

  return (
    <>
      <ol className="bg-white border border-neutral-200 rounded-xl p-1 sm:columns-2 sm:gap-x-6">
        {items.map((item, index) => {
          const isDone = done.includes(index);
          return (
            <li key={index} className="break-inside-avoid py-0.5">
              <button
                type="button"
                onClick={() => toggle(index)}
                aria-pressed={isDone}
                className={`flex w-full items-baseline gap-3 rounded-lg px-2 py-1.5 text-left ${isDone ? "bg-emerald-100 text-emerald-900" : "hover:bg-neutral-50 text-neutral-900"}`}
              >
                <span className="w-5 shrink-0 text-center">{isDone ? "✓" : <span className="text-neutral-300">○</span>}</span>
                <QuantityCell text={formatQuantity(item.quantity * count, item.unit)} />
                <span className={`min-w-0 break-words text-[15px] ${isDone ? "line-through decoration-emerald-700/40" : ""}`}>{item.ingredient.name}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex items-center justify-between gap-3 text-sm">
        <span className={left === 0 ? "font-medium text-emerald-700" : "text-neutral-600"}>
          {left === 0 ? "✓ Všechno je v hrnci" : `Zbývá ${left} z ${items.length} surovin · klepnutím na řádek odškrtneš`}
        </span>
        {done.length > 0 && (
          <button type="button" onClick={() => save([])} className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-neutral-900 hover:border-begina-primary-300">
            Začít znovu
          </button>
        )}
      </div>
    </>
  );
}

/** „1 175 g (1,175 kg)“ → tučně 1 175 g, pod tím drobně 1,175 kg — ať se nepřekrývá s názvem. */
function QuantityCell({ text }: { text: string }) {
  const match = text.match(/^(.*?) \((.*)\)$/);
  return (
    <span className="w-24 shrink-0 text-right tabular-nums">
      <span className="block whitespace-nowrap text-[15px] font-semibold">{match ? match[1] : text}</span>
      {match && <span className="block whitespace-nowrap text-xs font-normal opacity-70">{match[2]}</span>}
    </span>
  );
}
