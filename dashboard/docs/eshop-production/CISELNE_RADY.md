# Dvě souběžné číselné řady vydaných faktur (od 20. 10. 2026)

Rozhodnutí majitele 20. 10. 2026: v agendě Begina (iDoklad, IČO 74337297) se
vydané faktury číslují ve **dvou oddělených řadách**.

| Řada | Kdo vystavuje | Čísla | Stav |
|---|---|---|---|
| výchozí řada agendy | Lucie ručně v iDokladu | `2026xxxx` (např. 20260190, 20260191) | pokračuje beze změny |
| **E-shop Begina, ID 7277293** | výhradně MojeBegina | `9{RR}{NNNN}` → 9260001, 9260002, … | od 20. 10. 2026 |

## Přechod

- **20. 10. 2026 12:13** — první doklad řady E-shop Begina: **9260001**
  (Food Fest Crew s.r.o., objednávka WooCommerce 5215, VS 5215, 12 647 Kč,
  uhrazeno; ID v iDokladu 67077149). Vystaven tlačítkem v MojeBegina (režim
  `manual`), PDF poslala MojeBegina Tomáši Heroutovi.
- Faktura 9260001 se **nemaže, nepřečíslovává a znovu neposílá**. Případná
  oprava jen dobropisem.
- Další doklad MojeBegina bude **9260002**.
- Ověřeno 20. 10. 2026 v Production DB (jen čtení): jediná faktura vystavená
  MojeBegina je 9260001 (řada 7277293, ID 67077149), číslo je v DB jednou.
  V iDokladu ověří „Kontrola připojení iDokladu“ (níže).

Datum vystavení 9260001 je 19. 10. 2026 (den úhrady) — tak se data do
20. 10. 2026 nastavovala; budoucí faktury mají datum vystavení = den
vystavení (samostatná oprava).

## Pojistky — MojeBegina nikdy nepoužije ruční řadu 2026xxxx

1. **Brána ostrého provozu** (`mode.ts`): vystavuje se jen s
   `IDOKLAD_ESHOP_SEQUENCE_ID=7277293`; jiná hodnota = brána zavřená.
2. **Kontrola iDokladu před každým vystavením** (`preflight.ts`, jen čtení):
   - řada 7277293 existuje, jmenuje se „E-shop Begina“, je pro vydané faktury
     a není výchozí (výchozí patří Lucii),
   - další číslo má formát `9RRNNNN` a rok dne vystavení (`926NNNN` v roce 2026),
   - **nově:** všechny doklady v řadě 7277293 mají číslo `9RRNNNN`, žádné číslo
     není v řadě dvakrát, poslední číslo řady je v celé agendě jen jednou
     a další číslo v agendě ještě není.
   Neprojde-li cokoli, faktura se nevystaví.
3. **Pojistka v HTTP klientovi** (`idokladHttp.ts`, nově): `POST /IssuedInvoices`
   s jinou řadou než 7277293 se zablokuje ještě před odesláním (ani token) —
   nezávisle na nastavení a na zbytku kódu.
4. **Kontrola vrácené faktury** (`issue.ts`): faktura z iDokladu musí mít
   číslo `9RRNNNN` a (nově) řadu 7277293; jinak se nevede jako vystavená,
   neoznačí se uhrazená a nic se nepošle — „nutná ruční kontrola“.
5. Čísla obou řad se nemohou potkat: ruční řada má 8 číslic (`2026xxxx`),
   řada E-shop Begina 7 číslic začínajících 9.

## Ověření (jen čtení)

MojeBegina → Objednávky → **Kontrola připojení iDokladu** → „Spustit kontrolu“.
Čekané hodnoty po 20. 10. 2026:

- Řada 7277293 „E-shop Begina“: `E-shop Begina, formát 9{RR}{NNNN}, vydané faktury, není výchozí`
- Další číslo v řadě: `9260002 (pořadí 2, …)`
- Doklady v řadě E-shop Begina: `1 doklad, poslední 9260001 (v agendě jednou); další 9260002 je volné`

Kontrola nic nezapisuje ani nerezervuje. Lucie v iDokladu nemá řadu
E-shop Begina používat; kdyby v ní vznikl ruční doklad, kontrola ho uvidí
(číslo mimo formát nebo obsazené další číslo) a MojeBegina se zastaví.
