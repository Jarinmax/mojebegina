# Faktura 9260001 — návrh nápravy data vystavení (NESCHVÁLENO, nic neprovedeno)

Návrh 22. 10. 2026. Rozhoduje Lucie (odpovědná za fakturaci), případně účetní.
Do schválení se v iDokladu nic nemění. Fakturu **nemazat, nepřečíslovávat, nestornovat**.

## Zjištěný stav (Production DB MojeBegina, jen čtení 20. a 22. 10. 2026)

| | |
|---|---|
| Číslo / řada | 9260001 / E-shop Begina (7277293), ID v iDokladu 67077149 |
| Odběratel / částka | Food Fest Crew s.r.o., 12 647 Kč, VS 5215, objednávka WooCommerce 5215 |
| **Skutečné vyhotovení** | **20. 10. 2026 ve 12:13** (MojeBegina, tlačítko „Vystavit fakturu v iDokladu“, Jaroslav Viner) |
| Datum vystavení na dokladu | **19. 10. 2026** |
| DUZP / splatnost | 19. 10. 2026 / 19. 10. 2026 |
| Datum úhrady | 19. 10. 2026 (platba kartou WooPayments 19. 10. v 6:23) — správně |
| PDF zákazníkovi | 20. 10. 2026 ve 12:13:34, jen tom.herout@seznam.cz (e-mail MojeBegina, bez kopie) |

Příčina: tehdejší kód (dodnes na `main`) bral datum vystavení = den úhrady. Oprava pro
budoucí faktury je v PR #28 (datum vystavení = skutečný den vystavení; DUZP beze změny).
Číslo, řada, částka, odběratel a úhrada jsou v pořádku; nesoulad je jen v datu vystavení
(o 1 den dříve, než doklad skutečně vznikl). Begina je neplátce DPH — bez dopadu na DPH.

Okamžik vytvoření přímo v iDokladu (`Metadata.DateCreated`) ukáže „Audit číslování“
na stránce Kontrola připojení iDokladu (jen čtení) — potvrdí čas 20. 10. 2026 12:13.

## Varianty

| | Co se udělá | Pro | Proti |
|---|---|---|---|
| **A — ponechat** | Doklad beze změny; interní záznam k dokladu („vyhotoveno 20. 10. 2026 12:13 v MojeBegina, datum vystavení uvedeno dnem úhrady“) | Zákazník i iDoklad mají shodný doklad; žádný další e-mail | Datum vystavení na dokladu neodpovídá okamžiku vyhotovení |
| **B — opravit datum (doporučeno)** | V iDokladu u 9260001 změnit **jen** datum vystavení na 20. 10. 2026 (a splatnost na 20. 10., aby nebyla před vystavením); číslo, řada, částka, DUZP 19. 10. a úhrada 19. 10. beze změny; interní poznámka o opravě; zákazníkovi jednou poslat opravené PDF s vysvětlením | Doklad odpovídá skutečnosti, číslo i řada zůstávají | Zákazník má dvě verze PDF se stejným číslem — e-mail musí jasně říct, že nová nahrazuje původní |
| C — dobropis + nová faktura | Opravný doklad k 9260001 a nová faktura 9260002 | Formálně čisté | Zbytečné doklady, další číslo v řadě, zákazník páruje tři doklady — **nedoporučuji** |

Pokud účetní posoudí rozdíl 1 dne u neplátce jako nepodstatný, je přípustná varianta A.

## Postup varianty B (až po schválení Lucií)

1. iDoklad → Faktury vydané → **9260001** → Upravit:
   - Datum vystavení: **20. 10. 2026**
   - Datum splatnosti: **20. 10. 2026**
   - DUZP: **ponechat 19. 10. 2026** (dokud účetní nerozhodne o rozhodném dni plnění)
   - Poznámka (interní): „Datum vystavení opraveno z 19. 10. 2026 na 20. 10. 2026 — doklad
     vyhotoven 20. 10. 2026 ve 12:13 (MojeBegina). Číslo, částka a úhrada beze změny.“
   - Nic jiného neměnit (číslo, řada, položky, odběratel, úhrada).
2. Zkontrolovat stav „Uhrazeno“ (úhrada 19. 10. 2026) a celkem 12 647 Kč.
3. Stáhnout PDF a **jednou** poslat zákazníkovi (Lucie ze své pošty, kopie Jaroslavovi) —
   ne e-mailem z iDokladu ani z MojeBegina. Návrh textu:

   > Předmět: Opravená faktura 9260001 k objednávce 5215
   >
   > Dobrý den, pane Herout,
   > v příloze posíláme fakturu č. 9260001 k objednávce 5215 s opraveným datem vystavení
   > (20. 10. 2026 místo 19. 10. 2026). Číslo faktury, částka 12 647 Kč ani úhrada se nemění —
   > faktura je uhrazená. Původní PDF z 20. 10. prosím nahraďte tímto.
   > Děkujeme, Begina

4. MojeBegina: žádná změna v DB není potřeba (čas vystavení je tam uložen 20. 10. 2026
   12:13). Uložený otisk PDF bude patřit původní verzi — jen informativní.

## Co musí potvrdit Lucie

- variantu A, nebo B (případně s účetní),
- u B: že úprava data vystavení u již odeslané faktury je v jejich praxi přípustná,
  a kdo pošle opravené PDF,
- rozhodný den DUZP pro e-shopové faktury (den úhrady, den dodání, nebo jiný) — dokud
  nerozhodne, MojeBegina DUZP nemění.
