"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Progress, QuantityCell, rowClass } from "@/app/rizeni-firmy/recepty/[slug]/IngredientChecklist";
import { progressAction, setMarkAction } from "../actions";

type Status = "ok" | "saving" | "error";

// Várka (Jarin 27. 11. 2026): každé klepnutí se hned uloží do databáze.
// Každých 5 s se stav znovu načte, takže dvě okna / počítač a mobil ukazují
// totéž. Když se uložení nepovede, řádek se vrátí a svítí červené upozornění.
export function RunChecklist({
  runId,
  items,
  steps,
  initialItems,
  initialSteps,
  readOnly,
}: {
  runId: string;
  items: { name: string; qty: string }[];
  steps: string[];
  initialItems: number[];
  initialSteps: number[];
  readOnly: boolean;
}) {
  const [doneItems, setDoneItems] = useState(initialItems);
  const [doneSteps, setDoneSteps] = useState(initialSteps);
  const [status, setStatus] = useState<Status>("ok");
  const pending = useRef(0);

  const refresh = useCallback(async () => {
    if (pending.current > 0) return;
    try {
      const p = await progressAction(runId);
      if (p && pending.current === 0) {
        setDoneItems(p.doneItems);
        setDoneSteps(p.doneSteps);
        setStatus((s) => (s === "error" ? s : "ok"));
      }
    } catch {
      // bez internetu — zkusí se znovu za chvíli
    }
  }, [runId]);

  useEffect(() => {
    if (readOnly) return;
    const timer = window.setInterval(refresh, 5000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, readOnly]);

  async function mark(kind: "item" | "step", index: number) {
    if (readOnly) return;
    const list = kind === "item" ? doneItems : doneSteps;
    const setList = kind === "item" ? setDoneItems : setDoneSteps;
    const done = !list.includes(index);
    const before = list;
    setList(done ? [...list, index] : list.filter((n) => n !== index));
    pending.current += 1;
    setStatus("saving");
    try {
      const p = await setMarkAction(runId, kind, index, done);
      if (!p) throw new Error("neuloženo");
      pending.current -= 1;
      if (pending.current === 0) {
        setDoneItems(p.doneItems);
        setDoneSteps(p.doneSteps);
      }
      setStatus("ok");
    } catch {
      pending.current -= 1;
      setList(before);
      setStatus("error");
    }
  }

  return (
    <div>
      <SaveBadge status={status} readOnly={readOnly} />
      <h2 className="mt-3 text-lg font-semibold">Suroviny</h2>
      {!readOnly && <p className="mb-2 text-sm text-neutral-600">👆 Klepni na surovinu, až ji dáš do hrnce – zezelená a hned se uloží.</p>}
      <Progress done={doneItems.length} total={items.length} label="surovin v hrnci" doneLabel="✓ Všechny suroviny jsou v hrnci" />
      <ol className="grid gap-2 sm:grid-cols-2 sm:grid-flow-col" style={{ gridTemplateRows: `repeat(${Math.ceil(items.length / 2)}, auto)` }}>
        {items.map((item, index) => {
          const isDone = doneItems.includes(index);
          return (
            <li key={index}>
              <button type="button" disabled={readOnly} onClick={() => mark("item", index)} aria-pressed={isDone} className={rowClass(isDone)}>
                <Box checked={isDone} />
                <QuantityCell text={item.qty} />
                <span className={`min-w-0 break-words text-[15px] ${isDone ? "line-through decoration-emerald-700/40" : ""}`}>{item.name}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {steps.length > 0 && (
        <>
          <h2 className="mt-6 text-lg font-semibold">Postup</h2>
          <div className="mt-2">
            <Progress done={doneSteps.length} total={steps.length} label="kroků hotovo" doneLabel="✓ Postup hotový" />
            <ol className="flex flex-col gap-2">
              {steps.map((step, index) => {
                const isDone = doneSteps.includes(index);
                return (
                  <li key={index}>
                    <button type="button" disabled={readOnly} onClick={() => mark("step", index)} aria-pressed={isDone} className={rowClass(isDone)}>
                      <Box checked={isDone} />
                      <span className="w-6 shrink-0 text-right font-semibold tabular-nums">{index + 1}.</span>
                      <span className={`min-w-0 break-words text-[15px] ${isDone ? "line-through decoration-emerald-700/40" : ""}`}>{step}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}

function SaveBadge({ status, readOnly }: { status: Status; readOnly: boolean }) {
  if (readOnly) return null;
  if (status === "error")
    return (
      <p className="rounded-lg border-2 border-red-500 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
        ⚠ Poslední klepnutí se NEULOŽILO — zkontroluj internet a klepni znovu.
      </p>
    );
  return (
    <p className={`text-sm ${status === "saving" ? "text-neutral-500" : "text-emerald-700"}`}>
      {status === "saving" ? "Ukládám…" : "✓ Uloženo v MojeBegině – uvidíš to na jakémkoli zařízení"}
    </p>
  );
}
