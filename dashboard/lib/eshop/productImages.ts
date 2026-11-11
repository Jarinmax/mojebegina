// Fotografie na bílém podkladu (polévky a sirupy od 10. 11. 2026). Zobrazují se celé
// (object-contain) — žádné ořezání misky ani sáčku. Volné místo kolem
// fotky v nečtvercových rámečcích (karta kategorie, posuvný přehled) má barvu
// okraje dané fotografie, aby nevznikl viditelný rámeček ani bílý pruh.
// Barva = medián pixelů na okraji fotky (změřeno při převodu z PNG do JPEG,
// fotografie samotné se nijak neupravují).
//
// Fotky, které tu nejsou (tmavé snímky ostatních kategorií), zůstávají
// beze změny: object-cover jako dosud.
const BACKDROP: Record<string, string> = {
  "/eshop/polevky/dynova-polevka-miska.jpg": "#fefefe",
  "/eshop/polevky/dynova-polevka-sacek.jpg": "#fcfbfc",
  "/eshop/polevky/kulajda-miska.jpg": "#fafafb",
  "/eshop/polevky/kulajda-sacek.jpg": "#faf8fb",
  "/eshop/polevky/rajcatova-polevka-miska.jpg": "#fefefe",
  "/eshop/polevky/rajcatova-polevka-sacek.jpg": "#fefefe",
  "/eshop/polevky/rajcatova-polevka-s-cervenou-repou-miska.jpg": "#fefefe",
  "/eshop/polevky/rajcatova-polevka-s-cervenou-repou-sacek.jpg": "#fefefe",
  "/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-miska.jpg": "#fdfdfd",
  "/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-sacek.jpg": "#fdfcfd",
  "/eshop/polevky/spenatova-polevka-miska.jpg": "#f9f7f9",
  "/eshop/polevky/spenatova-polevka-sacek.jpg": "#f8f6f7",
  "/eshop/sirupy/bylinny-sirup-saman-hlavni.jpg": "#fefefe",
  "/eshop/sirupy/bylinny-sirup-saman-sacek.jpg": "#fefefe",
  "/eshop/sirupy/bylinny-sirup-saman-doypack.jpg": "#fefefe",
  "/eshop/sirupy/zazvorovy-sirup-hlavni.jpg": "#fefefe",
  "/eshop/sirupy/zazvorovy-sirup-sacek.jpg": "#fefefe",
  "/eshop/sirupy/zazvorovy-sirup-doypack.jpg": "#fefefe",
  "/eshop/sirupy/lipovy-sirup-hlavni.jpg": "#fefefe",
  "/eshop/sirupy/lipovy-sirup-sacek.jpg": "#fefefe",
  "/eshop/sirupy/lipovy-sirup-doypack.jpg": "#fefefe",
  "/eshop/sirupy/ibiskovy-sirup-hlavni.jpg": "#fefefe",
  "/eshop/sirupy/ibiskovy-sirup-sacek.jpg": "#fefefe",
  "/eshop/sirupy/ibiskovy-sirup-doypack.jpg": "#fefefe",
  "/eshop/sirupy/sipkovy-sirup-hlavni.jpg": "#fefefe",
  "/eshop/sirupy/sipkovy-sirup-sacek.jpg": "#fefefe",
  "/eshop/sirupy/sipkovy-sirup-doypack.jpg": "#fefefe",
  "/eshop/sirupy/hermankovy-sirup-hlavni.jpg": "#fefefe",
  "/eshop/sirupy/hermankovy-sirup-sacek.jpg": "#fefefe",
  "/eshop/sirupy/hermankovy-sirup-doypack.jpg": "#fefefe",
  "/eshop/sirupy/medunkovy-sirup-s-levanduli-hlavni.jpg": "#fefefe",
  "/eshop/sirupy/medunkovy-sirup-s-levanduli-sacek.jpg": "#fefefe",
  "/eshop/sirupy/medunkovy-sirup-s-levanduli-doypack.jpg": "#fefefe",
};

/** Barva podkladu pro fotku na bílém pozadí; null = běžná fotka (ořez na rámeček). */
export function imageBackdrop(url: string | null | undefined): string | null {
  if (!url) return null;
  return BACKDROP[url.split("?")[0]] ?? null;
}
