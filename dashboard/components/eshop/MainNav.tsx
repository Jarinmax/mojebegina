"use client";

// Horní menu e-shopu.
//
// Počítač (lg+): řádek v záhlaví; „Nápoje“ je tlačítko s rozbalovacím
// panelem (kliknutí, dotyk i najetí myší; Esc / klepnutí mimo zavře).
//
// Mobil a tablet (do lg) — zadání majitele 9. 11. 2026: místo vodorovného
// řádku, který přetékal mimo obrazovku, ikona ☰ vedle košíku. Otevře panel
// pod záhlavím se všemi položkami pod sebou (velké dotykové plochy, min.
// 48 px); „Nápoje“ se rozbalí na místě (Čaje, Ovocné nápoje, Alkoholické
// koktejly). Panel je pevně pod záhlavím; delší menu jde posunout uvnitř panelu, stránka pod ním stojí.
// Zavře se křížkem, klepnutím na ztmavené pozadí, klávesou Esc nebo
// výběrem položky.
import { ChevronDown, Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { MenuEntry, MenuGroup, MenuLink } from "@/lib/eshop/homeNav";
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

/** Odkaz menu: e-shopový přes ShopLink (begina.cz / moje.begina.cz/eshop), vnější přímo. */
function EntryLink({ link, className, onClick, children }: { link: MenuLink; className: string; onClick?: () => void; children?: ReactNode }) {
  if (link.external) {
    return (
      <a href={link.href} className={className} onClick={onClick}>
        {children ?? link.label}
      </a>
    );
  }
  return (
    <ShopLink href={link.href} className={className} onClick={onClick}>
      {children ?? link.label}
    </ShopLink>
  );
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

function DesktopNav({ entries }: { entries: MenuEntry[] }) {
  const { open, setOpen, rootRef } = useDropdown();
  const panelId = useId();
  const close = () => setOpen(false);
  // Myš nabídku otevírá už najetím — kliknutí ji pak nesmí hned zavřít.
  const hoveredByMouse = useRef(false);
  return (
    <div ref={rootRef} className="hidden lg:block min-w-0">
      <nav aria-label="Hlavní menu">
        <ul className="flex items-center gap-5 xl:gap-8 text-[15px]">
          {entries.map((entry) =>
            entry.kind === "link" ? (
              <li key={entry.href}>
                <EntryLink link={entry} className="hover:underline underline-offset-4 whitespace-nowrap" />
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
                        <EntryLink link={item} onClick={close} className="block px-4 py-2.5 hover:bg-begina-primary-50 whitespace-nowrap" />
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

function MobileNav({ entries }: { entries: MenuEntry[] }) {
  const [open, setOpen] = useState(false);
  const [drinksOpen, setDrinksOpen] = useState(false);
  const panelId = useId();
  const drinksId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  // horní okraj panelu = spodek záhlaví (nad ním může být lišta náhledu)
  const [top, setTop] = useState(64);

  const close = () => {
    setOpen(false);
    setDrinksOpen(false);
  };

  // Přechod na jinou stránku menu zavře (i tlačítkem Zpět v prohlížeči).
  useEffect(() => {
    setOpen(false);
    setDrinksOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setDrinksOpen(false);
        buttonRef.current?.focus();
      }
    };
    const measure = () => {
      const header = buttonRef.current?.closest("header");
      if (header) setTop(Math.max(0, Math.round(header.getBoundingClientRect().bottom)));
    };
    measure();
    window.addEventListener("resize", measure);
    // Stránka pod otevřeným menu se neposouvá; posouvá se jen panel.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  const row = "flex w-full items-center justify-between min-h-12 px-5 py-3 text-base text-begina-primary-900 active:bg-begina-primary-50";

  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Zavřít menu" : "Otevřít menu"}
        onClick={() => (open ? close() : setOpen(true))}
        className="relative z-30 -mr-2 flex h-12 w-12 items-center justify-center rounded-lg text-begina-primary-900 active:bg-begina-primary-50"
      >
        {open ? <X className="w-6 h-6" aria-hidden="true" /> : <Menu className="w-6 h-6" aria-hidden="true" />}
      </button>
      {open && (
        <>
          {/* ztmavené pozadí pod panelem — klepnutí menu zavře */}
          <div aria-hidden="true" onClick={close} style={{ top }} className="fixed inset-x-0 bottom-0 z-20 bg-black/30" />
          <nav
            id={panelId}
            aria-label="Menu"
            style={{ top, maxHeight: `calc(100dvh - ${top}px)` }}
            className="fixed inset-x-0 z-30 overflow-y-auto overscroll-contain border-t border-neutral-200 bg-white shadow-lg"
          >
            <ul className="divide-y divide-neutral-100 pb-[env(safe-area-inset-bottom)]">
              {entries.map((entry) =>
                entry.kind === "link" ? (
                  <li key={entry.href}>
                    <EntryLink link={entry} onClick={close} className={row} />
                  </li>
                ) : (
                  <li key={entry.label}>
                    <button
                      type="button"
                      aria-expanded={drinksOpen}
                      aria-controls={drinksId}
                      onClick={() => setDrinksOpen((v) => !v)}
                      className={row}
                    >
                      {entry.label}
                      <ChevronDown aria-hidden="true" className={`w-5 h-5 transition-transform ${drinksOpen ? "rotate-180" : ""}`} />
                    </button>
                    <ul id={drinksId} hidden={!drinksOpen} className="bg-begina-primary-50/60 pb-1">
                      {entry.items.map((item) => (
                        <li key={item.href}>
                          <EntryLink
                            link={item}
                            onClick={close}
                            className="flex w-full items-center min-h-12 pl-9 pr-5 py-3 text-base text-begina-primary-900 active:bg-begina-primary-50"
                          />
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              )}
            </ul>
          </nav>
        </>
      )}
    </div>
  );
}

export default function MainNav({ entries, variant }: { entries: MenuEntry[]; variant: "desktop" | "mobile" }) {
  return variant === "desktop" ? <DesktopNav entries={entries} /> : <MobileNav entries={entries} />;
}
