import type { FocusPriority, FocusStatus } from "@/lib/data/ceoFocusValidation";

export const PRIORITY_LABELS: Record<FocusPriority, string> = {
  low: "Nízká priorita",
  medium: "Střední priorita",
  high: "Vysoká priorita",
  critical: "Kritická priorita",
};

export const STATUS_LABELS: Record<FocusStatus, string> = {
  green: "V pořádku",
  amber: "Pozor",
  red: "Blocker",
};
