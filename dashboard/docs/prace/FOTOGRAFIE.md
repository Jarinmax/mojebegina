# Fotografie úkolů: nastavení úložiště (Cloudflare R2, EU)

Bez tohoto nastavení aplikace funguje dál, jen fotky jsou vypnuté. Vedoucí u úkolu
nemůže fotografii vyžadovat a na `/prace` se zobrazí „Ukládání fotografií zatím není
nastavené“. Schvalování vedoucím na fotkách nezávisí a funguje hned.

## 1. Bucket (Cloudflare dashboard → R2)

1. **Create bucket**:
   - název např. `mojebegina-prace-foto`;
   - **Location: Specify jurisdiction → European Union (EU)**.
2. V nastavení bucketu nechat **Public access vypnutý**: žádná `r2.dev` adresa a žádná
   vlastní doména. CORS není potřeba, protože nahrává jen server.
3. **Object lifecycle rules → Add rule** (retence):
   - prefix `prace/`;
   - **Delete objects after 400 days** (zhruba 13 měsíců).

## 2. Přístupový klíč (R2 → Manage R2 API Tokens → Create API token)

- Oprávnění **Object Read & Write**, **jen pro tento bucket**.
- Získáte Access Key ID a Secret Access Key. Ukládají se jen do Vercelu, nikdy do kódu
  ani do chatu.

## 3. Vercel → Settings → Environment Variables (Production, případně Preview)

| Proměnná | Hodnota |
|---|---|
| `R2_ACCOUNT_ID` | ID účtu Cloudflare (R2 → Overview) |
| `R2_ACCESS_KEY_ID` | z kroku 2 |
| `R2_SECRET_ACCESS_KEY` | z kroku 2 |
| `R2_BUCKET` | `mojebegina-prace-foto` |
| `R2_JURISDICTION` | nevyplňovat (výchozí `eu` → `https://<účet>.eu.r2.cloudflarestorage.com`) |

Po uložení proměnných je potřeba nové nasazení (Redeploy).

## Jak je to zabezpečené

- **Nahrávání:** fotka se v telefonu zmenší (max. 1600 px) a překóduje. Tím zmizí EXIF
  a GPS. Server ji pak znovu kontroluje:
  - přijme jen JPEG do 4 MB a 4096 px;
  - projde strukturu souboru;
  - odstraní všechna metadata a vše za koncem obrázku;
  - uloží pod náhodným názvem.
- **Prohlížení:** `/api/prace/foto/<id>` ověří, že jde o zaměstnance, kterému úkol
  patří, nebo o vedoucího. Pak přesměruje na podepsaný odkaz platný **5 minut**
  (vynucený `image/jpeg`, bez cache a bez referreru).
- **Mazání:** fotka odstraněná před odesláním se z úložiště smaže hned a v databázi
  zůstane jen záznam „odstraněna“. Fotky odeslané ke kontrole nebo u splněného úkolu
  jsou zamčené jako doklad a po 400 dnech je smaže pravidlo životního cyklu.
