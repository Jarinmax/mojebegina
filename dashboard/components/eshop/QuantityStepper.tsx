"use client";

import { Minus, Plus } from "lucide-react";
import { MAX_QUANTITY_PER_LINE } from "@/lib/eshop/cart";

type QuantityStepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  label: string;
};

export default function QuantityStepper({ value, onChange, min = 1, label }: QuantityStepperProps) {
  return (
    <div className="inline-flex items-center border border-neutral-200 rounded-lg bg-white" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label="Ubrat"
        className="w-9 h-9 flex items-center justify-center text-begina-primary-900 disabled:text-neutral-300"
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="w-8 text-center text-sm font-medium text-begina-primary-900 tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= MAX_QUANTITY_PER_LINE}
        aria-label="Přidat"
        className="w-9 h-9 flex items-center justify-center text-begina-primary-900 disabled:text-neutral-300"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
