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
