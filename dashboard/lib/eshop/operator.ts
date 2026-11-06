// Údaje provozovatele e-shopu — samostatně, aby je mohly použít i texty
// v content/* bez kruhového importu přes infoPages.ts.
/** Údaje provozovatele (převzaté ze stávající patičky begina.cz). */
export const OPERATOR = {
  name: "Jaroslav Viner",
  phone: "+420 774 199 975",
  phoneHref: "tel:+420774199975",
  email: "info@begina.cz",
  address: "Mostecká 273/21, 118 00 Praha 1",
  ico: "74337297",
} as const;

/**
 * Provozovna a výdejní místo e-shopu (zadání Lucie, 6. 11. 2026).
 * Odkaz na mapu hledá přímo areál Zahradnictví Jandl, Vitice 119
 * (Zahradnictví Jandl s.r.o. má sídlo na téže adrese).
 */
export const PICKUP_PLACE = {
  name: "Zahradní Bistro Begina",
  area: "areál Zahradnictví Jandl",
  address: "Vitice 119, 281 06 Vitice (okr. Kolín)",
  mapHref:
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent("Zahradnictví Jandl, Vitice 119, 281 06 Vitice"),
} as const;
