"use client";

// ESHOP 1.0 — katalog se čte z DB. Když DB (nebo migrace 0012/0013 na dané
// větvi) není dostupná, zákazník uvidí srozumitelnou zprávu, ne chybu 500.
export default function EshopError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <h1 className="text-xl font-semibold mb-2">E-shop je dočasně nedostupný</h1>
      <p className="text-neutral-600 mb-6">Nepodařilo se načíst nabídku. Zkuste to prosím za chvíli.</p>
      <button
        type="button"
        onClick={reset}
        className="bg-begina-primary-900 text-white text-sm font-medium rounded-lg px-4 py-2.5"
      >
        Zkusit znovu
      </button>
    </div>
  );
}
