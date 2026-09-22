// Security Phase 12 (Řízení firmy 2.0) — čisté funkce pro výpočet
// automatického stavu uzlu z jeho přímých dětí a pro výběr "hlavního
// důvodu" k zobrazení na kartě (viz specifikace, schváleno s Lucy).
// Bez I/O, bez "server-only" — testovatelné stejně jako
// companyNoteValidation.ts. Skutečné čtení/zápis do DB a procházení stromu
// nahoru (propagateStatusChange) žije v lib/data/companyNodes.ts.
import type { NodePriority, NodeStatus } from "./companyNodeValidation";

export type StatusChild = {
  id: string;
  status: NodeStatus;
  priority: NodePriority;
  updatedAt: Date;
};

const SIGNIFICANT_RED_PRIORITIES: readonly NodePriority[] = ["high", "critical"];

const PRIORITY_RANK: Record<NodePriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

// Jádro propagace (specifikace §3):
//   1. červené dítě s prioritou high/critical existuje → červená
//   2. jinak existuje cokoliv nezelené → oranžová
//   3. jinak → zelená
// Uzel bez dětí (nebo v "auto" módu bez zásahu) = "aktuálně nic
// nevyžaduje zásah" → zelená. Schváleno explicitně jako pravidlo, ne
// implementační detail.
export function computeAutoStatus(children: readonly StatusChild[]): NodeStatus {
  if (children.length === 0) {
    return "green";
  }

  const hasSignificantRed = children.some(
    (child) => child.status === "red" && SIGNIFICANT_RED_PRIORITIES.includes(child.priority)
  );
  if (hasSignificantRed) {
    return "red";
  }

  const hasNonGreen = children.some((child) => child.status !== "green");
  if (hasNonGreen) {
    return "amber";
  }

  return "green";
}

// Které přímé dítě je hlavním důvodem výsledného stavu — pro Area kartu
// ("BISTRO 🔴 / Vyžaduje pozornost / Měření teplot lednic"). Mezi kandidáty
// se stejnou závažností jako výsledek vyhrává vyšší priorita, při shodě
// novější `updatedAt`. Vrací null pro zelený výsledek (není co ukazovat) i
// pro prázdný seznam dětí.
export function selectStatusDriver(
  children: readonly StatusChild[],
  resultStatus: NodeStatus
): StatusChild | null {
  if (resultStatus === "green" || children.length === 0) {
    return null;
  }

  const candidates =
    resultStatus === "red"
      ? children.filter(
          (child) => child.status === "red" && SIGNIFICANT_RED_PRIORITIES.includes(child.priority)
        )
      : children.filter((child) => child.status !== "green");

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((best, candidate) => {
    const bestRank = PRIORITY_RANK[best.priority];
    const candidateRank = PRIORITY_RANK[candidate.priority];
    if (candidateRank > bestRank) return candidate;
    if (candidateRank < bestRank) return best;
    return candidate.updatedAt > best.updatedAt ? candidate : best;
  });
}
