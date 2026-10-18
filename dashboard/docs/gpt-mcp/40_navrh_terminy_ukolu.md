# Návrh změny schématu: termíny v Živé mapě firmy a u CEO projektů

**Stav:** jen návrh ke schválení — NEIMPLEMENTOVÁNO, žádná migrace.

## Proč
Otázky typu „Jaké úkoly jsou po termínu a kdo za ně odpovídá?“ dnes nejdou
zodpovědět: `company_nodes` ani `focus_projects` nemají termín. Asistent
proto zatím vrací náhradu — stav (červená/oranžová), prioritu a stagnaci
(bez aktivity N dní).

## Navržená změna (aditivní, bez dopadu na existující data)
- `company_nodes.due_date date NULL` — termín tématu/úkolu (kalendářní den v Praze).
- `focus_projects.due_date date NULL` — termín CEO projektu.
- Zápis do historie při změně termínu: `company_node_activity.kind = 'due_date_set'`,
  `focus_project_activity.kind = 'due_date_set'` (metadata: `from`, `to`).
- Index `company_nodes (due_date) WHERE archived_at IS NULL AND due_date IS NOT NULL`.

## Dopady
- UI: pole „Termín“ v detailu tématu a CEO projektu, zvýraznění po termínu.
- Asistent: předvolba `overdue` v `list_company_tasks` a `list_focus_projects`,
  počet úkolů po termínu v `get_executive_overview`.
- Migrace: další volné číslo až po sloučení skladu, Kalendáře a Denního
  volání 1.1 (viz pořadí v reportu); návrat = `DROP COLUMN` obou sloupců.

## Otevřené otázky
1. Má mít termín jen list (téma), nebo i oblast/podoblast?
2. Má se „po termínu“ promítat do automatického stavu (statusPropagation)?
3. Kdo smí termín měnit — odpovědná osoba, nebo jen ADMIN/EXECUTIVE?
