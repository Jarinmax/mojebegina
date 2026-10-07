"use client";

// Kolotoč dlaždic pod obsahem stránek e-shopu (jako na begina.cz):
// kategorie nebo vybrané produkty (lib/eshop/pageCarousel.ts); sám se posouvá dokola, šipky, tečky, posun prstem (scroll-snap).
// Zastaví se při najetí myší, při fokusu klávesnicí, po dotyku, ve skryté
// záložce a úplně, když má uživatel v systému omezené animace; tlačítko
// pauzy (WCAG 2.2.2).
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import CategoryTile from "./CategoryTile";
import ProductTile from "./ProductTile";
import { AUTOPLAY_MS, nextIndex, positionFromScroll, prevIndex } from "@/lib/eshop/carousel";
import type { CarouselTile } from "@/lib/eshop/pageCarousel";

const GAP_PX = 16;

const SIZES = "(min-width: 768px) 260px, (min-width: 640px) 45vw, 62vw";

export default function EshopCarousel({ tiles, label }: { tiles: CarouselTile[]; label: string }) {
  const track = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const [last, setLast] = useState(Math.max(0, tiles.length - 1));
  const [paused, setPaused] = useState(false); // tlačítko pauzy
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touchedAt, setTouchedAt] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  const measure = useCallback(() => {
    const el = track.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return { step: 1, maxScroll: 0 };
    return { step: first.offsetWidth + GAP_PX, maxScroll: el.scrollWidth - el.clientWidth };
  }, []);

  const goTo = useCallback(
    (target: number) => {
      const el = track.current;
      if (!el) return;
      const { step, maxScroll } = measure();
      el.scrollTo({ left: Math.min(target * step, maxScroll), behavior: reducedMotion ? "auto" : "smooth" });
    },
    [measure, reducedMotion]
  );

  // Aktuální pozice podle posunu (i po posunu prstem).
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () => {
      const { step, maxScroll } = measure();
      const pos = positionFromScroll(el.scrollLeft, maxScroll, step);
      setLast(pos.last);
      setIndex(pos.index);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [measure]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const running = !paused && !hovered && !focused && !reducedMotion && last > 0;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      if (document.hidden || Date.now() - touchedAt < AUTOPLAY_MS * 2) return;
      goTo(nextIndex(index, last));
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [running, index, last, goTo, touchedAt]);

  if (tiles.length === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className="relative mt-10"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onTouchStart={() => setTouchedAt(Date.now())}
    >
      <ul
        ref={track}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tiles.map((tile, i) => (
          <li
            key={tile.key}
            aria-roledescription="slide"
            aria-label={`${i + 1} z ${tiles.length}: ${tile.name}`}
            className="snap-start shrink-0 w-[62%] sm:w-[calc((100%-1rem)/2)] md:w-[calc((100%-2rem)/3)]"
          >
            {tile.kind === "category" ? (
              <CategoryTile category={{ slug: tile.key, name: tile.name, image: tile.image }} sizes={SIZES} />
            ) : (
              <ProductTile href={tile.href} name={tile.name} image={tile.image} sizes={SIZES} />
            )}
          </li>
        ))}
      </ul>

      {last > 0 && (
        <div className="mt-2 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => goTo(prevIndex(index, last))}
            aria-label="Předchozí"
            className="p-2 rounded-full hover:bg-neutral-100"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: last + 1 }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Přejít na pozici ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className="p-1.5"
              >
                <span
                  className={`block w-2 h-2 rounded-full ${i === index ? "bg-begina-primary-900" : "bg-neutral-300"}`}
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => goTo(nextIndex(index, last))}
            aria-label="Další"
            className="p-2 rounded-full hover:bg-neutral-100"
          >
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </button>
          {!reducedMotion && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Spustit automatické posouvání" : "Pozastavit automatické posouvání"}
              className="p-2 rounded-full hover:bg-neutral-100 text-neutral-500"
            >
              {paused ? <Play className="w-4 h-4" aria-hidden="true" /> : <Pause className="w-4 h-4" aria-hidden="true" />}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
