"use client";

import { Printer } from "lucide-react";

/** Tlačítko „Vytisknout“ — otevře tiskový dialog prohlížeče (na mobilu tisk / uložení do PDF). */
export default function PrintButton({ label, className }: { label: string; className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      <Printer aria-hidden="true" className="w-4 h-4" />
      {label}
    </button>
  );
}
