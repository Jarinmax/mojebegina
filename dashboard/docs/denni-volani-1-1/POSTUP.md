# Denní volání 1.1: postup nasazení

Stav: **PŘIPRAVENO, NESPUŠTĚNO.** V Production DB nic nezměněno a nic nenasazeno.
Integrace podle `ETAPA0_INTEGRACE_VETVI.md`, krok B. Navazuje na Google Kalendář
(`docs/google-kalendar/POSTUP.md`, migrace 0025), který musí jít první.

## Co se nasazuje

- **Migrace 0026:** nullable sloupec `daily_call_queue.resulting_activity_id` s cizím
  klíčem na `lead_activity` (`ON DELETE SET NULL`). Staré vyřízené položky zůstávají
  NULL a nic se zpětně nedopočítává.
- **Kód:**
  - karta kontaktu ve frontě ukazuje poslední 3 záznamy, fázi a další kontakt;
  - vyřízené položky se přesouvají do sekce „Dnes vyřízeno“;
  - potvrzení „Výsledek uložen“ přežije obnovení stránky;
  - potvrzení i karta „Dnes vyřízeno“ rozlišují nový, zachovaný a výslovně smazaný termín.

## Pořadí (Neon SQL Editor, nejdřív Preview větev, pak Production `main`)

| # | Soubor | Očekáváno v Production |
|---|---|---|
| 0 | celý postup Google Kalendáře (migrace 0025 a převod K8) | viz `docs/google-kalendar/POSTUP.md` |
| 1 | `10_pred.sql` | `ne \| ano` |
| 2 | `11_migrace_0026.sql` | NOTICE „sloupec … založen“ |
| 3 | `12_po.sql` | `ano \| 0 \| 1` |
| 4 | **nasazení kódu** (sloučení PR do `main` → Vercel) | — |

Migrace 0026 se sama zastaví, pokud ještě neproběhla 0025.

## Ověření po nasazení

- **Denní volání:** zapsat výsledek. Položka se přesune do „Dnes vyřízeno“ s poznámkou a
  výsledkem a potvrzení zůstane vidět.
- **Prázdný termín:** potvrzení ukáže „Další kontakt beze změny: …“ (pokud lead termín měl).
- **„Smazat naplánovaný další kontakt“:** potvrzení i karta ukážou „Naplánovaný kontakt smazán“.
- `12_po.sql` po prvním zápisu: `vazeb` > 0.

## Návrat

1. Kód: revert PR.
2. Migrace: `19_navrat.sql`. Zastaví se, dokud existují vazby. Jejich smazání je vědomé
   rozhodnutí, postup je v hlavičce skriptu. Zápisy hovorů v `lead_activity` zůstávají vždy.
