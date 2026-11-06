-- PILOTNÍ UŽIVATEL (jen čtení) — userId pro MCP_ALLOWED_USER_IDS a kontrola role.
-- Před spuštěním nahradit <E-MAIL> vlastním přihlašovacím e-mailem MojeBegina.
-- Očekáváno: právě 1 řádek, smi_asistenta = ano (role ADMIN nebo EXECUTIVE).
-- user_id NENÍ tajné — jde do Vercelu jako MCP_ALLOWED_USER_IDS.
SELECT
  p.user_id,
  p.name,
  string_agg(r.system_role, ', ' ORDER BY r.system_role) AS role,
  CASE WHEN bool_or(r.system_role IN ('ADMIN', 'EXECUTIVE')) THEN 'ano' ELSE 'NE' END AS smi_asistenta
FROM user_profiles p
LEFT JOIN user_roles r ON r.user_id = p.user_id
WHERE lower(p.email) = lower('<E-MAIL>')
GROUP BY p.user_id, p.name;
