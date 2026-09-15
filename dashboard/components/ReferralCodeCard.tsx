"use client";

import { useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";

type ReferralCodeCardProps = {
  code: string;
  link: string;
};

export default function ReferralCodeCard({ code, link }: ReferralCodeCardProps) {
  const [copiedField, setCopiedField] = useState<"code" | "link" | null>(null);

  const copy = async (value: string, field: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // clipboard API nedostupné (např. bez HTTPS) – tiché selhání
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Begina",
          text: "Pojď se mnou k Begině a použij můj kód.",
          url: `https://${link}`,
        });
      } catch {
        // uživatel sdílení zrušil – nic neděláme
      }
    } else {
      await copy(link, "link");
    }
  };

  return (
    <div className="rounded-2xl p-4 mb-4 bg-begina-primary-800 text-begina-primary-50">
      <p className="text-xs mb-3 opacity-80">Váš partnerský kód</p>

      <div className="flex items-center justify-between bg-white/10 rounded-xl px-3.5 py-3 mb-2.5">
        <span className="text-lg font-medium tracking-wide">{code}</span>
        <button
          type="button"
          onClick={() => copy(code, "code")}
          className="flex items-center gap-1.5 text-xs font-medium bg-white/15 rounded-full px-3 py-1.5 shrink-0"
        >
          {copiedField === "code" ? (
            <>
              <Check className="w-3.5 h-3.5" /> Zkopírováno
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" /> Kopírovat
            </>
          )}
        </button>
      </div>

      <div className="flex items-center justify-between bg-white/10 rounded-xl px-3.5 py-3 mb-4">
        <span className="text-sm truncate mr-2">{link}</span>
        <button
          type="button"
          onClick={() => copy(link, "link")}
          className="flex items-center gap-1.5 text-xs font-medium bg-white/15 rounded-full px-3 py-1.5 shrink-0"
        >
          {copiedField === "link" ? (
            <>
              <Check className="w-3.5 h-3.5" /> Zkopírováno
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" /> Kopírovat
            </>
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={share}
        className="w-full flex items-center justify-center gap-2 bg-begina-accent-100 text-begina-accent-900 font-medium rounded-xl py-3"
      >
        <Share2 className="w-5 h-5" />
        Sdílet
      </button>
    </div>
  );
}
