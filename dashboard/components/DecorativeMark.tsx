import Image from "next/image";
import logoMark from "@/public/logo-begina-mark.png";

/**
 * Velké, tlumené "B" na pozadí obrazovky — vychází ze stejného
 * souboru jako logo v headeru (public/logo-begina-mark.png), jen
 * zvětšené, oříznuté okrajem obrazovky a s nízkou průhledností.
 * Tvar ani proporce loga se nijak nemění.
 */
export default function DecorativeMark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none select-none absolute -top-8 -right-16"
    >
      <Image
        src={logoMark}
        alt=""
        priority
        className="w-[380px] h-auto opacity-[0.12]"
      />
    </div>
  );
}
