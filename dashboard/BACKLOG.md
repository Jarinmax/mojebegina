# Backlog

Menší nápady a budoucí úkoly, které nejsou součástí aktuální fáze. Ne plán, jen poznámky, ať se neztratí.

## Automatické oznámení při změně rolí uživatele

Když uživateli přibude/ubude role (dnes se dělá ručně přes SQL v Neon Console),
poslat mu automatický e-mail, např.:

> "Byla Vám udělena role EXECUTIVE (CUSTOMER role zůstává). Máte tedy v moje.begina.cz 2 role."

Předpoklady, které dnes chybí:
1. Admin UI pro správu rolí uživatele (dnes žádné neexistuje, jen ruční SQL).
2. Obecný mechanismus na posílání vlastního e-mailu — dnešní `auth.requestPasswordReset`
   (viz `lib/data/admin.ts`) je určený jen na aktivaci/reset hesla, ne na libovolné oznámení.

Nejpřirozenější místo pro tohle je součást budoucí funkce "spravovat role uživatele" v adminu,
ne samostatný úkol.
