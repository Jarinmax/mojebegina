"use client";

// Košík: převzetí pasu z MojeBegina („Objednat znovu“). Naplní košík
// položkami objednávky (jen to, co jde dnes koupit) a zapamatuje si pas
// pro předvyplnění pokladny údaji karty.
import { useEffect, useState } from "react";
import { replaceCart } from "./useCart";
import { storeHandoff, takeHandoffFromHash, useCustomerHandoff } from "./useCustomerHandoff";
import { acceptHandoffAction } from "@/app/eshop/kosik/handoffActions";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; organizationName: string; skipped: string[]; reorder: boolean; empty: boolean }
  | { kind: "error"; error: string };

export default function HandoffIntake() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const active = useCustomerHandoff();

  useEffect(() => {
    const token = takeHandoffFromHash();
    if (!token) return;
    let cancelled = false;
    setState({ kind: "loading" });
    acceptHandoffAction(token)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setState({ kind: "error", error: result.error });
          return;
        }
        storeHandoff(token);
        if (result.reorder) replaceCart(result.lines);
        setState({ kind: "done", organizationName: result.organizationName, skipped: result.skipped, reorder: result.reorder, empty: result.lines.length === 0 });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error", error: "Objednávku z MojeBegina se nepodařilo načíst. Zkuste to prosím znovu." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return <p className="mb-4 text-sm text-neutral-500">Načítám objednávku z MojeBegina…</p>;
  }
  if (state.kind === "error") {
    return <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</p>;
  }
  if (state.kind === "done" && active) {
    return (
      <div className="mb-4 rounded-lg border border-begina-primary-700/30 bg-begina-primary-50 px-4 py-3 text-sm">
        <p className="font-medium text-begina-primary-900">
          {state.reorder
            ? state.empty
              ? "Z objednávky teď nejde nic objednat — vyberte prosím zboží v e-shopu."
              : "Košík jsme naplnili podle vaší předchozí objednávky. Množství můžete upravit."
            : "Nakupujete s údaji z MojeBegina."}
        </p>
        <p className="text-neutral-600 mt-0.5">Fakturační a doručovací údaje firmy {state.organizationName} předvyplníme v pokladně. Ceny jsou aktuální.</p>
        {state.skipped.length > 0 && (
          <p className="text-neutral-600 mt-1">
            Nepřidali jsme (teď nejde objednat nebo je potřeba vybrat balení): {state.skipped.join(", ")}.
          </p>
        )}
      </div>
    );
  }
  return null;
}
