"use client";

import { useState, useTransition } from "react";
import { setCustomerPayLaterAllowedAction } from "../../actions";

// Lucie 26. 11. 2026: do Výroby a expedice jdou jen zaplacené objednávky.
// Výjimka: stálý zákazník, který platí hotově při předání nebo na fakturu.
export default function PayLaterToggle({ organizationId, allowed }: { organizationId: string; allowed: boolean }) {
  const [value, setValue] = useState(allowed);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <label className="flex gap-3 items-start cursor-pointer">
      <input
        type="checkbox"
        checked={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setValue(next);
          setError(null);
          start(async () => {
            const r = await setCustomerPayLaterAllowedAction(organizationId, next);
            if (r && "error" in r && r.error) {
              setValue(!next);
              setError(r.error);
            }
          });
        }}
        className="mt-0.5 w-5 h-5 accent-emerald-700"
      />
      <span>
        <span className="block text-sm font-medium text-begina-primary-900">Stálý zákazník — vyrábět i před zaplacením</span>
        <span className="block text-xs text-neutral-600">
          Objednávky placené hotově při předání nebo na fakturu půjdou rovnou do Výroby. Ostatní zákazníci se do výroby dostanou až po zaplacení.
        </span>
        {error && <span className="block text-xs text-red-700">{error}</span>}
      </span>
    </label>
  );
}
