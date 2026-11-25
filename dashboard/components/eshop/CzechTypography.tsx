"use client";

// Celý e-shop: za jednopísmennými předložkami a spojkami nezalomitelná mezera,
// aby „z“, „v“, „a“ … nevisely na konci řádku (Lucie 25. 11. 2026). Běží po
// hydrataci nad textem stránky a hlídá i později změněný obsah (košík, filtry),
// takže platí pro texty z DB i z kódu bez úprav jednotlivých stránek.
import { useLayoutEffect } from "react";
import { czechNbsp } from "@/lib/eshop/typography";

const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE", "NOSCRIPT"]);

function fixNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement;
    if (!parent || SKIP.has(parent.tagName) || parent.isContentEditable) return;
    const value = node.nodeValue ?? "";
    if (!/[AaIiKkOoSsUuVvZz] /.test(value)) return;
    const fixed = czechNbsp(value);
    if (fixed !== value) node.nodeValue = fixed;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || SKIP.has((node as Element).tagName)) return;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) fixNode(n);
}

export default function CzechTypography() {
  useLayoutEffect(() => {
    const root = document.querySelector("[data-eshop]") ?? document.body;
    fixNode(root);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") fixNode(record.target);
        else record.addedNodes.forEach(fixNode);
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
