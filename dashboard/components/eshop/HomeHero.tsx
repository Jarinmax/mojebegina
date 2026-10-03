import Image from "next/image";
import Link from "next/link";
import { Snowflake } from "lucide-react";

// Úvod e-shopu podle návrhu „Hero e-shopu Begina.cz“ (2. 10. 2026).
// Ilustrace je složená z výřezů návrhu (public/eshop/hero); krabice
// bag-in-box je oproti návrhu vyšší — obdélník na výšku (docs/eshop-design/tall_box.py).
// Pozice prvků = jejich rozmístění v návrhu; oblast 930 × 690 bodů (návrh
// 930 × 570 + 120 bodů nahoře pro vyšší krabici, ostatní prvky posunuté dolů).

type Piece = { src: string; w: number; h: number; left: number; top: number; width: number; z: number };

const PIECES: Piece[] = [
  { src: "/eshop/hero/bag-in-box.webp", w: 479, h: 700, left: 43.4, top: 0, width: 44.4, z: 1 },
  { src: "/eshop/hero/kelimek-dynova.webp", w: 217, h: 284, left: 54.5, top: 56.1, width: 22.3, z: 2 },
  { src: "/eshop/hero/miska-polevka.webp", w: 413, h: 297, left: 19.5, top: 58.5, width: 38.8, z: 3 },
  { src: "/eshop/hero/dyne.webp", w: 168, h: 148, left: 6.6, top: 70.8, width: 16.8, z: 4 },
  { src: "/eshop/hero/listky-1.webp", w: 152, h: 55, left: 1.1, top: 87.9, width: 16.7, z: 4 },
  { src: "/eshop/hero/listky-2.webp", w: 199, h: 93, left: 80.3, top: 78.1, width: 18.5, z: 4 },
  { src: "/eshop/hero/listky-3.webp", w: 151, h: 51, left: 72.9, top: 90.3, width: 16.7, z: 4 },
];

function Heart() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="inline-block w-[0.8em] h-[0.8em] ml-3 align-[-0.05em] fill-[#E4382F]">
      <path d="M12 21.6 10.6 20.3C5.4 15.6 2 12.5 2 8.7 2 5.6 4.4 3.2 7.5 3.2c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1 3.1 0 5.5 2.4 5.5 5.5 0 3.8-3.4 6.9-8.6 11.6L12 21.6Z" />
    </svg>
  );
}

export default function HomeHero({ ctaHref }: { ctaHref: string }) {
  return (
    <section className="relative overflow-hidden bg-[#FAF6EF] bg-[radial-gradient(ellipse_42%_60%_at_72%_62%,rgba(214,190,150,0.26),transparent_70%)] border-b border-[#EDE5D8]">
      <Image
        src="/eshop/hero/vetvicka.webp"
        alt=""
        width={72}
        height={332}
        className="hidden lg:block absolute left-0 top-[38%] w-[52px] h-auto opacity-80"
      />
      <div className="max-w-6xl mx-auto px-4 pt-10 pb-8 sm:pt-14 lg:py-16 grid gap-8 lg:gap-4 lg:grid-cols-[5fr_7fr] items-center">
        <div className="relative z-10 lg:pl-6">
          <h1 className="font-serif text-[2.6rem] leading-[1.08] sm:text-6xl tracking-tight text-[#2A2622] text-balance">
            <span className="block">Čerstvé polévky a&nbsp;nápoje.</span>
            <span className="block">
              Připravené s&nbsp;láskou
              <Heart />
            </span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-[#3B3631] max-w-md leading-relaxed">
            Čerstvé polévky, bylinné sirupy, čaje a ovocné nápoje z pečlivě vybraných surovin a čisté filtrované vody.
          </p>
          <Link
            href={ctaHref}
            className="mt-7 inline-flex items-center justify-center rounded-full bg-[#E2702C] hover:bg-[#C95F20] transition-colors px-12 py-3.5 text-lg text-white shadow-md shadow-[#E2702C]/25"
          >
            Vybrat si
          </Link>
          <p className="mt-6 flex items-center gap-2 text-sm text-[#5E6B34]">
            <Snowflake className="w-4 h-4" aria-hidden="true" />
            Doručujeme chlazenou přepravou
          </p>
        </div>

        <div
          className="relative w-full aspect-[930/690]"
          role="img"
          aria-label="Polévka v misce, kelímek Dýňové polévky a balení bag-in-box Begina"
        >
          {PIECES.map((piece, i) => (
            <Image
              key={piece.src}
              src={piece.src}
              alt=""
              width={piece.w}
              height={piece.h}
              priority={i < 3}
              sizes={`(min-width: 1152px) ${Math.round((piece.width / 100) * 650)}px, ${Math.round(piece.width)}vw`}
              className="absolute h-auto drop-shadow-[0_14px_14px_rgba(90,65,30,0.16)]"
              style={{ left: `${piece.left}%`, top: `${piece.top}%`, width: `${piece.width}%`, zIndex: piece.z }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
