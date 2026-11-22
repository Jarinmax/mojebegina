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
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(MAX_MS / 1000);
  const recRef = useRef<Recognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(0);
  // Vždy nejnovější onText (rozpoznávání běží déle než jeden render).
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    recRef.current?.stop();
  }

  function start() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    setError(null);
    setInterim("");
    const rec = new Ctor();
    rec.lang = "cs-CZ";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (finalText.trim()) onTextRef.current(finalText.trim());
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Prohlížeč nemá povolený mikrofon — povol ho v nastavení a zkus to znovu.");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setError("Diktování se přerušilo — co se stihlo přepsat, je v poli. Můžeš pokračovat znovu.");
      }
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
    recRef.current = rec;
    startedRef.current = Date.now();
    setSecondsLeft(MAX_MS / 1000);
    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((MAX_MS - (Date.now() - startedRef.current)) / 1000));
      setSecondsLeft(left);
      if (left <= 0) stop();
    }, 500);
    rec.start();
    setListening(true);
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
        onClick={listening ? stop : start}
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
          Mluv — text se průběžně vkládá do pole „Co bylo domluveno“.{interim && <span className="italic"> {interim}</span>}
        </p>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
