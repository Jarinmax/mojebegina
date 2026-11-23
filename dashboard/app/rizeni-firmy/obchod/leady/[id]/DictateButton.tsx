"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// Hlasový zápis po hovoru (Lucie 22. 11. 2026): obchodník po hovoru nadiktuje
// až 2 minuty, co bylo domluveno, a text se vloží do „Co bylo domluveno“.
// Používá rozpoznávání řeči přímo v prohlížeči (Safari na iPhonu/Macu,
// Chrome) — žádná nahrávka se nikam neukládá ani neposílá do MojeBegina,
// do systému jde jen výsledný text, který obchodník ještě může opravit.
// Nahrává se jen jeho diktát po hovoru, nikdy ne samotný hovor.

const MAX_MS = 2 * 60 * 1000;

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => {};

export default function DictateButton({ onText }: { onText: (text: string) => void }) {
  const supported = useSyncExternalStore(noopSubscribe, () => getRecognitionCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(MAX_MS / 1000);
  const recRef = useRef<Recognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(0);
  // Uživatel chce diktovat (dokud neklikne „Hotovo“ nebo nevyprší čas).
  const wantRef = useRef(false);
  // Text aktuální relace rozpoznávání — zapíše se do pole až na jejím konci,
  // takže se neztratí ani věty, které Safari nestihne označit jako hotové.
  const sessionTextRef = useRef("");
  const sessionCountRef = useRef(0);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  useEffect(() => () => finish(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function commitSession() {
    const text = sessionTextRef.current.trim();
    sessionTextRef.current = "";
    if (text) onTextRef.current(text);
  }

  // 22. 11. 2026 (Jarin: „nahrála se jen půlka“): Safari rozpoznávání samo
  // ukončí po pauze nebo zhruba po minutě a nedokončenou větu zahodí.
  // Proto (1) text relace ukládáme celý i s rozpracovanou částí a
  // (2) dokud uživatel neklikne „Hotovo“, rozpoznávání hned znovu spustíme.
  function finish() {
    wantRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const rec = recRef.current;
    recRef.current = null;
    try {
      rec?.stop();
    } catch {
      // už neběží
    }
    commitSession();
    setListening(false);
    setLive("");
  }

  function startSession() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "cs-CZ";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      if (recRef.current !== rec) return;
      // Celý stav relace z kompletního seznamu výsledků (Safari je někdy
      // posílá znovu) — hotové věty + rozpracovaná část.
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      sessionTextRef.current = text;
      setLive(text);
    };
    rec.onerror = (e) => {
      if ((e.error === "not-allowed" || e.error === "service-not-allowed") && sessionCountRef.current > 1) {
        // Obnovení po pauze prohlížeč nepustil — text zůstává, stačí kliknout znovu.
        finish();
        setError("Diktování se po pauze zastavilo. Co jsi řekl, je v poli — klikni znovu a pokračuj.");
      } else if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        finish();
        setError(
          "Mikrofon není povolený, nic se nenahrálo. V Safari: nahoře Safari → Nastavení pro moje.begina.cz → Mikrofon → Povolit. Na iPhonu: Nastavení → Safari → Mikrofon → Povolit."
        );
      }
      // no-speech / aborted / network: relace skončí a onend ji obnoví.
    };
    rec.onend = () => {
      if (recRef.current !== rec) return;
      commitSession();
      setLive("");
      const left = MAX_MS - (Date.now() - startedRef.current);
      if (wantRef.current && left > 1500) {
        try {
          startSession();
          return;
        } catch {
          // spadne do finish níže
        }
      }
      finish();
    };
    recRef.current = rec;
    sessionCountRef.current += 1;
    rec.start();
  }

  function start() {
    if (!getRecognitionCtor()) return;
    setError(null);
    setLive("");
    sessionTextRef.current = "";
    sessionCountRef.current = 0;
    wantRef.current = true;
    startedRef.current = Date.now();
    setSecondsLeft(MAX_MS / 1000);
    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((MAX_MS - (Date.now() - startedRef.current)) / 1000));
      setSecondsLeft(left);
      if (left <= 0) finish();
    }, 500);
    try {
      startSession();
      setListening(true);
    } catch {
      finish();
      setError("Diktování se nepodařilo spustit — zkus to znovu.");
    }
  }

  if (!supported) {
    return (
      <p className="text-xs text-neutral-500">
        🎤 Diktovat jde v Safari nebo Chrome. Na iPhonu můžeš místo psaní klepnout na mikrofon na klávesnici.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={listening ? finish : start}
        className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${
          listening ? "bg-red-600 text-white" : "border border-begina-primary-900 bg-white text-begina-primary-900"
        }`}
      >
        {listening
          ? `⏹ Hotovo (zbývá ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")})`
          : "🎤 Nadiktovat zápis (až 2 minuty)"}
      </button>
      {listening && (
        <p className="text-xs text-neutral-600">
          Mluv klidně i s pauzami — nic se neztratí, text se vkládá do pole „Co bylo domluveno“.{live && <span className="italic"> {live}</span>}
        </p>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
