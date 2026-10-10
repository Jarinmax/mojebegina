import { Building2, KeyRound, Receipt, Sofa, type LucideIcon } from "lucide-react";

export type AreaId = "reality" | "interior" | "pronajmy" | "begina";

export interface Area {
  id: AreaId;
  title: string;
  description: string;
  icon: LucideIcon;
  items: string[];
}

export const areas: Area[] = [
  {
    id: "reality",
    title: "Reality",
    description: "Nemovitosti a jednotky",
    icon: Building2,
    items: ["Nemovitosti", "Podlaží", "Jednotky", "Klienti", "Dokumenty"],
  },
  {
    id: "interior",
    title: "Interior design",
    description: "Klienti a realizace",
    icon: Sofa,
    items: ["Klienti", "Projekty", "Místnosti", "Návrhy", "Realizace"],
  },
  {
    id: "pronajmy",
    title: "Pronájmy",
    description: "Havelská a další byty",
    icon: KeyRound,
    items: ["Havelská", "Nájemník", "Platby", "Opravy", "Dokumenty"],
  },
  {
    id: "begina",
    title: "Begina",
    description: "Účetnictví a administrativa",
    icon: Receipt,
    items: ["Faktury", "Náklady", "Platby", "Smlouvy", "Úkoly"],
  },
];
