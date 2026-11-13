// Úložiště HACCP (13. 11. 2026) — platná příručka HACCP pro provozovnu
// Zahradní Bistro Begina, Vitice 119. Soubory leží v public/haccp/.
// Zobrazuje se jen aktuální verze — starou při aktualizaci nahraď (stejný název souboru).
export type HaccpDocument = {
  file: string;
  title: string;
  issued: string;
};

export const HACCP_DOCUMENTS: HaccpDocument[] = [
  {
    file: "HACCP_Zahradni_Bistro_Begina.pdf",
    title: "Příručka HACCP – Zahradní Bistro Begina",
    issued: "listopad 2026",
  },
];
