"use client";

// Horní menu e-shopu (zadání Lucie, 6. 11. 2026): stejná struktura na
// počítači, tabletu i mobilu. „Nápoje“ je tlačítko s rozbalovací nabídkou —
// otevírá se kliknutím i dotykem (na počítači také najetím myší), zavírá se
// klávesou Esc, klepnutím mimo nabídku nebo výběrem položky.
//
// Počítač (lg+): řádek v záhlaví, nabídka jako rozbalovací panel pod tlačítkem.
// Tablet a mobil: posuvný řádek pod logem; nabídka se otevře jako pruh pod
// řádkem (v posuvném řádku by se panel ořízl).
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { MenuEntry, MenuGroup } from "@/lib/eshop/homeNav";
import ShopLink from "./ShopLink";

function useDropdown() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, setOpen, rootRef };
}

function GroupButton({
  group,
  open,
  controls,
  onToggle,
  className,
}: {
  group: MenuGroup;
  open: boolean;
  controls: string;
  onToggle: () => void;
  className: string;
}) {
  return (
    <button type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle} className={className}>
      {group.label}
      <ChevronDown aria-hidden="true" className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

export default function MainNav({ entries, variant }: { entries: MenuEntry[]; variant: "desktop" | "mobile" }) {
  const { open, setOpen, rootRef } = useDropdown();
  const panelId = useId();
  const group = entries.find((e): e is MenuGroup => e.kind === "group");
  const close = () => setOpen(false);
  // Myš nabídku otevírá už najetím — kliknutí ji pak nesmí hned zavřít.
  const hoveredByMouse = useRef(false);

  if (variant === "desktop") {
    return (
      <div ref={rootRef} className="hidden lg:block">
        <nav aria-label="Hlavní menu">
          <ul className="flex items-center gap-6 xl:gap-8 text-[15px]">
            {entries.map((entry) =>
              entry.kind === "link" ? (
                <li key={entry.href}>
                  <ShopLink href={entry.href} className="hover:underline underline-offset-4 whitespace-nowrap">
                    {entry.label}
                  </ShopLink>
                </li>
              ) : (
                <li
                  key={entry.label}
                  className="relative"
                  onPointerEnter={(e) => {
                    if (e.pointerType !== "mouse") return;
                    hoveredByMouse.current = true;
                    setOpen(true);
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType !== "mouse") return;
                    hoveredByMouse.current = false;
                    setOpen(false);
                  }}
                >
                  <GroupButton
                    group={entry}
                    open={open}
                    controls={panelId}
                    onToggle={() => setOpen((v) => (hoveredByMouse.current ? true : !v))}
                    className="flex items-center gap-1 hover:underline underline-offset-4 whitespace-nowrap"
                  />
                  {/* pt-3 = most mezi tlačítkem a panelem, aby se při přejezdu myší nezavřel */}
                  <div id={panelId} hidden={!open} className="absolute left-1/2 -translate-x-1/2 top-full pt-3 z-30">
                    <ul className="min-w-[13rem] rounded-xl border border-neutral-200 bg-white shadow-lg py-2">
                      {entry.items.map((item) => (
                        <li key={item.href}>
                          <ShopLink
                            href={item.href}
                            onClick={close}
                            className="block px-4 py-2.5 hover:bg-begina-primary-50 whitespace-nowrap"
                          >
                            {item.label}
                          </ShopLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              )
            )}
          </ul>
        </nav>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="lg:hidden border-t border-neutral-100">
      <nav aria-label="Hlavní menu (mobil)">
        <ul className="flex gap-5 overflow-x-auto px-4 py-2 text-sm whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {entries.map((entry) => (
            <li key={entry.kind === "link" ? entry.href : entry.label}>
              {entry.kind === "link" ? (
                <ShopLink href={entry.href} className="inline-block py-1.5">
                  {entry.label}
                </ShopLink>
              ) : (
                <GroupButton
                  group={entry}
                  open={open}
                  controls={panelId}
                  onToggle={() => setOpen((v) => !v)}
                  className="inline-flex items-center gap-1 py-1.5"
                />
              )}
            </li>
          ))}
        </ul>
        {group && (
          <ul id={panelId} hidden={!open} className="border-t border-neutral-100 bg-begina-primary-50 px-4 py-1 text-sm">
            {group.items.map((item) => (
              <li key={item.href}>
                <ShopLink href={item.href} onClick={close} className="block py-2.5">
                  {item.label}
                </ShopLink>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </div>
  );
}
