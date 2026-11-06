-- PRÁCE 1.0 — první skutečné úkoly pro Jaroslava Blahouta, zadané
-- Jaroslavem Vinerem 27. 10. 2026. Termín = dnešní den v Europe/Prague
-- (bez hodiny — výslovně). Spouští se JEN jednou, ve stejné transakci jako
-- založení tabulek (scripts/migrate-work-tasks.mjs), nikdy znovu.
WITH new_tasks AS (
  INSERT INTO work_tasks (title, assignee_user_id, created_by, due_date, priority)
  SELECT t.title, '06240ac4-c050-47ea-998c-6c81389edf9f', 'de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c',
         (now() AT TIME ZONE 'Europe/Prague')::date, 'normal'
  FROM (VALUES
    ('Vyrobit dvě destičky: hlavní nabídka jídel a nabídka sladkostí'),
    ('Obvolat 10 klientů'),
    ('Navrhnout uspořádání prostoru před bistrem'),
    ('Navrhnout uspořádání levé strany bistra se stříškou, stolem a deštníky'),
    ('Navrhnout uspořádání zahrádky u zvířátek'),
    ('Navrhnout uspořádání prostoru se šachovým stolem')
  ) AS t(title)
  RETURNING id
)
INSERT INTO work_task_activity (task_id, actor_user_id, actor_name, kind)
SELECT id, 'de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c', 'Jaroslav Viner', 'created' FROM new_tasks;
