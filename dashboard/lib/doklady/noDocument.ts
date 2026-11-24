// Lucie 24. 11. 2026: nájemné za bistro a záloha na elektřinu (Ing. Jandl) se platí
// podle nájemní smlouvy — doklad k nim nikdy nebude, takže nesmí svítit „chybí PDF“.
// Řádek bez dokladu poznáme podle poznámky („podle nájemní smlouvy“, „bez dokladu“).
export function noDocumentReason(note: string | null | undefined): string | null {
  if (!note) return null;
  if (/n[áa]jemn[íi] smlouv/i.test(note)) return "nájemní smlouva";
  if (/\bbez dokladu\b/i.test(note)) return "bez dokladu";
  return null;
}
