"use client";

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm">
      Vytisknout účtenku
    </button>
  );
}
