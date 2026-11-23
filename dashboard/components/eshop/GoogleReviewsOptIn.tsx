"use client";

// Zákaznické recenze Google — nabídka na stránce po objednávce.
// Nic se nenačítá ani neposílá, dokud zákazník neklikne (lib/eshop/googleReviews.ts).
import { useState } from "react";
import { Star } from "lucide-react";
import { GCR_SCRIPT_URL, type GoogleReviewsPayload } from "@/lib/eshop/googleReviews";

type GapiWindow = Window & {
  renderOptIn?: () => void;
  gapi?: { load: (name: string, cb: () => void) => void; surveyoptin: { render: (config: Record<string, unknown>) => void } };
};

export default function GoogleReviewsOptIn({ getPayload }: { getPayload: () => Promise<GoogleReviewsPayload | null> }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function start() {
    setState("loading");
    try {
      const payload = await getPayload();
      if (!payload) {
        setState("error");
        return;
      }
      const w = window as GapiWindow;
      w.renderOptIn = () => {
        w.gapi?.load("surveyoptin", () => {
          w.gapi?.surveyoptin.render({ ...payload, opt_in_style: "CENTER_DIALOG" });
        });
      };
      if (w.gapi?.surveyoptin) {
        w.renderOptIn();
      } else if (!document.getElementById("gcr-optin")) {
        const script = document.createElement("script");
        script.id = "gcr-optin";
        script.src = GCR_SCRIPT_URL;
        script.async = true;
        script.defer = true;
        script.referrerPolicy = "no-referrer";
        document.body.appendChild(script);
      }
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return <p className="mt-6 text-sm text-neutral-600">Děkujeme! Google vám po doručení pošle krátký dotazník e-mailem.</p>;
  }
  return (
    <div className="mt-6 border border-neutral-200 rounded-2xl p-5 text-sm">
      <div className="flex items-center gap-2 font-semibold">
        <Star className="w-4 h-4 text-begina-primary-900" />
        Ohodnotíte nákup u Googlu?
      </div>
      <p className="mt-1 text-neutral-600">
        Po doručení vám Google pošle e-mailem krátký dotazník k nákupu. Pomůžete tím dalším zákazníkům. Údaje (číslo objednávky a e-mail)
        Googlu předáme jen po kliknutí na tlačítko.
      </p>
      <button
        type="button"
        onClick={start}
        disabled={state === "loading"}
        className="mt-3 rounded-lg bg-begina-primary-900 text-white px-4 py-2 font-medium disabled:opacity-60"
      >
        {state === "loading" ? "Načítám…" : "Ano, chci ohodnotit"}
      </button>
      {state === "error" && <p className="mt-2 text-xs text-neutral-500">Dotazník se teď nepodařilo nabídnout. Nevadí, objednávka je v pořádku.</p>}
    </div>
  );
}
