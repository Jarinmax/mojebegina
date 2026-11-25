-- 154: Kratší úvody kategorií (Lucie 25. 11. 2026).
-- Spouštět v Neon → SQL Editor → větev main → Run.
DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;

UPDATE product_categories c SET intro = v.uvod, updated_at = now()
FROM (VALUES
  ('polevky', ARRAY[
    $t$Polévky ze zeleniny, hub, bylinek, koření a čisté filtrované vody, 100% rostlinné. Stačí ohřát.$t$,
    $t$Z třílitrové beginy s kohoutkem natočíte jen tolik, kolik potřebujete. Po otevření vydrží v lednici 14 dní.$t$]),
  ('sirupy', ARRAY[
    $t$Sirupy z bylinek, koření a třtinového cukru, bez umělých aromat a barviv.$t$,
    $t$20 ml sirupu doplňte vodou na 200 ml – studenou na limonádu, horkou na čaj. Z třílitrové beginy připravíte až 150 nápojů.$t$]),
  ('caje', ARRAY[
    $t$Hotové čaje z bylin a čajových lístků, lehce oslazené třtinovým cukrem, s citronem.$t$,
    $t$V létě s ledem, v zimě ohřáté. Po otevření vydrží v lednici 14 dní.$t$]),
  ('ovocne-napoje', ARRAY[
    $t$Z ovocných šťáv a čisté filtrované vody, bez přidaného cukru – obsahují jen přirozeně přítomné cukry z ovoce.$t$,
    $t$Nejlepší vychlazené s ledem, Malinový svařák si ohřejte. Po otevření spotřebujte do 5 dnů.$t$]),
  ('koktejly', ARRAY[
    $t$Hotové koktejly z vodky nebo vína a ovocných šťáv. Stačí nalít na led, Svařák Deluxe ohřát.$t$,
    $t$Třílitrová begina s kohoutkem vystačí až na 15 nápojů. Po otevření vydrží v lednici 14 dní.$t$])
) AS v(slug, uvod)
WHERE c.slug = v.slug
RETURNING c.name;
