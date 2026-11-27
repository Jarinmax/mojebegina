"use client";

import { useSyncExternalStore } from "react";
import { formatQuantity, type ItemUnit } from "@/lib/receptury/recipes";

/** Jen to, co potřebuje výroba — žádné ceny (nedostanou se ani do prohlížeče). */
export type ProductionItem = { name: string; quantity: number; unit: ItemUnit };

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

function useChecked(key: string) {
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
  return { done, toggle, reset: () => save([]) };
}

/** Zaškrtávací políčko — na první pohled je vidět, že se na řádek dá klepnout. */
function Box({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 text-base font-bold ${
        checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-neutral-400 bg-white text-transparent group-hover:border-begina-primary-900"
      }`}
    >
      ✓
    </span>
  );
}

const rowClass = (checked: boolean) =>
  `group flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left shadow-sm transition-colors cursor-pointer ${
    checked ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-neutral-200 bg-white text-neutral-900 hover:border-begina-primary-900 hover:bg-begina-primary-50"
  }`;

function Progress({ done, total, label, doneLabel, onReset }: { done: number; total: number; label: string; doneLabel: string; onReset: () => void }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="mb-2 flex items-center gap-3 text-sm">
      <span className={`whitespace-nowrap font-semibold ${done === total ? "text-emerald-700" : "text-neutral-800"}`}>
        {done === total ? doneLabel : `${done} z ${total} ${label}`}
      </span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200">
        <span className="block h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </span>
      {done > 0 && (
        <button type="button" onClick={onReset} className="whitespace-nowrap rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-neutral-900 hover:border-begina-primary-300">
          Začít znovu
        </button>
      )}
    </div>
  );
}

export function IngredientChecklist({ storageKey, items, count }: { storageKey: string; items: ProductionItem[]; count: number }) {
  const { done, toggle, reset } = useChecked(`receptura-hotovo:${storageKey}:${count}`);
  return (
    <div>
      <p className="mb-2 text-sm text-neutral-600">👆 Klepni na surovinu, až ji dáš do hrnce – zezelená.</p>
      <Progress done={done.length} total={items.length} label="surovin v hrnci" doneLabel="✓ Všechny suroviny jsou v hrnci" onReset={reset} />
      <ol className="grid gap-2 sm:grid-cols-2 sm:grid-flow-col" style={{ gridTemplateRows: `repeat(${Math.ceil(items.length / 2)}, auto)` }}>
        {items.map((item, index) => {
          const isDone = done.includes(index);
          return (
            <li key={index}>
              <button type="button" onClick={() => toggle(index)} aria-pressed={isDone} className={rowClass(isDone)}>
                <Box checked={isDone} />
                <QuantityCell text={formatQuantity(item.quantity * count, item.unit)} />
                <span className={`min-w-0 break-words text-[15px] ${isDone ? "line-through decoration-emerald-700/40" : ""}`}>{item.name}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Postup výroby — kroky se odškrtávají stejně jako suroviny (nezávisle na počtu begin). */
export function StepsChecklist({ storageKey, steps }: { storageKey: string; steps: string[] }) {
  const { done, toggle, reset } = useChecked(`receptura-postup:${storageKey}`);
  return (
    <div>
      <Progress done={done.length} total={steps.length} label="kroků hotovo" doneLabel="✓ Postup hotový" onReset={reset} />
      <ol className="flex flex-col gap-2">
        {steps.map((step, index) => {
          const isDone = done.includes(index);
          return (
            <li key={index}>
              <button type="button" onClick={() => toggle(index)} aria-pressed={isDone} className={rowClass(isDone)}>
                <Box checked={isDone} />
                <span className="w-6 shrink-0 text-right font-semibold tabular-nums">{index + 1}.</span>
                <span className={`min-w-0 break-words text-[15px] ${isDone ? "line-through decoration-emerald-700/40" : ""}`}>{step}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
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
