"use client";

import { useEffect, useState, type ReactNode } from "react";

// Záložky na informační stránce (Doprava a platba: Česká republika / Slovensko,
// Lucie 22. 11. 2026 — Slovák nemá procházet český ceník a naopak).
// Odkaz s #slovensko otevře rovnou záložku Slovensko.
export default function InfoTabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (tabs.some((tab) => tab.id === id)) setActive(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  const choose = (id: string) => {
    setActive(id);
    try {
      window.history.replaceState(null, "", `#${id}`);
    } catch {
      /* nevadí */
    }
  };

  return (
    <div>
      <div role="tablist" aria-label="Země doručení" className="flex gap-1 rounded-full bg-neutral-100 p-1 w-full sm:w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => choose(tab.id)}
            className={`flex-1 sm:flex-none rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              active === tab.id ? "bg-white text-begina-primary-900 shadow-sm" : "text-neutral-600 hover:text-begina-primary-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} hidden={active !== tab.id} className="mt-6">
          {tab.content}
        </div>
      ))}
    </div>
  );
}
