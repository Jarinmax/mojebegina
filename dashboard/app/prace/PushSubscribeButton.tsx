"use client";

import { useEffect, useState } from "react";

// Jarda — upozornění na naplánovaný hovor 1.0. Jediné tlačítko: zapnout/
// vypnout push upozornění na TOMTO zařízení. Bez NEXT_PUBLIC_VAPID_PUBLIC_KEY
// (není zatím nastavené ve Vercelu) se tlačítko sama skryje — nemá smysl
// nabízet akci, která by jen skončila chybou.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

type Status = "checking" | "unsupported" | "off" | "denied" | "on" | "busy";

function computeInitialStatus(): Status {
  if (!VAPID_PUBLIC_KEY || typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") {
    return "denied";
  }
  return "checking";
}

export default function PushSubscribeButton() {
  const [status, setStatus] = useState<Status>(computeInitialStatus);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "checking") return;
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setStatus(sub ? "on" : "off");
    });
  }, [status]);

  async function enable() {
    setError(null);
    setStatus("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("save-failed");
      setStatus("on");
    } catch {
      setError("Upozornění se nepodařilo zapnout. Zkuste to prosím znovu.");
      setStatus("off");
    }
  }

  async function disable() {
    setError(null);
    setStatus("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch {
      setError("Upozornění se nepodařilo vypnout. Zkuste to prosím znovu.");
      setStatus("on");
    }
  }

  if (status === "unsupported" || status === "checking") return null;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex flex-col gap-2">
      {status === "denied" && (
        <p className="text-sm text-begina-primary-900">
          Upozornění na hovory jsou v telefonu blokovaná. Povolte je v nastavení prohlížeče pro tuto stránku.
        </p>
      )}
      {status !== "denied" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-begina-primary-900">
            {status === "on" ? "Upozornění na naplánované hovory jsou zapnutá na tomto telefonu." : "Dostávat upozornění na naplánované hovory?"}
          </p>
          {status === "on" ? (
            <button type="button" onClick={disable} className="min-h-11 shrink-0 text-sm font-medium text-blue-700 underline">
              Vypnout
            </button>
          ) : (
            <button
              type="button"
              onClick={enable}
              disabled={status === "busy"}
              className="min-h-11 shrink-0 rounded-lg bg-begina-primary-900 px-4 text-sm font-medium text-begina-primary-50 disabled:opacity-50"
            >
              Zapnout
            </button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
