import type { ActionState } from "./actions";

// Jednoznačné potvrzení / chyba po uložení formuláře objednávky.
export default function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  if ("error" in state) {
    return (
      <p role="alert" className="text-xs text-begina-accent-700">
        {state.error}
      </p>
    );
  }
  return (
    <p role="status" className="text-xs text-emerald-700">
      {state.success}
    </p>
  );
}
