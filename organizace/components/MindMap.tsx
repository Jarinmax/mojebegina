"use client";

import { useState } from "react";
import { areas, type AreaId } from "@/lib/areas";

// Souřadnice v procentech kontejneru — SVG čáry používají stejný souřadný
// systém (viewBox 0–100, preserveAspectRatio="none"), takže konce čar vždy
// přesně dosednou na střed uzlu bez ohledu na skutečné rozměry kontejneru.
const desktopPositions: Record<AreaId, { top: number; left: number }> = {
  reality: { top: 9, left: 50 },
  interior: { top: 50, left: 88 },
  pronajmy: { top: 91, left: 50 },
  begina: { top: 50, left: 12 },
};

export default function MindMap() {
  const [selected, setSelected] = useState<AreaId | null>(null);

  const toggle = (id: AreaId) => {
    setSelected((current) => (current === id ? null : id));
  };

  const selectedArea = areas.find((area) => area.id === selected) ?? null;

  return (
    <div className="w-full">
      {/* Tablet a desktop: prostorová myšlenková mapa kolem centrálního uzlu */}
      <div className="hidden md:block">
        <div className="relative mx-auto h-[560px] w-full max-w-3xl lg:h-[620px]">
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {areas.map((area) => {
              const pos = desktopPositions[area.id];
              const isSelected = selected === area.id;
              return (
                <line
                  key={area.id}
                  x1={50}
                  y1={50}
                  x2={pos.left}
                  y2={pos.top}
                  vectorEffect="non-scaling-stroke"
                  className={
                    isSelected
                      ? "stroke-lucie-accent-400 transition-colors duration-300"
                      : "stroke-lucie-200 transition-colors duration-300"
                  }
                  strokeWidth={1.5}
                />
              );
            })}
          </svg>

          <div className="absolute left-1/2 top-1/2 z-10 flex h-40 w-40 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-lucie-200 bg-white text-center shadow-sm lg:h-44 lg:w-44">
            <span className="text-lg font-semibold tracking-tight text-lucie-900">Lucie</span>
            <span className="mt-1 text-xs text-lucie-500">Čistá hlava</span>
          </div>

          {areas.map((area) => {
            const pos = desktopPositions[area.id];
            const isSelected = selected === area.id;
            const Icon = area.icon;
            return (
              <button
                key={area.id}
                type="button"
                onClick={() => toggle(area.id)}
                aria-expanded={isSelected}
                aria-controls="mindmap-panel"
                style={{ top: `${pos.top}%`, left: `${pos.left}%` }}
                className={`absolute z-10 w-48 -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-4 text-left shadow-sm transition-all duration-200 hover:border-lucie-accent-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucie-accent-200 ${
                  isSelected
                    ? "border-lucie-accent-400 shadow-md ring-1 ring-lucie-accent-200"
                    : "border-lucie-200"
                }`}
              >
                <Icon
                  className={isSelected ? "h-5 w-5 text-lucie-accent-600" : "h-5 w-5 text-lucie-600"}
                  strokeWidth={1.75}
                />
                <div className="mt-2 text-sm font-medium text-lucie-900">{area.title}</div>
                <div className="mt-0.5 text-xs text-lucie-500">{area.description}</div>
              </button>
            );
          })}
        </div>

        <div
          id="mindmap-panel"
          className={`mx-auto grid max-w-2xl transition-[grid-template-rows] duration-300 ease-out ${
            selectedArea ? "mt-8 grid-rows-[1fr]" : "mt-0 grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            {selectedArea && (
              <div className="rounded-2xl border border-lucie-200 bg-white p-6">
                <div className="text-sm font-medium text-lucie-900">{selectedArea.title}</div>
                <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {selectedArea.items.map((item) => (
                    <li
                      key={item}
                      className="rounded-lg border border-lucie-100 bg-lucie-50 px-3 py-2 text-sm text-lucie-700"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobil: uzly přehledně pod sebou */}
      <div className="space-y-3 md:hidden">
        <div className="rounded-2xl border border-lucie-200 bg-white p-5 text-center">
          <div className="text-lg font-semibold text-lucie-900">Lucie</div>
          <div className="mt-1 text-xs text-lucie-500">Čistá hlava</div>
        </div>

        {areas.map((area) => {
          const isSelected = selected === area.id;
          const Icon = area.icon;
          return (
            <div key={area.id} className="rounded-2xl border border-lucie-200 bg-white">
              <button
                type="button"
                onClick={() => toggle(area.id)}
                aria-expanded={isSelected}
                aria-controls={`panel-${area.id}`}
                className="flex min-h-[64px] w-full items-center gap-4 p-4 text-left"
              >
                <Icon
                  className={isSelected ? "h-5 w-5 shrink-0 text-lucie-accent-600" : "h-5 w-5 shrink-0 text-lucie-600"}
                  strokeWidth={1.75}
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-lucie-900">{area.title}</div>
                  <div className="mt-0.5 text-xs text-lucie-500">{area.description}</div>
                </div>
              </button>
              <div
                id={`panel-${area.id}`}
                className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                  isSelected ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="overflow-hidden">
                  <ul className="space-y-1.5 border-t border-lucie-100 px-4 pb-4 pt-3">
                    {area.items.map((item) => (
                      <li
                        key={item}
                        className="min-h-11 rounded-lg bg-lucie-50 px-3 py-2.5 text-sm text-lucie-700"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
